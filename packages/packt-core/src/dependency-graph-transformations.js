/**
 * @flow
 */
import {
  DependencyNode,
  DependencyGraph,
} from './dependency-graph';
import path from 'path';
import type {WorkingSet} from './working-set';
import type OutputPathHelpers from './output-path-helpers';

export type GeneratedStaticBundles = {
  [key: string]: { // variants
    [key: string]: Array<DependencyNode>,
  }
};

export function generateStaticBundlesFromWorkingSet(
  graph: DependencyGraph,
  workingSet: WorkingSet,
  config: PacktConfig
): GeneratedStaticBundles {
  const result: GeneratedStaticBundles = {};
 
  for (let v in graph.variants) {
    const variant = graph.variants[v];
    const variantGen = result[v] = {};

    for (let r in variant.lookups) {
      const module = variant.lookups[r];
      const moduleBundles = getModuleBundles(
        module,
        workingSet,
        config
      );

      for (let b of moduleBundles) {
        let bundleGen = variantGen[b];
        if (!bundleGen) {
          bundleGen = variantGen[b] = [];
          (bundleGen: any).lookupSet = new Set();
        }
        bundleGen.push(module);
        (bundleGen: any).lookupSet.add(module);
      }
    }

    for (let b in variantGen) {
      variantGen[b] = sortBundle(variantGen[b], variantGen[b].lookupSet);
    }
  }
  return result;

}

function getModuleBundles(
  module: DependencyNode,
  workingSet: WorkingSet,
  config: PacktConfig
): Array<string> {
  const bundles: Array<string> = [];
  const occurances: Map<string, Array<string>> = new Map();
  for (let b in workingSet.bundles) {
    // if this module isn't in this working set bundle, ignore it
    if (!module.bundles.has(b)) {
      continue;
    }

    const bundleConfig = config.bundles[b];

    // if this module exists in a libary bundle that this entrypoint bundle
    // depends on, then this module should be externalized into the library
    // bundle and left out of this one
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

    // if the module is in one of the working set bundles and that bundle
    // has no common bundle, then this module is going to go in the working
    // set bundle
    let common = null;
    if (bundleConfig.commons) {
      // if it does have a common bundle, then we need to see if this module
      // passes the content type check for a common bundle
      for (let c in bundleConfig.commons) {
        const commonConfig = config.bundles[c];
        if (
          !Object.keys(commonConfig.contentTypes).length ||
          (
            module.contentType && 
            commonConfig.contentTypes[module.contentType]
          )
        ) {
          common = c;
          break;
        }
      }
    }
    if (!common) {
      bundles.push(b);
      continue;
    }

    // if it passes the content type check, then we add this module as a 
    // possible member of the common module
    let frequency = occurances.get(common);
    if (!frequency) {
      occurances.set(common, [b]);
    } else {
      frequency.push(b);
    }
  }

  for (let [key,value] of occurances) {
    const commonConfig = config.bundles[key];
    // if the module appeared in enough individual bundles, then it should
    // go in the common bundle
    if ((value.length / Object.keys(commonConfig.dependedBy).length) >= commonConfig.threshold) {
      bundles.push(key);
    } else {
      // otherwise it should stay individually in all the bundles it appears in
      bundles.push.apply(bundles,value);
    }
  }
  return bundles;
}

function sortBundle(
  modules: Array<DependencyNode>,
  moduleSet: Set<DependencyNode>
): Array<DependencyNode> {
  const sorted = [];
  const visited: Set<DependencyNode> = new Set();
  const tmp: Set<DependencyNode> = new Set();
  for (let m of modules) {
    if (!visit(m, moduleSet, visited, tmp, sorted, false)) {
      throw new Error('cycle detected!');
    }
  }
  return sorted;
}

function visit(
  node: DependencyNode, 
  moduleSet: ?Set<DependencyNode>,
  visited: Set<DependencyNode>,
  tempVisited: Set<DependencyNode>,
  output: Array<DependencyNode>,
  staticOnly: boolean,
): boolean {
  if (moduleSet && !moduleSet.has(node)) {
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
        visit(imported.node, moduleSet, visited, tempVisited, output, staticOnly);
      }
    }
    visited.add(node);
    tempVisited.delete(node);
    output.push(node);
  }
  return true;
}

export type GeneratedBundles = {|
  staticBundleMap: { [key: string]: {
    hash: string,
    paths: OutputPaths,
  }},
  dynamicBundleMap: { [key: string]: {
    hash: string,
    paths: OutputPaths,
  }},
  staticBundles: { [key: string]: Array<DependencyNode> },
  dynamicBundles: { [key: string]: Array<DependencyNode> },
|};

