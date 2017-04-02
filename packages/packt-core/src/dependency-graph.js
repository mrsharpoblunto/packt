/**
 * @flow
 */
import type {
  ExportDeclaration,
  ImportDeclaration,
} from '../types';

export type DependencyNodeImport = {
  node: DependencyNode,
  symbols: Array<string>,
  type: 'static' | 'dynamic',
};

export class DependencyNode {
  importedBy: { [key: string]: DependencyNode };
  imports: { [key: string]: DependencyNodeImport };
  importAliases: { [key: string]: DependencyNodeImport }; 
  exports: ExportDeclaration;
  module: string;
  contentType: ?string;
  generatedAssets: { [key: string]: string };
  bundles: Set<string>;

  constructor(module: string) {
    this.module = module;
    this.importedBy = {};
    this.imports = {};
    this.importAliases = {};
    this.exports = {
      identifier: '',
      esModule: false,
      symbols: [],
    };
    this.contentType = null;
    this.generatedAssets = {};
    this.bundles = new Set();
  }

  /**
   * This module imports another module, and some (or all of its exported symbols
   */
  importsNode(node: DependencyNode, imported: ImportDeclaration) {
    let i = this.imports[node.module];
    if (!i) {
      i = this.imports[node.module] = {
        node: node,
        symbols: [],
        type: 'dynamic',
      };
    }
    this.importAliases[imported.source] = i;

    if (
      imported.type === 'dynamic' || 
      (imported.symbols.length === 1 && imported.symbols[0] === '*') 
    ) {
      i.symbols = ['*'];
    } else if (!i.symbols.length || i.symbols[0] !== '*') {
      i.symbols.push.apply(i.symbols, imported.symbols);
    }

    // if the same module via both static and dynamic means, the static
    // import effectively overrides the dynamic import as there is no
    // point downloading duplicated code if it already needs to be in a
    // static bundle
    if (imported.type === 'static') {
      i.type = 'static';
    }

    node.addBundles(this.bundles);
  }

  addBundles(bundles: Set<string>) {
    const difference: Set<string> = new Set(); 
    for (let bundle of bundles) {
      if (!this.bundles.has(bundle)) {
        this.bundles.add(bundle);
        difference.add(bundle);
      }
    }

    // recursively add the new bundles to all modules imported by this 
    // module
    if (difference.size) {
      for (let imported in this.imports) {
        this.imports[imported].node.addBundles(difference);
      }
    }
  }

  /**
   * a module requires this module, and some (or all of its exported symbols)
   */
  importedByNode(node: DependencyNode) {
    let importedBy = this.importedBy[node.module];
    if (!importedBy) {
      importedBy = this.importedBy[node.module] = node;
    }
  }

  exportsSymbols(exported: ExportDeclaration) {
    if (exported.symbols.length === 1 && exported.symbols[0] === '*') {
      this.exports.symbols = ['*'];
    } else if (this.exports.symbols !== '*') {
      this.exports.symbols.push.apply(
        this.exports.symbols,
        exported.symbols
      );
    }
    this.exports.identifier = exported.identifier;
    this.exports.esModule = exported.esModule;
  }

  getImportTypeForBundle(bundle: string): ('static' | 'dynamic') {
    // TODO compute from backreferences.
  }

  getUsedSymbolsForBundle(bundle: string): Array<string> {
    // TODO compute from backreferences.
  }
}

// during parse, treat dynamic imports the same as static imports
// When doing bundle sort, determine if a bundle only is being included as a 
// dynamic import & if so build an additional asset.
export type DependencyVariant = {
  lookups: { [key: string]: DependencyNode },
  identifiers: { [key: string]: ExportDeclaration },
  roots: { [key: string]: DependencyNode },
};

export class DependencyGraph {
  variants: { [key: string]: DependencyVariant };

  constructor() {
    this.variants = {};
  }

  _getVariant(variant: string): DependencyVariant {
    let v = this.variants[variant];
    if (!v) {
      v = this.variants[variant] = {
        lookups: {},
        identifiers: {},
        roots: {},
      };
    }
    return v;
  }

  _getNode(module: string, variant: DependencyVariant): DependencyNode {
    let node = variant.lookups[module];
    if (!node) {
      node = variant.lookups[module] = new DependencyNode(module);
    }
    return node;
  }

  exports(
    resolvedModule: string,
    variants: Array<string>,
    exported: ExportDeclaration,
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.exportsSymbols(exported);
    }
  }

  setContentType(
    resolvedModule: string,
    variants: Array<string>,
    contentType: string
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.contentType = contentType;
    }
  }

  addGenerated(
    resolvedModule: string,
    variants: Array<string>,
    assetName: string,
    outputPath: string
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.generatedAssets[assetName] = outputPath;
    }
  }

  bundleEntrypoint(
    resolvedModule: string,
    variants: Array<string>,
    bundle: string
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      let root = variant.roots[resolvedModule];
      if (!root) {
        root = variant.roots[resolvedModule] = node;
      }
      root.bundles.add(bundle);
    }
  }

  imports(
    resolvedModule: string,
    resolvedImportedModule: string,
    variants: Array<string>,
    imported: ImportDeclaration
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
