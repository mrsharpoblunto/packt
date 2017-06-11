/**
 * @flow
 */
import mkdirp from 'mkdirp';
import fs from 'fs';
import uglify from 'uglify-js';
import path from 'path';

export default function debugJSRuntime(
  data: BundlerData,
  jsModules: Array<SerializedModule>
): string {
  const aliasMap: { [key: string]: { [key: string]: string } } = {};

  for (let module of jsModules) {
    const mapEntry = data.moduleMap[module.resolvedModule];
    aliasMap[mapEntry.exportsIdentifier] = module.importAliases;
  }

  return `window.module=window.module||{};
window.__packt_alias_map__ = Object.assign(
  window.__packt_alias_map__||{},
  ${JSON.stringify(aliasMap)}
);
window.__packt_identifier_map__ = Object.assign(
  window.__packt_identifier_map__||{},
  ${JSON.stringify(data.moduleMap)}
);
window.__packt_dynamic_bundle_map__ = Object.assign(
  window.__packt_dynamic_bundle_map__ || {},
  ${JSON.stringify(data.dynamicBundleMap)}
);
window.__packt_import__ = window.__packt_import__ || function(exportsIdentifier, alias, symbol) {
  var e = window.__packt_identifier_map__[
    window.__packt_alias_map__[exportsIdentifier][alias]
  ];
  var identifier = window[e.exportsIdentifier];
  return (!symbol || (symbol ==='default' && !e.exportsESModule)) 
    ? identifier 
    : identifier[symbol];
};
window.__packt_dynamic_import__ = window.__packt_dynamic_import__ || function(bundle, exportsIdentifier, alias) {
  var importModule = window.__packt_alias_map__[exportsIdentifier][alias];
  var url = window.__packt_dynamic_bundle_map__[
    bundle + ':' + importModule
  ];
  var e = window.__packt_identifier_map__[importModule];
  return window.__packt_dynamic_import_impl__(url, e.exportsIdentifier);
};`;
}
