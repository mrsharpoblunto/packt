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
  const identifierMap: { [key: string]: {
    identifier: string,
    esModule: boolean,
  }} = {};

  for (let module of jsModules) {
    const mapEntry = data.moduleMap[module.resolvedModule];
    const exportsIdentifier = mapEntry.exportsIdentifier;
    identifierMap[module.resolvedModule] = {
      identifier: mapEntry.exportsIdentifier,
      esModule: mapEntry.exportsESModule,
    };
    aliasMap[exportsIdentifier] = module.importAliases;
  }

  return (
    'window.module=window.module||{};' +
    'window.__packt_alias_map__=' +
    'Object.assign(window.__packt_alias_map__||{},' + 
    JSON.stringify(aliasMap)+');' +
    'window.__packt_identifier_map__=' + 
    'Object.assign(window.__packt_identifier_map__||{},' + 
    JSON.stringify(identifierMap)+');' +
    'window.__packt_import__=function(exportsIdentifier,alias,useDefault){' +
    'var e=window.__packt_identifier_map__[' +
    'window.__packt_alias_map__[exportsIdentifier][alias]' +
    '];' +
    'var identifier=window[e.identifier];' +
    'return (!e.esModule&&useDefault)?{default:identifier}:identifier;' +
    '};'
  );
}
