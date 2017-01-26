'use strict';

class DependencyNode {
  constructor(module) {
    this.importedBy = {};
    this.imports = {};
    this.importAliases = {};
    this.exportsSymbols = [];
    this.exportsIdentifier = '';
    this.exportsEsModule = false;
    this.module = module;
    this.metadata = {};
    this.contentType = null;
    this.generatedAssets = {};
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
    this.exportsEsModule = exported.esModule;
  }
}

class DependencyGraph {
  constructor() {
    this.variants = {};
  }

  _getVariant(variant) {
    let v = this.variants[variant];
    if (!v) {
      v = this.variants[variant] = {
        lookups: {},
        roots: {},
        usages: {},
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

  setContentType(
    resolvedModule,
    variants,
    contentType
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.contentType = contentType;
    }
  }

  addGenerated(
    resolvedModule,
    variants,
    assetName,
    outputPath
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.generatedAssets[assetName] = outputPath;
    }
  }

  entrypoint(
    resolvedModule,
    variants,
    bundle
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      let root = variant.roots[resolvedModule];
      if (!root) {
        root = variant.roots[resolvedModule] = {
          bundles: {},
          module: node,
        };
      }
      root.bundles[bundle] = true;
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

  resetMetadata() {
    for (let v in this.variants) {
      const variant = this.variants[v];
      for (let l in variant.lookups) {
        const node = variant.lookups[l];
        node.metadata = {};
      }
    }
  }
}

module.exports = DependencyGraph;
