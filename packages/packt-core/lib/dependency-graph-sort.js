'use strict';
const bundleTypes = require('./bundle-types');

function sortBundles(graph, config, workingSet) {
  const result = {};

  graph.resetMetadata();
  for (let v in graph.variants) {
    const variant = graph.variants[v];

    for (let r in variant.roots) {
      const entryPoint = variant.roots[r];
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
          // TODO need to check if bundle has matching content type
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
  }

  return result;
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
}

module.exports = sortBundles;
