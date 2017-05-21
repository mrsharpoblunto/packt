/**
 * @flow
 */
import type {DependencyGraph} from './dependency-graph';
import type {
  GeneratedBundleData,
  GeneratedBundleSet,
} from './generated-bundle-set';
import {
  objectMap,
} from './helpers';
import type {ReadOnlyContentMapVariant} from './content-map';

export type GeneratedBundleLookupVariant = {|
  assetMap: { [key: string]: string },
  dynamicBundleMap: { [key: string]: string },
  moduleMap: { [key: string]: {
    exportsIdentifier: string,
    exportsESModule: boolean,
  }},
|}

export type GeneratedBundleLookups = {
  [variant: string]: GeneratedBundleLookupVariant
};

export function generateBundleLookups(
  graph: DependencyGraph,
  bundles: { [key: string]: GeneratedBundleSet }
): GeneratedBundleLookups {
  const output = {};

  for (let v in graph.variants) {
    const variant = output[v] =  {
      assetMap: {},
      moduleMap: {},
      dynamicBundleMap: objectMap(bundles[v].getDynamicBundles(), (bundle) => bundle.paths.outputPublicPath),
    };

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

export function serializeBundle({
  bundleName,
  bundle,
  bundleLookups,
  config,
  contentMap,
}: {|
  bundleName: string,
  bundle: GeneratedBundleData,
  bundleLookups: GeneratedBundleLookupVariant,
  contentMap: ReadOnlyContentMapVariant,
  config: PacktConfig,
|}): BundlerData {
  return { 
    modules: bundle.modules.map(
      (m) => m.serialize(m.contentHash ? contentMap(m.module) : '')
    ), 
    paths: bundle.paths,
    hasDependencies: bundle.type === 'dynamic' || (
      config.bundles[bundleName].type === 'entrypoint' && (
        Object.keys(config.bundles[bundleName].commons).length!==0 ||
        Object.keys(config.bundles[bundleName].depends).length!==0
      )
    ),
    ...bundleLookups
  };
}
