/**
 * @flow
 */
export type ContentMapEntry = {
  content: string,
  hash: string,
};

export default class ContentMap {
  _content: { [key: string]: {
    variants: { [key: string]: ContentMapEntry },
  }};
  _hasher: (content: string) => string;

  constructor(hasher: (content: string) => string) {
    this._content = {};
    this._hasher = hasher;
  }

  get(
    resolved: string,
    variant: string
  ): ContentMapEntry {
    return this._content[resolved].variants[variant];
  }

  addIfNotPresent(resolved: string,ifNotPresent: Function) {
    const entry = this._content[resolved];
    if (!entry) {
      this._content[resolved] = {
        variants: {},
      };
      ifNotPresent();
    }
  }

  setContent(
    resolved: string,
    variants: Array<string>,
    content: string
  ) {
    Object.assign(
      this._content[resolved].variants,
      variants.reduce((prev, next) => {
        prev[next] = {
          content: content,
          hash: this._hasher(content),
        };
        return prev;
      },{})
    );
  }
}
