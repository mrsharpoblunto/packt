/**
 * @flow
 */
import type {
  PacktConfig,
} from '../types';
import type {
  DependencyNode,
  DependencyGraph,
} from './dependency-graph';
import type {
  WorkingSet
} from './working-set';

export type SortedBundles = {
  [key: string]: {
    [key: string]: Array<DependencyNode>,
  },
};

export function sortBundles(
  graph: DependencyGraph, 
  config: PacktConfig, 
  workingSet: WorkingSet
): SortedBundles {
  const result = {};

  /*
  graph.resetMetadata();
  for (let v in graph.variants) {
    const variant = graph.variants[v];

    // TODO only do this when treeshaking enabled as this can result
    // in re-bundling otherwise unchanged bundles apart from possible
    // tree-shake related changes (i.e. adding/removing symbols int eh
    // current bundle build)
    Object.assign(
      workingSet.bundles,
      updateSymbolUsage(variant)
      );

    for (let r in variant.roots) {
      const entryPoint = variant.roots[r];
      // TODO do this for all bundles & make bundle belonging a 
      // core piece of metedata, computing this is unlikely to be
      // a perf bottleneck.
      // find all the changed bundles this entrypoint belongs to
      const inBundles = Object.keys(workingSet.bundles).filter((b) => {
        return entryPoint.bundles[b];
      });
      // if it belongs to any, color all its children
      if (inBundles.length) {
        setBundles(entryPoint.module, inBundles);
      }
    }

    // now color all nodes if they should belong to a common module
    if (Object.keys(workingSet.commonBundles).length) {
      for (let l in variant.lookups) {
        const module = variant.lookups[l];
        if (!module.metadata.bundles) {
          continue;
        }
        for (let c in workingSet.commonBundles) {
          const common = config.config.bundles[c];
          if (
            !common.contentTypes.length || 
            common.contentTypes.indexOf(module.contentType) >= 0
          ) {
            const frequency = Object
              .keys(module.metadata.bundles)
              .reduce((prev, next) => {
                return prev + (common.dependedBy[next] ? 1 : 0);
              }, 0);
              if (frequency / common.dependedByLength >= common.threshold) {
                module.metadata.bundles[c] = true;
              }
          }
        }
      }
    }


    const sorted = [];
    for (let l in variant.lookups) {
      if (!visit(variant.lookups[l], sorted)) {
        throw new Error('cycle detected!');
      }
    }

    const sortedBundles = {};
    for (let module of sorted) {
      for (let b in module.metadata.bundles) {
        const bundle = config.config.bundles[b];
        let sortedBundle = sortedBundles[b];
        if (!sortedBundle) {
          sortedBundle = sortedBundles[b] = [];
        }
        let external = false;
        if (bundle.type === bundleTypes.ENTRYPOINT) {
          // if this module also belongs to a common/lib that this entrypoint
          // depends on then it is external to this bundle and shouldn't be 
          // included in the bundles list of modules
          for (let dep of bundle.depends) {
            if (module.metadata.bundles[dep]) {
              external = true;
              break;
            }
          }
        }
        if (!external) {
          sortedBundle.push(module);
        }
      }
    }
    result[v] = sortedBundles;
}*/

  return result;
}

/*function updateSymbolUsage(variant) {
  const bundles = {};
  for (let l in variant.lookups) {
    const node = variant.lookups[l];
    const oldUsages = node.exportsSymbolsUsed;
    const usages = determineUsedSymbols(node);
    usages.sort();
    node.exportsSymbolsUsed = usages;
    if (
      !oldUsages || 
      oldUsages.length !== usages.length) {
      Object.assign(
        bundles,
        node.metadata.bundles
      );
    } else {
      for (let i = 0;i < usages.length; ++i) {
        if (usages[i] !== oldUsages[i]) {
          Object.assign(
            bundles,
            node.metadata.bundles
          );
          break;
        }
      }
    }
  }
  return bundles;
}

function determineUsedSymbols(module) {
  if (!module.exportsEsModule) {
    return ['*'];
  }

  const usedSymbols = {};
  for (let i in module.importedBy) {
    const dependentModule = module.importedBy[i];
    const importsSymbols = dependentModule.imports[module.module].symbols;
    if (
      importsSymbols.length === 1 && 
      importsSymbols[0] === '*'
    ) {
      return module.exportsSymbols.slice(0);
    } else {
      importsSymbols.forEach(is => usedSymbols[is] = true);
    }
  }
  return Object.keys(usedSymbols);
}

function setBundles(module, bundles) {
  if (!module.metadata.bundles) {
    module.metadata.bundles = {};
  }
  let addedNewBundle = false;
  for (let b of bundles) {
    if (!module.metadata.bundles[b]) {
      module.metadata.bundles[b] = true;
      addedNewBundle = true;
    }
  }
  // any child nodes have the same color as thier parent,
  // so if the parent already has been colored with all 
  // modules, then the children have as well
  if (addedNewBundle) {
    for (let i in module.imports) {
      setBundles(module.imports[i].node, bundles);
    }
  }
}

function visit(node, list) {
  if (node.metadata.tempVisited) {
    return false;
  }
  if (!node.metadata.visited) {
    node.metadata.tempVisited = true;
    for (let i in node.imports) {
      visit(node.imports[i].node, list);
    }
    node.metadata.visited = true;
    node.metadata.tempVisited = false;
    list.push(node);
  }
  return true;
}*/
