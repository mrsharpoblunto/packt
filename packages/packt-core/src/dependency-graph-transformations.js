/**
 * @flow
 */
import {
  DependencyNode,
  DependencyGraph,
} from './dependency-graph';
import type {PacktConfig} from '../types';
import type {WorkingSet} from './working-set';

type GeneratedBundles = {
  [key: string]: { // variants
    [key: string]: Array<DependencyNode>,
  }
};

export function generateBundlesFromWorkingSet(
  graph: DependencyGraph,
  workingSet: WorkingSet,
  config: PacktConfig
): GeneratedBundles {
  const result: GeneratedBundles = {};
 
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
        }
        bundleGen.push(module);
      }
    }

    for (let b in variantGen) {
      variantGen[b] = sortBundle(variantGen[b]);
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
    if (bundleConfig.type === 'entrypoint' && bundleConfig.depends.size) {
      let isExternal = false;
      for (let b of module.bundles) {
        if (bundleConfig.depends.has(b)) {
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
      for (let c of bundleConfig.commons) {
        const commonConfig = config.bundles[c];
        if (
          !commonConfig.contentTypes.size ||
          (
            module.contentType && 
            commonConfig.contentTypes.has(module.contentType)
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
    if ((value.length / commonConfig.dependedBy.size) >= commonConfig.threshold) {
      bundles.push(key);
    } else {
      // otherwise it should stay individually in all the bundles it appears in
      bundles.push.apply(bundles,value);
    }
  }
  return bundles;
}

function sortBundle(modules: Array<DependencyNode>): Array<DependencyNode> {
  const sorted = [];
  const visited: Set<DependencyNode> = new Set();
  const tempVisited: Set<DependencyNode> = new Set();
  for (let m of modules) {
    if (!visit(m, visited, tempVisited, sorted)) {
      throw new Error('cycle detected!');
    }
  }
  return sorted;
}

function visit(
  node: DependencyNode, 
  visited: Set<DependencyNode>,
  tempVisited: Set<DependencyNode>,
  output: Array<DependencyNode>
): boolean {
  if (tempVisited.has(node)) {
    return false;
  }
  if (!visited.has(node)) {
    tempVisited.add(node);
    for (let i in node.imports) {
      visit(node.imports[i].node, visited, tempVisited, output);
    }
    visited.add(node);
    tempVisited.delete(node);
    output.push(node);
  }
  return true;
}

export function generateSubBundles(
  bundleName: string,
  modules: Array<string>,
) {
    //determine any modules that are dyamically imported. build out those trees.
    //color nodes in a map in the dynamic subtree then check that all nodes in
    //that colored tree are only imported by other colored nodes - if they aren't.
    //then remove them from the dynamic set as they are statically imported by
    //the parent
}

export function generateSerializable() {
  // TODO
  // determine symbol usages for each module & generate the JSON blob to 
  // pass to the bundler
}
