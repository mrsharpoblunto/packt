/**
 * @flow
 */
import crypto from 'crypto';
import path from 'path';

export function hashConfig(config: PacktConfig): string {
  let configHash = JSON.stringify(config);

  // TODO resolve & find package versions & file hashes of handlers & bundlers
  /*for (let handler of config.handlers) {
  }
  for (let bundler in config.bundlers) {
  }*/

  const hasher = crypto.createHash('sha256');
  hasher.update(configHash);
  return hasher.digest('hex');
}
