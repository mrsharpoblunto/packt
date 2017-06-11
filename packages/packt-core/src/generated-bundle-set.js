/**
 * @flow
 */
import { DependencyNode, DependencyGraph } from './dependency-graph';
import type { DependencyVariant } from './dependency-graph';
import path from 'path';
import { getOrCreate, objectMap } from './helpers';
import type { WorkingSet } from './working-set';
import type OutputPathHelpers from './output-path-helpers';

function sortBundle(modules: Set<DependencyNode>): Array<DependencyNode> {
  const sorted = [];
  const visited: Set<DependencyNode> = new Set();
  const tmp: Set<DependencyNode> = new Set();
  for (let m of modules) {
    if (!visit(m, modules, visited, tmp, false, sorted)) {
      throw new Error('cycle detected!');
    }
  }
  return sorted;
}

function visit(
  node: DependencyNode,
  whitelist: ?Set<DependencyNode>,
  visited: Set<DependencyNode>,
  tempVisited: Set<DependencyNode>,
  staticOnly: boolean,
  output: Array<DependencyNode>
): boolean {
  // when we sort, sometimes we want to ensure that
  // sorting doesn't pull in children of the selected nodes
  if (whitelist && !whitelist.has(node)) {
    return true;
  }
  if (tempVisited.has(node)) {
    return false;
  }
  if (!visited.has(node)) {
    tempVisited.add(node);
    for (let i in node.imports) {
      const imported = node.imports[i];
      if (!staticOnly || imported.type === 'static') {
        visit(
          imported.node,
          whitelist,
          visited,
          tempVisited,
          staticOnly,
          output
        );
      }
    }
    visited.add(node);
    tempVisited.delete(node);
    output.push(node);
  }
  return true;
}

export function generateBundleSets(
  graph: DependencyGraph,
  workingSet: WorkingSet,
  config: PacktConfig,
  outputPathHelpers: OutputPathHelpers
): { [variant: string]: GeneratedBundleSet } {
  return objectMap(
    graph.variants,
    (variant, variantName) =>
      new GeneratedBundleSet(
        variantName,
        variant,
        workingSet,
        config,
        outputPathHelpers
      )
  );
}

export type GeneratedBundleData = {|
  hash: string,
  paths: OutputPaths,
  type: 'static' | 'dynamic',
  modules: Array<DependencyNode>,
  usedSymbols: { [moduleName: string]: Array<string> }
|};

export class GeneratedBundleSet {
  _staticBundles: {
    [bundleName: string]: {
      hash: string,
      paths: OutputPaths,
      usedSymbols: { [moduleName: string]: Array<string> }
    }
  };
  _dynamicBundles: {
    [bundleName: string]: {
      hash: string,
      paths: OutputPaths,
      usedSymbols: { [moduleName: string]: Array<string> }
    }
  };
  _symbols: { [bundleName: string]: Map<DependencyNode, Set<string>> };
  _modules: { [bundleHash: string]: Array<DependencyNode> };
  _variant: string;
  _config: PacktConfig;
  _outputPathHelpers: OutputPathHelpers;
  _pendingBundles: { [bundleName: string]: Set<DependencyNode> };
  _pendingDynamicBundles: Array<{
    parentBundleName: string,
    rootModule: DependencyNode,
    modules: Set<DependencyNode>
  }>;

  constructor(
    variant: string,
    graphVariant: DependencyVariant,
    workingSet: WorkingSet,
    config: PacktConfig,
    outputPathHelpers: OutputPathHelpers
  ) {
    this._variant = variant;
    this._staticBundles = {};
    this._dynamicBundles = {};
    this._symbols = {};
    this._modules = {};
    this._config = config;
    this._outputPathHelpers = outputPathHelpers;

    this._generatePendingBundles(graphVariant, workingSet);
    this._extractDynamicBundles(graphVariant);
    this._extractCommonBundles();
    this._finalizeDynamicBundles();
    this._finalizeStaticBundles();
  }

  getStaticBundle(bundleName: string): GeneratedBundleData {
    const staticBundle = this._staticBundles[bundleName];
    return {
      hash: staticBundle.hash,
      paths: staticBundle.paths,
      type: 'static',
      modules: this._modules[staticBundle.hash],
      usedSymbols: staticBundle.usedSymbols
    };
  }

  getDynamicBundle(bundleName: string): GeneratedBundleData {
    const dynamicBundle = this._dynamicBundles[bundleName];
    return {
      hash: dynamicBundle.hash,
      paths: dynamicBundle.paths,
      type: 'dynamic',
      modules: this._modules[dynamicBundle.hash],
      usedSymbols: dynamicBundle.usedSymbols
    };
  }

  getStaticBundles(): { [bundleName: string]: GeneratedBundleData } {
    return objectMap(this._staticBundles, (value, bundleName) =>
      this.getStaticBundle(bundleName)
    );
  }

  getDynamicBundles(): { [bundleName: string]: GeneratedBundleData } {
    return objectMap(this._dynamicBundles, (value, bundleName) =>
      this.getDynamicBundle(bundleName)
    );
  }

