'use strict';

const EventEmitter = require('events').EventEmitter;
const path = require('path');

const messageTypes = require('./message-types');
const DefaultResolver = require('./default-resolver');

class ResolverChain extends EventEmitter {
  constructor(resolvers) {
    super();

    this._resolvers = (resolvers.custom || []).map(r => {
        return new (require(
          r.require
        ))(r.options);
    });
    const resolverOptions =
      (resolvers.default && resolvers.default.options) ?
        resolvers.default.options : DefaultResolver.defaultOptions;

    this._resolvers.push(new DefaultResolver(resolverOptions));
    this._resolving = 0;
    this._resolvingQueue = {};
  }

  resolve(module,resolvedParentModule) {
    this._resolvingQueue[module] = true;
    ++this._resolving;
    const perfStats = {};

    const tryResolve = (resolverIndex) => {
      const resolver = this._resolvers[resolverIndex];
      const start = Date.now();
      resolver.resolve(module,resolvedParentModule,(err,resolved) => {
        const end = Date.now();
        perfStats[resolverIndex] = end - start;
        if (err) {
          --this._resolving;
          delete this._resolvingQueue[module];
          this.emit(messageTypes.RESOLVED_ERROR,{
            error: err,
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
                'Unable to resolve ' + unresolved +
                (context ? (' (' + context + ')') : '')
              ),
              perfStats: perfStats,
            });
          }
        } else {
          --this._resolving;
          delete this._resolvingQueue[module];
          this.emit(messageTypes.RESOLVED, {
            resolved: resolved,
            perfStats: perfStats,
          });
        }
      });
    }
    tryResolve(0);
  }

  idle() {
    return this._resolving === 0;
  }

}

module.exports = ResolverChain;
