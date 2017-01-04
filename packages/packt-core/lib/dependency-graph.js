'use strict';


class DependencyNode {
  constructor(module) {
    this.importedBy = {};
    this.imports = {};
    this.importAliases = {};
    this.exportsSymbols = [];
    this.exportsIdentifier = '';
    this.module = module;
  }

  /**
   * This module imports another module, and some (or all of its exported symbols
   */
  importsNode(node, imported) {
    let i = this.imports[node.module];
    if (!i) {
      i = this.imports[node.module] = {
        node: node,
        symbols: [],
      };
    }
    this.importAliases[imported.source] = i;

    if (imported.symbols.length === 1 && imported.symbols[0] === '*') {
      i.symbols = ['*'];
    } else if (!i.symbols.length || i.symbols[0] !== '*') {
      i.symbols.push.apply(i.symbols, imported.symbols);
    }
  }

  /**
   * a module requires this module, and some (or all of its exported symbols)
   */
  importedByNode(node) {
    let importedBy = this.importedBy[node.module];
    if (!importedBy) {
      importedBy = this.importedBy[node.module] = node;
    }
  }

  exports(exported) {
    if (exported.symbols.length === 1 && exported.symbols[0] === '*') {
      this.exportsSymbols = ['*'];
    } else if (this.exportedSymbols !== '*') {
      this.exportsSymbols.push.apply(
        this.exportsSymbols, 
        exported.symbols
      );
    }
    this.exportsIdentifier = exported.identifier;
  }
}

class DependencyGraph {
  constructor() {
    this._variants = {};
  }

  _getVariant(variant) {
    let v = this._variants[variant];
    if (!v) {
      v = this._variants[variant] = {
        lookups: {},
        roots: {},
      };
    }
    return v;
  }

  _getNode(module, variant) {
    let node = variant.lookups[module];
    if (!node) {
      node = variant.lookups[module] = new DependencyNode(module);
    }
    return node;
  }

  exports(
    resolvedModule,
    variants,
    exported
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.exports(exported);
    }
  }

  entrypoint(
    resolvedModule,
    variants
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      variant.roots[resolvedModule] = node;
    }
  }

  imports(
    resolvedModule,
    resolvedImportedModule,
    variants,
    imported
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      const importedNode = this._getNode(resolvedImportedModule, variant);
      node.importsNode(importedNode, imported);
      importedNode.importedByNode(node);
    }
  }
}

module.exports = DependencyGraph;