  getBundles(): { [bundleName: string]: GeneratedBundleData } {
    return {
      ...this.getStaticBundles(),
      ...this.getDynamicBundles()
    };
  }

  _generatePendingBundles(
    graphVariant: DependencyVariant,
    workingSet: WorkingSet
  ) {
    this._pendingBundles = {};
    for (let moduleName in graphVariant.lookups) {
      const module = graphVariant.lookups[moduleName];
      const moduleBundles = this._getModuleBundles(module, workingSet);

      for (let bundleName of moduleBundles) {
        const symbolMap = getOrCreate(
          this._symbols,
          bundleName,
          () => new Map()
        );
        if (!symbolMap.has(module)) {
          symbolMap.set(module, module.getUsedSymbolsForBundle(bundleName));
        }
        const pendingBundle = getOrCreate(
          this._pendingBundles,
          bundleName,
          () => new Set()
        );
        pendingBundle.add(module);
      }
    }
  }

  _getModuleBundles(
    module: DependencyNode,
    workingSet: WorkingSet
  ): Array<string> {
    const bundles: Array<string> = [];
    for (let b in workingSet.bundles) {
      // if this module isn't in this working set bundle, ignore it
      if (!module.bundles.has(b)) {
        continue;
      }

      // if this module exists in a libary bundle that this entrypoint bundle
      // depends on, then this module should be externalized into the library
      // bundle and left out of this one
      const bundleConfig = this._config.bundles[b];
      if (
        bundleConfig.type === 'entrypoint' &&
        Object.keys(bundleConfig.depends).length
      ) {
        let isExternal = false;
        for (let db of module.bundles) {
          if (bundleConfig.depends[db]) {
            this._mergeSymbols(b, db, module);
            isExternal = true;
            break;
          }
        }
        if (isExternal) {
          continue;
        }
      }

      bundles.push(b);
    }
    return bundles;
  }

  _extractDynamicBundles(graphVariant: DependencyVariant) {
    this._pendingDynamicBundles = [];
    const tmp: Set<DependencyNode> = new Set();
    for (let bundleName in this._pendingBundles) {
      const pendingBundle = this._pendingBundles[bundleName];
      const bundleConfig = this._config.bundles[bundleName];
      const extracted: Array<DependencyNode> = [];

      let staticVisited: ?Set<DependencyNode> = null;
      const isStaticallyImported = (node: DependencyNode): boolean => {
        if (!staticVisited) {
          staticVisited = new Set();
          const roots = graphVariant.roots[bundleName];
          for (let m of roots) {
            if (!visit(m, null, staticVisited, tmp, true, [])) {
              throw new Error('cycle detected!');
            }
          }
        }
        return staticVisited.has(node);
      };

      for (let module of pendingBundle) {
        if (
          module.getImportTypeForBundle(bundleName) === 'dynamic' &&
          !graphVariant.roots[bundleName].has(module)
        ) {
          // get the subtree of dependencies from this dynamic import
          const visited: Set<DependencyNode> = new Set();
          const possibleDynamicModules: Array<DependencyNode> = [];
          const modules: Set<DependencyNode> = new Set();
          if (
            !visit(module, null, visited, tmp, true, possibleDynamicModules)
          ) {
            throw new Error('cycle detected');
          }

          for (let possibleModule of possibleDynamicModules) {
            if (!isStaticallyImported(possibleModule)) {
              // if no static import from the root of the bundle imports this,
              // then add it to the dynamic bundle
              modules.add(possibleModule);
              extracted.push(possibleModule);
            } else if (bundleConfig.dynamicChildren.preserveDuplicates) {
              // if it is statically imported from the root of the bundle, we may still
              // want to include it in the bundle, but only if this bundle is configured
              // to preserve duplicates - in which case we will include it in the dynamic
              // bundle, but not extract it from the parent bundle
              modules.add(possibleModule);
            }
          }

          this._pendingDynamicBundles.push({
            parentBundleName: bundleName,
            rootModule: module,
            modules
          });
        }
      }
      for (let module of extracted) {
        pendingBundle.delete(module);
      }
    }
  }

