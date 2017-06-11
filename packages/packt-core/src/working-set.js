/**
 * @flow
 * @format
 */
import { type DependencyGraph } from './dependency-graph';
import { type ChangeDetails } from './change-watcher';

export type WorkingSet = {
  bundles: {
    [key: string]: Array<{
      name: string,
      folder: boolean
    }>
  },
  commonBundles: Set<string>,
  invalidatedModules: Array<string>
};

export function determineIncrementalWorkingSet(
  config: PacktConfig,
  dependencyGraph: DependencyGraph,
  changes: Array<ChangeDetails>
): Promise<?WorkingSet> {
  const set: WorkingSet = {
    bundles: {},
    commonBundles: new Set(),
    invalidatedModules: []
  };
  // TODO
  // only include the file as a valid candidate for a change
  // if it matches the following conditions
  // 1) its a change to a matching module in the dependency graph
  // 2) any files in the dependency graph that did not have thier content
  //    processed correctly last run (i.e. we add these in even if they
  //    aren't in the list of changes as a change to a child may fix the
  //    broken parent)
  // 3) a child file of a module which has a directory set as its resolved module name
  //
  // If its a change to anything else, then its not attached to the dependency graph
  // and isn't relevant
  //
  // Any modules in this list should have thier contents invalidated so that we regenerate
  // them from scratch, but we should record the import data in the previous versions
  // as we'll need this info at the bundle stage to determine if we can do a fast path rebuild
  // and avoid a bundle sort (if we know no files got added/removed & no imports changed)
  return Promise.resolve(set.invalidatedModules.length ? set : null);
}

export function determineInitialWorkingSet(
  config: PacktConfig
): Promise<WorkingSet> {
  const set: WorkingSet = {
    bundles: {},
    commonBundles: new Set(),
    invalidatedModules: []
  };

  try {
    for (let bundleName in config.bundles) {
      addDependentBundles(bundleName, config, set);
    }
    return Promise.resolve(set);
  } catch (err) {
    return Promise.reject(err);
  }
}

function addDependentBundles(
  bundleName: string,
  config: PacktConfig,
  set: WorkingSet
) {
  const bundle = config.bundles[bundleName];
  if (bundle.type === 'common') {
    return;
  }
  if (bundle.commons) {
    for (let common in bundle.commons) {
      // if a changing bundle has a common module, then all the bundles
      // that also depend on that common module might also have to change
      const commonBundle = config.bundles[common];
      const dependedBy = Object.keys(commonBundle.dependedBy);
      dependedBy.forEach(dep => {
        set.bundles[dep] =
          (set.bundles[dep] || [])
            .map(
              m => (typeof m === 'string' ? { name: m, folder: false } : m)
            ) || [];
      });
      set.commonBundles.add(common);
    }
  }
  if (bundle.requires) {
    set.bundles[bundleName] = bundle.requires.map(
      m => (typeof m === 'string' ? { name: m, folder: false } : m)
    );
  }
}
