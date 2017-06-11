/**
 * @flow
 * @format
 */
export type ContentMapEntry = {
  content: string
};

export type ReadOnlyContentMapVariant = (resolved: string) => string;

export default class ContentMap {
  _content: {
    [key: string]: {
      variants: { [key: string]: ContentMapEntry }
    }
  };

  constructor() {
    this._content = {};
  }

  get(resolved: string, variant: string): string {
    return this._content[resolved].variants[variant].content;
  }

  readOnlyVariant(variant: string): ReadOnlyContentMapVariant {
    return (resolved: string) => this.get(resolved, variant);
  }

  addIfNotPresent(resolved: string, ifNotPresent: Function) {
    const entry = this._content[resolved];
    if (!entry) {
      this._content[resolved] = {
        variants: {}
      };
      ifNotPresent();
    }
  }

  setContent(resolved: string, variants: Array<string>, content: string) {
    Object.assign(
      this._content[resolved].variants,
      variants.reduce((prev, next) => {
        prev[next] = {
          content: content
        };
        return prev;
      }, {})
    );
  }
}
