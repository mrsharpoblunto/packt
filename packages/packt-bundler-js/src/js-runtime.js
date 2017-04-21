/**
 * @flow
 */
import fs from 'fs';
import path from 'path';
import uglify from 'uglify-js';

const cache = {};

export default function jsRuntime(
  minify: boolean,
): string {
  let cached = cache[minify.toString()];
  if (!cached) {
    cached = fs.readFileSync(path.join(__dirname, 'js-runtime.js.template'),'utf8');
    if (minify) {
      cached = uglify.minify(cached, { fromString: true }).code;
    }
    cache[minify.toString()] = cached;
  }
  return cached;
}
