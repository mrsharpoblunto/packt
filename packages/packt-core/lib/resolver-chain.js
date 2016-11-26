'use strict';

const EventEmitter = require('events').EventEmitter;
const path = require('path');

const messageTypes = require('./message-types');
const DefaultResolver = require('./default-resolver');
const errors = require('./packt-errors');

class ResolverChain extends EventEmitter {
  constructor(resolvers) {
    super();

    this._resolvers = (resolvers.custom || []).map(r => {
        return new (require(
          r.require
        ))(r.invariantOptions);
    });
    const resolverOptions =
      (resolvers.default && resolvers.default.invariantOptions) ?
        resolvers.default.invariantOptions : DefaultResolver.defaultOptions;

    this._resolvers.push(new DefaultResolver(resolverOptions));
    this._resolving = 0;
    this._resolvingQueue = {};
  }

  resolve(module,resolvedParentModule, context) {
    this._resolvingQueue[module] = true;
    ++this._resolving;
    const perfStats = {};

    const tryResolve = (resolverIndex) => {
      const resolver = this._resolvers[resolverIndex];
      const start = Date.now();
      try {
        resolver.resolve(module,resolvedParentModule,(err,resolved) => {
          const end = Date.now();
          perfStats[resolverIndex] = end - start;
          if (err) {
            --this._resolving;
            delete this._resolvingQueue[module];
            this.emit(messageTypes.RESOLVED_ERROR,{
              error: err,
              context: context,
              perfStats: perfStats,
            });
          } else if (!resolved) {
            if (++resolverIndex < this._resolvers.length) {
              tryResolve(resolverIndex);
            } else {
              --this._resolving;
              delete this._resolvingQueue[module];
              this.emit(messageTypes.RESOLVED_ERROR, {
                error: new Error(
                  'No resolvers left to resolve ' + unresolved + 
                  (context ? (' (' + context + ')') : '')
                ),
                context: context,
                perfStats: perfStats,
              });
            }
          } else {
            --this._resolving;
            delete this._resolvingQueue[module];
            this.emit(messageTypes.RESOLVED, {
              resolved: resolved,
              context: context,
              perfStats: perfStats,
            });
          }
          if (!this._resolving) {
            this.emit(messageTypes.IDLE);
          }
        });
      } catch (ex) {
        const end = Date.now();
        perfStats[resolverIndex] = end - start;
        this.emit(messageTypes.RESOLVED_ERROR,{
          error: new errors.PacktError(
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

module.exports = ResolverChain;
