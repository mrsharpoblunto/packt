/**
 * @flow
 * @format
 */

export function getOrCreate<T>(
  dict: { [key: string]: T },
  key: string,
  newFunc: () => T,
): T {
  let existing = dict[key];
  if (!existing) {
    existing = dict[key] = newFunc();
  }
  return existing;
}

export function objectMap<T, U>(
  dict: { [key: string]: T },
  map: (value: T, key: string) => U,
): { [key: string]: U } {
  return Object.keys(dict).reduce((prev, next) => {
    prev[next] = map(dict[next], next);
    return prev;
  }, {});
}