  _extractCommonBundles() {
    const alreadyChecked: { [key: string]: boolean } = {};
    const pendingBundleNames = Object.keys(this._pendingBundles);
    for (let bundleName of pendingBundleNames) {
      const bundleConfig = this._config.bundles[bundleName];
      if (!bundleConfig.commons) {
        continue;
      }

      const pendingBundle = this._pendingBundles[bundleName];
      const extracted: Array<DependencyNode> = [];

      for (let module: DependencyNode of pendingBundle) {
        // if it does have a common bundle, then we need to see if this module
        // passes the content type check for a common bundle
        for (let common: string in bundleConfig.commons) {
          if (alreadyChecked[common + ':' + module.module]) {
            continue;
          }

          const commonConfig = this._config.bundles[common];
          const commonBundle = getOrCreate(
            this._pendingBundles,
            common,
            () => new Set()
          );
          if (
            !Object.keys(commonConfig.contentTypes).length ||
            (module.contentType &&
              commonConfig.contentTypes[module.contentType])
          ) {
            // if it passes the content type check, then we see how often this module
            // appears in other bundles that share this same commons dependency
            const dependedBy = Object.keys(commonConfig.dependedBy);
            const frequency = dependedBy.reduce((prev, next) => {
              const dependentBundle = this._pendingBundles[next];
              return dependentBundle.has(module) ? prev + 1 : prev;
            }, 0);
            // if it appears in these modules above the configured frequency threshold
            // then extract it from these modules into the common bundle
            if (frequency / dependedBy.length >= commonConfig.threshold) {
              commonBundle.add(module);
              for (let dependentBundleName in commonConfig.dependedBy) {
                this._mergeSymbols(dependentBundleName, common, module);
                if (dependentBundleName !== bundleName) {
                  this._pendingBundles[dependentBundleName].delete(module);
                } else {
                  extracted.push(module);
                }
              }
            }
            break;
          }
          alreadyChecked[common + ':' + module.module] = true;
        }
      }
      for (let module of extracted) {
        pendingBundle.delete(module);
      }
    }
  }

  _mergeSymbols(fromBundle: string, toBundle: string, module: DependencyNode) {
    // take the symbols in from & merge them into the symbols for to.
    // if either from or to contains '*', then the result becomes '*'
    const fromMap = getOrCreate(this._symbols, fromBundle, () => new Map());
    const toMap = getOrCreate(this._symbols, toBundle, () => new Map());

    let fromSymbolSet = fromMap.get(module);
    if (!fromSymbolSet) {
      fromSymbolSet = module.getUsedSymbolsForBundle(fromBundle);
      fromMap.set(module, fromSymbolSet);
    }

    let toSymbolSet = toMap.get(module);
    if (!toSymbolSet) {
      toSymbolSet = module.getUsedSymbolsForBundle(toBundle);
      toMap.set(module, toSymbolSet);
    }

    if (fromSymbolSet.has('*')) {
      if (!toSymbolSet.has('*')) {
        toMap.set(module, new Set(['*']));
      }
      return;
    }

    if (!toSymbolSet.has('*')) {
      for (let f of fromSymbolSet) {
        toSymbolSet.add(f);
      }
    }
  }

  _finalizeDynamicBundles() {
    for (let bundle of this._pendingDynamicBundles) {
      const bundleConfig = this._config.bundles[bundle.parentBundleName];
      // if any module in this dynamic bundle also exists in this
      // parent bundles common set, we should remove it from the
      // dynamic bundle
      for (let common in bundleConfig.commons) {
        const commonModules = this._pendingBundles[common];
        if (commonModules) {
          for (let module of commonModules) {
            if (bundle.modules.has(module)) {
              bundle.modules.delete(module);
            }
          }
        }
      }

      const modules: Array<DependencyNode> = Array.from(bundle.modules);
      const { hash, usedSymbols } = this._getHashAndUsedSymbols(
        bundle.parentBundleName,
        modules
      );
      const paths = this._outputPathHelpers.getBundlerDynamicOutputPaths(
        bundle.parentBundleName + '_' + path.basename(bundle.rootModule.module),
        hash,
        bundleConfig.bundler,
        this._variant
      );

      // calculate the bundle hash and add the modules to the final dynamic bundle.
      // They're already in the right order as visit sorts them for us
      this._dynamicBundles[
        bundle.parentBundleName + ':' + bundle.rootModule.module
      ] = {
        paths,
        hash,
        usedSymbols
      };
      this._modules[hash] = modules;
    }
    this._pendingDynamicBundles = [];
  }

  _finalizeStaticBundles() {
    for (let bundleName in this._pendingBundles) {
      const pendingBundle = this._pendingBundles[bundleName];
      const bundleConfig = this._config.bundles[bundleName];
      const modules = sortBundle(pendingBundle);
      const { hash, usedSymbols } = this._getHashAndUsedSymbols(
        bundleName,
        modules
      );
      const paths = this._outputPathHelpers.getBundlerStaticOutputPaths(
        bundleName,
        hash,
        bundleConfig.bundler,
        this._variant
      );

      this._staticBundles[bundleName] = {
        hash,
        paths,
        usedSymbols
      };
      this._modules[hash] = modules;
    }
    this._pendingBundles = {};
    this._symbols = {};
  }

  _getHashAndUsedSymbols(
    bundleName: string,
    modules: Array<DependencyNode>
  ): {
    hash: string,
    usedSymbols: { [moduleName: string]: Array<string> }
  } {
    const usedSymbols: { [moduleName: string]: Array<string> } = {};

    let hashComponents = '';
    for (let module of modules) {
      const symbolSet = this._symbols[bundleName].get(module);
      const symbols = symbolSet ? Array.from(symbolSet) : [];
      symbols.sort();
      usedSymbols[module.module] = symbols;
      hashComponents += module.contentHash || '';
      hashComponents += symbols.join(',');
    }

    return {
      hash: this._outputPathHelpers.generateHash(hashComponents),
      usedSymbols
    };
  }
}
