/**
 * @flow
 */
import events from 'events';
import path from 'path';
import type {
  PacktConfigResolvers,
  Resolver,
} from '../types';
import BuiltInResolver from './built-in-resolver';
import {
  PacktError
} from './packt-errors';

export default class ResolverChain extends events.EventEmitter {
  _resolvers: Array<Resolver>;
  _resolving: number;
  _resolvingQueue: Set<string>;

  constructor(
    workingDirectory: string,
    resolvers: PacktConfigResolvers
  ) {
    super();

    this._resolvers = (resolvers.custom || []).map(r => {
        return new (require(
          r.require
        ))(r.invariantOptions);
    });
    const resolverOptions =
      (resolvers.builtIn && resolvers.builtIn.invariantOptions)
        ? resolvers.builtIn.invariantOptions
        : BuiltInResolver.defaultOptions(workingDirectory);

    this._resolvers.push(((new BuiltInResolver(resolverOptions): any): Resolver));
    this._resolving = 0;
    this._resolvingQueue = new Set();
  }

  resolve(
    moduleName: string, 
    resolvedParentModule: string, 
    expectFolder: boolean, 
    context: any,
  ) {
    this._resolvingQueue.add(moduleName);
    ++this._resolving;
    const perfStats = {};

    const tryResolve = (resolverIndex) => {
      const resolver = this._resolvers[resolverIndex];
      const start = Date.now();
      try {
        resolver.resolve(
          moduleName,
          resolvedParentModule,
          expectFolder,
          (err,resolved) => {
            const end = Date.now();
            perfStats[resolverIndex] = end - start;
            if (err) {
              --this._resolving;
              this._resolvingQueue.delete(moduleName);
              this.emit('resolved_error',{
                error: err,
                moduleName: moduleName,
                context: context,
                perfStats: perfStats,
              });
            } else if (!resolved) {
              if (++resolverIndex < this._resolvers.length) {
                tryResolve(resolverIndex);
              } else {
                --this._resolving;
              this._resolvingQueue.delete(moduleName);
              this.emit('resolved_error', {
                  error: new Error(
                    'No resolvers left to resolve ' + moduleName +
                    (context ? (' (' + context + ')') : '')
                  ),
                  moduleName: moduleName,
                  context: context,
                  perfStats: perfStats,
                });
              }
            } else {
              --this._resolving;
              this._resolvingQueue.delete(moduleName);
              this.emit('resolved', {
                moduleName: moduleName,
                resolvedModule: resolved,
                resolvedParentModule: resolvedParentModule,
                context: context,
                perfStats: perfStats,
              });
            }
            if (!this._resolving) {
              this.emit('idle');
            }
          }
        );
      } catch (ex) {
        const end = Date.now();
        perfStats[resolverIndex] = end - start;
        this.emit('resolved_error', {
          error: new PacktError(
            'Unexpected exception thrown in resolver ' + resolverIndex,
            ex
          ),
          context: context,
          perfStats: perfStats,
        });
      }
    }
    tryResolve(0);
  }

  idle() {
    return !this._resolving;
  }

}
