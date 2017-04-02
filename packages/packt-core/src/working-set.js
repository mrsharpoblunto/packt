/**
 * @flow
 */
import type {
  PacktConfig,
} from '../types';

export type WorkingSet = {
  bundles: {
    [key: string]: Array<{
      name: string,
      folder: boolean,
    }>,
  },
  commonBundles: { [key: string]: boolean },
};

// TODO determine files which changed from last build using filesystem
// search or watchman if available. if empty, use config entrypoints as inputs
//  also determine all the chunks where a changed input occurred, so once
//  we've rebuilt the inputs, we can regenerate the output chunks
// export function determineIncrementalWorkingSet(): Promise<WorkingSet>

export function determineInitialWorkingSet(
  config: PacktConfig
): Promise<WorkingSet> {
  const set: WorkingSet = {
    bundles: {},
    commonBundles: {},
  };

  try {
    for (let key in config.bundles) {
      const bundle = config.bundles[key];
      if (bundle.type === 'common') {
        continue;
      }
      if (bundle.commons) {
        for (let common in bundle.commons) {
          // if a changing bundle has a common module, then all the bundles
          // that also depend on that common module might also have to change
          const commonBundle = config.bundles[common];
          Object.keys(commonBundle.dependedBy).forEach(dep => {
            set.bundles[dep] = (set.bundles[dep] || []).map((m) =>
              typeof(m) === 'string' ? { name: m, folder: false } : m
            ) || [];
          });
          set.commonBundles[common] = true;
        }
      }
      if (bundle.requires) {
        set.bundles[key] = bundle.requires.map((m) =>
          typeof(m) === 'string' ? { name: m, folder: false } : m
        );
      }
    }
    return Promise.resolve(set);
  } catch (err) {
    return Promise.reject(err);
  }
}
