/**
 * @flow
 */
import {
  DependencyNode,
  DependencyGraph,
} from './dependency-graph';
import type {DependencyVariant} from './dependency-graph';
import path from 'path';
import {
  getOrCreate,
  objectMap,
} from './helpers';
import type {WorkingSet} from './working-set';
import type OutputPathHelpers from './output-path-helpers';

function sortBundle(
  modules: Set<DependencyNode>,
): Array<DependencyNode> {
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
  output: Array<DependencyNode>,
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
        visit(imported.node, whitelist, visited, tempVisited, staticOnly, output);
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
  return objectMap(graph.variants, (variant, variantName) => new GeneratedBundleSet(
    variantName,
    variant,
    workingSet,
    config,
    outputPathHelpers
  ));
} 

export type GeneratedBundleData = {|
  hash: string,
  paths: OutputPaths,
  type: 'static' | 'dynamic',
  modules: Array<DependencyNode>,
|};

export class GeneratedBundleSet {
  _staticBundles: { [bundleName: string]: {
    hash: string,
    paths: OutputPaths,
  }};
  _dynamicBundles: { [bundleName: string]: {
    hash: string,
    paths: OutputPaths,
  }};
  _modules: { [bundleHash: string]: Array<DependencyNode> };
  _variant: string;
  _config: PacktConfig;
  _outputPathHelpers: OutputPathHelpers;
  _pendingBundles: { [bundleName: string]: Set<DependencyNode> };

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
    this._modules = {};
    this._config = config;
    this._outputPathHelpers = outputPathHelpers;

    this._generatePendingBundles(
      graphVariant, 
      workingSet
    );
    this._extractDynamicBundles(graphVariant);
    this._extractCommonBundles();
    this._finalizeStaticBundles();
  }

  getStaticBundle(bundleName: string): GeneratedBundleData {
    const staticBundle = this._staticBundles[bundleName];
    return {
      hash: staticBundle.hash,
      paths: staticBundle.paths,
      type: 'static',
      modules: this._modules[staticBundle.hash],
    };
  }

  getDynamicBundle(bundleName: string): GeneratedBundleData {
    const dynamicBundle = this._dynamicBundles[bundleName];
    return {
      hash: dynamicBundle.hash,
      paths: dynamicBundle.paths,
      type: 'dynamic',
      modules: this._modules[dynamicBundle.hash],
    };
  }

  getStaticBundles(): { [bundleName: string]: GeneratedBundleData } {
    return objectMap(this._staticBundles, (value, bundleName) => this.getStaticBundle(bundleName));
  }

  getDynamicBundles(): { [bundleName: string]: GeneratedBundleData } {
    return objectMap(this._dynamicBundles, (value, bundleName) => this.getDynamicBundle(bundleName));
  }

  getBundles(): { [bundleName: string]: GeneratedBundleData } {
    return {
      ...this.getStaticBundles(),
      ...this.getDynamicBundles(),
    };
  }

  _generatePendingBundles(
    graphVariant: DependencyVariant,
    workingSet: WorkingSet,
  ) {
    this._pendingBundles = {};
    for (let moduleName in graphVariant.lookups) {
      const module = graphVariant.lookups[moduleName];
      const moduleBundles = this._getModuleBundles(
        module,
        workingSet,
      );

      for (let bundleName of moduleBundles) {
        const pendingBundle = getOrCreate(this._pendingBundles, bundleName, () => new Set());
        pendingBundle.add(module);
      }
    }
  }

  _getModuleBundles(
    module: DependencyNode,
    workingSet: WorkingSet,
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
      if (bundleConfig.type === 'entrypoint' && Object.keys(bundleConfig.depends).length) {
        let isExternal = false;
        for (let b of module.bundles) {
          if (bundleConfig.depends[b]) {
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

  _extractDynamicBundles(
    graphVariant: DependencyVariant,
  ) {
    const tmp: Set<DependencyNode> = new Set();
    for (let bundleName in this._pendingBundles) {
      const pendingBundle = this._pendingBundles[bundleName];
      const bundleConfig = this._config.bundles[bundleName];
      const extracted: Array<DependencyNode> = [];

      let staticVisited: ?Set<DependencyNode> = null;
      const isStaticallyImported = (node: DependencyNode):boolean => {
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
      }

      for (let module of pendingBundle) {
        if (module.getImportTypeForBundle(bundleName) === 'dynamic') {
          // get the subtree of dependencies from this dynamic import
          const visited: Set<DependencyNode> = new Set();
          const possibleDynamicModules: Array<DependencyNode> = [];
          const modules: Array<DependencyNode> = [];
          if (!visit(module, null, visited, tmp, true, possibleDynamicModules)) {
            throw new Error('cycle detected');
          }

          for (let possibleModule of possibleDynamicModules) {
            // if no static import from the root of the bundle imports this,
            // then add it to the dynamic bundle
            if (!isStaticallyImported(possibleModule)) {
              modules.push(possibleModule);
              extracted.push(possibleModule);
            }
          }

          // calculate the bundle hash and add the modules to the final dynamic bundle.
          // They're already in the right order as visit sorts them for us
          const hash = this._outputPathHelpers.generateHash(
            modules.reduce((result, module) => result + (module.contentHash || ''), '')
          );

          this._dynamicBundles[bundleName + ':' + module.module] = {
            hash,
            paths: this._outputPathHelpers.getBundlerDynamicOutputPaths(
              bundleName + '_' + path.basename(module.module),
              hash,
              bundleConfig.bundler,
              this._variant
            ),
          };
          this._modules[hash] = modules;
        }
      }
      for (let module of extracted) {
        pendingBundle.delete(module);
      }
    }
  }

  _extractCommonBundles() {
    const alreadyChecked: { [key: string]: boolean }  = {};
    const pendingBundleNames = Object.keys(this._pendingBundles);
    for (let bundleName of pendingBundleNames) {
      const bundleConfig = this._config.bundles[bundleName];
      if (!bundleConfig.commons) {
        continue;
      }

      const pendingBundle = this._pendingBundles[bundleName];
      const extracted: Array<DependencyNode> = [];

      for (let module of pendingBundle) {
        // if it does have a common bundle, then we need to see if this module
        // passes the content type check for a common bundle
        for (let common in bundleConfig.commons) {
          if (alreadyChecked[common + ':' + module.module]) {
            continue;
          }

          const commonConfig = this._config.bundles[common];
          const commonBundle = getOrCreate(this._pendingBundles, common, () => new Set());
          if (
            !Object.keys(commonConfig.contentTypes).length ||
            (
              module.contentType && 
              commonConfig.contentTypes[module.contentType]
            )
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

  _finalizeStaticBundles() {
    for (let bundleName in this._pendingBundles) {
      const pendingBundle = this._pendingBundles[bundleName];
      const bundleConfig = this._config.bundles[bundleName];
      const modules = sortBundle(pendingBundle);
      const hash = this._outputPathHelpers.generateHash(
        modules.reduce((result, module) => result + (module.contentHash || ''), '')
      );
      const paths = this._outputPathHelpers.getBundlerStaticOutputPaths(
        bundleName,
        hash,
        bundleConfig.bundler,
        this._variant,
      );

      this._staticBundles[bundleName] = {
        hash,
        paths,
      }
      this._modules[hash] = modules;
    }
    this._pendingBundles = {};
  }
}
