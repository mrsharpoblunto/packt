/**
 * @flow
 */

export type WorkingSet = {
  bundles: {
    [key: string]: Array<{
      name: string,
      folder: boolean,
    }>,
  },
  commonBundles: { [key: string]: boolean },
};