export function splitDynamicBundles(
  bundleName: string,
  variant: string,
  modules: Array<DependencyNode>,
  packtConfig: PacktConfig,
  outputPathHelpers: OutputPathHelpers,
  output: GeneratedBundles
) {
  const tmp: Set<DependencyNode> = new Set();
  const remaining: Set<DependencyNode> = new Set(modules);
  const bundler = packtConfig.bundles[bundleName].bundler;

  for (let module of modules) {
    if (module.getImportTypeForBundle(bundleName) === 'dynamic') {
      // get the subtree of dependencies from this dynamic import
      const visited: Set<DependencyNode> = new Set();
      const bundle: Array<DependencyNode> = [];
      const dynamicBundle: Array<DependencyNode> = [];
      let bundleHash = '';
      visit(module, null, visited, tmp, bundle, true);

      for (let bundleNode of bundle) {
        if (bundleNode === module) {
          continue;
        }
        // then check each module to see if it is only imported
        // by modules that are also in the dynamic bundle. if not,
        // we should be including that module statically
        // TODO if we were to check if its only in this & other dynamic bundles
        // we could get a list of common modules to dynamic children
        // and apply a similar common module threshold logic to add
        // a common set for the dynamic children of a static module
        let include = true;
        for (let i in bundleNode.importedBy) {
          const importedByNode = bundleNode.importedBy[i];
          if (
            importedByNode.bundles.has(bundleName) &&
            !visited.has(importedByNode)
          ) {
            include = false;
            break;
          }
        }
        if (include) {
          dynamicBundle.push(bundleNode);
          remaining.delete(bundleNode);
          bundleHash += bundleNode.contentHash || '';
        }
      }
      dynamicBundle.push(module);
      remaining.delete(module);
      bundleHash += outputPathHelpers.generateHash(
        bundleHash + (module.contentHash || '')
      );

      const bundleOutputPaths = outputPathHelpers.getBundlerOutputPaths(
        bundleHash + path.extname(bundleName),
        bundleHash,
        bundler,
        variant,
      );

      // its possible that multiple bundles might have the same dynamic import
      // bundles. Instead of duplicating them, we'll look them up by hash first
      // and dedeupe them by their content
      output.dynamicBundleMap[bundleName + ':' + module.module] = {
        hash: bundleHash,
        paths: bundleOutputPaths,
      };
      if (!output.dynamicBundles[bundleHash]) {
        output.dynamicBundles[bundleHash] = dynamicBundle;
      }
    }
  }

  const staticBundle = [];
  let staticBundleHash = '';
  for (let r of remaining) {
    staticBundle.push(r);
    staticBundleHash += r.contentHash || '';
  }
  staticBundleHash = outputPathHelpers.generateHash(staticBundleHash);

  const bundleOutputPaths = outputPathHelpers.getBundlerOutputPaths(
    bundleName,
    staticBundleHash,
    bundler,
    variant,
  );

  output.staticBundleMap[bundleName] = {
    hash: staticBundleHash,
    paths: bundleOutputPaths,
  }
  output.staticBundles[staticBundleHash] = staticBundle;
}

export function generateBundlesFromWorkingSet(
  graph: DependencyGraph,
  workingSet: WorkingSet,
  config: PacktConfig,
  outputPathHelpers: OutputPathHelpers
): { [key: string]: GeneratedBundles } {
  const staticBundles = generateStaticBundlesFromWorkingSet(
    graph,
    workingSet,
    config
  );

  const output = {};
  for (let v in staticBundles) {
    const variant = staticBundles[v];
    const subBundleVariant = output[v] = {
      dynamicBundleMap: {},
      staticBundleMap: {},
      staticBundles: {},
      dynamicBundles: {},
    };
    for (let s in variant) {
      const staticBundle = variant[s];
      splitDynamicBundles(
        s,
        v,
        staticBundle,
        config,
        outputPathHelpers,
        subBundleVariant
      );
    }
  }
  return output;
}

export type GeneratedBundleLookups = {
  [key: string]: {|
    assetMap: { [key: string]: string },
    dynamicBundleMap: { [key: string]: string },
    moduleMap: { [key: string]: {
      exportsIdentifier: string,
      exportsESModule: boolean,
    }},
  |},
};

export function generateBundleLookups(
  graph: DependencyGraph,
  bundles: { [key: string]: GeneratedBundles }
): GeneratedBundleLookups {
  const output = {};

  for (let v in graph.variants) {
    const variant = output[v] = {
      assetMap: {},
      dynamicBundleMap: {},
      moduleMap: {},
    };

    const dynamicBundles = bundles[v].dynamicBundleMap;
    for (let b in dynamicBundles) {
      variant.dynamicBundleMap[b] = dynamicBundles[b].paths.outputPublicPath;
    }

    const lookups = graph.variants[v].lookups;
    for (let m in lookups) {
      const module = lookups[m];
      for (let asset in module.generatedAssets) {
        variant.assetMap[asset] = module.generatedAssets[asset];
      }
      variant.moduleMap[m] = {
        exportsIdentifier: module.exports.identifier,
        exportsESModule: module.exports.esModule,
      };
    }
  }

  return output;
}
