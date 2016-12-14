'use strict';


class DependencyNode {
  constructor(module) {
    this._requiredBy = {};
    this._requires = {};
    this.module = module;
    this.importedSymbols = [];
  }

  /**
   * This module requires another module, and some (or all of its exported symbols
   */
  requires(node,symbols) {
    let requires = this._requires[node.module];
    if (!requires) {
      requires = this._requires[node.module] = node;
    }
    if (symbols === '*') {
      node.importedSymbols = '*';
    } else if (node.importedSymbols !== '*') {
      Object.assign(
        node.importedSymbols,
        symbols.reduce((next, prev) => {
          prev[next] = true;
          return prev;
        },{})
      );
    }
  }

  /**
   * a module requires this module, and some (or all of its exported symbols)
   */
  requiredBy(node,symbols) {
    let requiredBy = this._requiredBy[node.module];
    if (!requiredBy) {
      requiredBy = this._requiredBy[node.module] = node;
    }
    if (symbols === '*') {
      this.importedSymbols = '*';
    } else {
      Object.assign(
        this.importedSymbols,
        symbols.reduce((next, prev) => {
          prev[next] = true;
          return prev;
        },{})
      );
    }
  }
}

class DependencyGraph {
  constructor() {
    this._bundles = {};
  }

  addDependency(module, parentModule, variants, bundle) {
    let bundleTree = this._bundles[bundle];
    if (!bundleTree) {
      bundleTree = this._bundles[bundle] = {};
    }

    for (let variant of variants) {
      let bundleVariant = bundleTree[variant];
      if (!bundleVariant) {
        bundleVariant = bundleTree[variant] = {
          lookups: {},
          root: {},
        };
      }


      let childNode = bundleVariant.lookups[module];
      if (!childNode) {
        childNode = bundleVariant.lookups[module] = new DependencyNode(module);
      }

      if (parentModule) {
        let parentNode = bundleVariant.lookups[parentModule];
        if (!parentNode) {
          parentNode = bundleVariant.lookups[parentModule] = new DependencyNode(parentModule);
        }
        // TODO record actual symbols used in order to treeshake later
        childNode.requiredBy(parentNode,'*');
        parentNode.requires(childNode,'*');
      } else {
        bundleVariant.root[module] = childNode;
      }
    }
  }
}

module.exports = DependencyGraph;
