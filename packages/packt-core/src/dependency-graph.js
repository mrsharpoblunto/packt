/**
 * @flow
 */
export type DependencyNodeImport = {|
  node: DependencyNode,
  symbols: Set<string>,
  type: 'static' | 'dynamic',
|};

export class DependencyNode {
  importedBy: { [key: string]: DependencyNode };
  imports: { [key: string]: DependencyNodeImport };
  importAliases: { [key: string]: DependencyNodeImport }; 
  exports: ExportDeclaration;
  module: string;
  contentType: ?string;
  contentHash: ?string;
  generatedAssets: { [key: string]: string };
  bundles: Set<string>;

  _symbolCache: { [key: string]: Array<string> };
  _importCache: { [key: string]: 'static' | 'dynamic' };

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
    this.contentHash = null;
    this.generatedAssets = {};
    this.bundles = new Set();

    this._symbolCache = {};
    this._importCache = {};
  }

  /**
   * This module imports another module, and some (or all of its exported symbols
   */
  importsNode(node: DependencyNode, imported: ImportDeclaration) {
    let i = this.imports[node.module];
    if (!i) {
      i = this.imports[node.module] = {
        node: node,
        symbols: new Set(),
        type: 'dynamic',
      };
    }
    this.importAliases[imported.source] = i;

    if (
      imported.type === 'dynamic' || 
      (imported.symbols.length === 1 && imported.symbols[0] === '*') 
    ) {
      if (i.symbols.size !== 1 || !i.symbols.has('*')) {
        i.symbols = new Set(['*']);
      }
    } else if (!i.symbols.has('*')) {
      for (let s of imported.symbols) {
        i.symbols.add(s); 
      }
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
    for (let key of bundles) {
      if (!this.bundles.has(key)) {
        this.bundles.add(key);
        difference.add(key);
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
    this._symbolCache = {};
    this._importCache = {};
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

  getImportTypeForBundle(bundleName: string): ('static' | 'dynamic') {
    let cached = this._importCache[bundleName];
    if (cached) {
      return cached;
    }

    let possiblyDynamic = false;
    for (let key in this.importedBy) {
      const importedBy = this.importedBy[key];
      if (importedBy.bundles.has(bundleName)) {
        const thisImport = importedBy.imports[this.module];
        if (thisImport.type === 'static') {
          this._importCache[bundleName] = 'static';
          return 'static';
        } else {
          possiblyDynamic = true;
        }
      }
    }
    // an import can only be dynamic if its never imported statically in the
    // current bundle. Any static imports override the other dynamic import
    cached = possiblyDynamic ? 'dynamic' : 'static';
    this._importCache[bundleName] = cached;
    return cached;
  }

  getUsedSymbolsForBundle(bundleName: string): Array<string> {
    let cached = this._symbolCache[bundleName];
    if (cached) {
      return cached;
    }

    const used = new Set();
    for (let key in this.importedBy) {
      const importedBy = this.importedBy[key];
      if (importedBy.bundles.has(bundleName)) {
        const symbols = importedBy.imports[this.module].symbols;
        if (symbols.has('*')) {
          this._symbolCache[bundleName] = ['*'];
          return ['*'];
        } else {
          for (let v of symbols) {
            used.add(v);
          }
        }
      }
    }
    const result = [];
    for (let v of used) {
      result.push(v);
    }
    this._symbolCache[bundleName] = result;
    return result;
  }

  serialize(content: string): SerializedModule {
    return {
      importAliases: Object.keys(this.importAliases).reduce((p,n) => {
        p[n] = this.importAliases[n].node.module;
        return p;
      },{}),
      resolvedModule: this.module,
      contentHash: this.contentHash || '',
      contentType: this.contentType || '',
      content,
    }
  }
}

// during parse, treat dynamic imports the same as static imports
// When doing bundle sort, determine if a bundle only is being included as a 
// dynamic import & if so build an additional asset.
export type DependencyVariant = {|
  lookups: { [key: string]: DependencyNode },
  identifiers: { [key: string]: ExportDeclaration },
  roots: { [key: string]: DependencyNode },
|};

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

  setContentMetadata(
    resolvedModule: string,
    variants: Array<string>,
    contentType: string,
    contentHash: string,
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      node.contentType = contentType;
      node.contentHash = contentHash;
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
    bundleName: string
  ) {
    for (let v of variants) {
      const variant = this._getVariant(v);
      const node = this._getNode(resolvedModule, variant);
      let root = variant.roots[resolvedModule];
      if (!root) {
        root = variant.roots[resolvedModule] = node;
      }
      root.bundles.add(bundleName);
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
      importedNode.importedByNode(node, imported.type);
    }
  }
}
