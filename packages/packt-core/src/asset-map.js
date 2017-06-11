/**
 * @flow
 * @format
 */
import path from 'path';
import fs from 'fs';
import mkdirp from 'mkdirp';
import type OutputPathHelpers from './output-path-helpers';
import type { DependencyGraph } from './dependency-graph';
import type { GeneratedBundleSet } from './generated-bundle-set';

export default class AssetMap {
  _map: { [assetName: string]: string };
  _assetMapPaths: OutputPaths;

  constructor(pathHelpers: OutputPathHelpers) {
    this._assetMapPaths = pathHelpers.getAssetMapOutputPaths();
    this._map = {};
  }

  update(
    graph: DependencyGraph,
    generatedBundleSets: { [variant: string]: GeneratedBundleSet },
  ): Promise<any> {
    const promises = [];

    // update any changed assets & remove outdated assets from disk
    for (let variant in graph.variants) {
      const graphVariant = graph.variants[variant];

      for (let m in graphVariant.lookups) {
        const module = graphVariant.lookups[m];
        for (let asset in module.generatedAssets) {
          if (this._map[asset]) {
            promises.push(this._removeFile(this._map[asset]));
          }
          this._map[asset] = module.generatedAssets[asset];
        }
      }

      const generatedBundles = generatedBundleSets[variant].getBundles();
      for (let bundleName in generatedBundles) {
        const bundlePaths = generatedBundles[bundleName].paths;
        if (this._map[bundlePaths.assetName]) {
          promises.push(this._removeFile(this._map[bundlePaths.assetName]));
        }
        this._map[bundlePaths.assetName] = bundlePaths.outputPath;
      }
    }

    // save out the updated asset map
    promises.push(
      new Promise((resolve, reject) => {
        mkdirp(this._assetMapPaths.outputParentPath, err => {
          if (err) {
            return reject(err);
          }
          fs.writeFile(
            this._assetMapPaths.outputPath,
            JSON.stringify(this._map),
            err => {
              if (err) {
                reject(err);
              } else {
                resolve();
              }
            },
          );
        });
      }),
    );

    return Promise.all(promises);
  }

  _removeFile(filename: string): Promise<any> {
    return new Promise((resolve, reject) => {
      fs.unlink(filename, err => {
        // we don't care if the call fails - it might
        // if we're removing multiple dynamic modules with
        // the same filesystem destination
        resolve();
      });
    });
  }
}
