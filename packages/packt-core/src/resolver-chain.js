/**
 * @flow
 */
import events from 'events';
import path from 'path';
import type {
  MessageType,
} from './message-types';
import BuiltInResolver from './built-in-resolver';
import {
  PacktError
} from 'packt-types';

export default class ResolverChain extends events.EventEmitter {
  _resolvers: Array<Resolver>;
  _resolving: number;
  _resolvingQueue: Set<string>;
  _configFile: string;

  constructor(
    config: PacktConfig,
  ) {
    super();

    this._resolvers = (config.resolvers.custom || []).map(r => {
        return new (require(
          r.require
        ))(r.invariantOptions);
    });
    const resolverOptions =
      (config.resolvers.builtIn && config.resolvers.builtIn.invariantOptions)
        ? config.resolvers.builtIn.invariantOptions
        : BuiltInResolver.defaultOptions(config.workingDirectory);

    this._resolvers.push(((new BuiltInResolver(resolverOptions): any): Resolver));
    this._resolving = 0;
    this._resolvingQueue = new Set();
    this._configFile = config.configFile;
  }

  _emitMessage(message: MessageType) {
    this.emit('resolver_chain_message', message);
  }

  resolve(
    moduleName: string, 
    variants: Array<string>,
    context: {|
      importedByDeclaration?: ImportDeclaration,
      bundleName?: string,
    |},
    searchOptions: ?{|
      resolvedParentModule?: string, 
      expectFolder?: boolean, 
    |}
  ) {
    this._resolvingQueue.add(moduleName);
    ++this._resolving;
    const perfStats: { [key: string]: number } = {};
    const resolvedParentModule = 
      (searchOptions && searchOptions.resolvedParentModule) || 
      this._configFile;

    const tryResolve = (resolverIndex: number) => {
      const resolver = this._resolvers[resolverIndex];
      const start = Date.now();
      try {
        resolver.resolve(
          moduleName,
          resolvedParentModule,
          (!searchOptions || !!searchOptions.expectFolder),
          (err,resolved) => {
            const end = Date.now();
            perfStats['' + resolverIndex] = end - start;
            if (err) {
              --this._resolving;
              this._resolvingQueue.delete(moduleName);
              this._emitMessage({
                type: 'module_resolve_error',
                error: err,
              });
            } else if (!resolved) {
              if (++resolverIndex < this._resolvers.length) {
                tryResolve(resolverIndex);
              } else {
                --this._resolving;
                this._resolvingQueue.delete(moduleName);
                this._emitMessage({
                  type: 'module_resolve_error',
                  error: new Error(
                    'No resolvers left to resolve ' + moduleName +
                    ' (' + resolvedParentModule + ')'
                  ),
                });
              }
            } else {
              --this._resolving;
              this._resolvingQueue.delete(moduleName);
              this._emitMessage({
                type: 'module_resolved',
                perfStats,
                resolvedModule: resolved,
                variants,
                resolvedParentModuleOrBundle: 
                  (context.bundleName) 
                    ? context.bundleName 
                    : resolvedParentModule,
                importedByDeclaration: context.importedByDeclaration,
              });
            }
            if (!this._resolving) {
              this._emitMessage({ type: 'idle'});
            }
          }
        );
      } catch (ex) {
        const end = Date.now();
        perfStats['' + resolverIndex] = end - start;
        this._emitMessage({
          type: 'module_resolve_error',
          error: new PacktError(
            'Unexpected exception thrown in resolver ' + resolverIndex,
            ex
          ),
        });
      }
    }
    tryResolve(0);
  }

  idle(): boolean {
    return !this._resolving;
  }

}
