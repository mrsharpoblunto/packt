/**
 * @flow
 */
import fs from 'fs';
import path from 'path';
import uglify from 'uglify-js';

const cache = {};

export default function styleLoaderRuntime(
  minify: boolean,
  assetName: string, 
  cssModules: Array<SerializedModule>
): string {
  let cached = cache[minify.toString()];
  if (!cached) {
    cached = fs.readFileSync(path.join(__dirname, 'style-loader.js.template'),'utf8');
    if (minify) {
      cached = uglify.minify(cached, { fromString: true }).code;
    }
    cache[minify.toString()] = cached;
  }
  return `(${cached})(\'${assetName}\',\'${cssModules.map((c) => c.content).join('')}\');`;
}
