/**
 * @flow
 */
import fs from 'fs';
import path from 'path';
import uglify from 'uglify-js';
import crypto from 'crypto';

const cache = {};

export function impl(minify: boolean): string {
  let cached = cache[minify.toString()];
  if (!cached) {
    cached = fs.readFileSync(
      path.join(__dirname, 'js-runtime.js.template'),
      'utf8'
    );
    if (minify) {
      cached = uglify.minify(cached, { fromString: true }).code;
    }
    cache[minify.toString()] = cached;
  }
  return cached;
}

export function styleLoader(cssModules: Array<SerializedModule>) {
  // doesn't have to be cryptographically strong, just enough to
  // ensure that we don't re-add the same stylesheets into the DOM
  const hasher = crypto.createHash('md5');
  hasher.update(cssModules.map(c => c.contentHash).join(''));
  return `__packt_style__(\'${hasher.digest('hex')}\',${JSON.stringify(
    cssModules.map(c => c.content).join('')
  )});`;
}
