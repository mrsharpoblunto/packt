'use strict';

class ContentMap {
  constructor() {
    this._content = {};
  }

  get(resolved) {
    return this._content[resolved];
  }

  addIfNotPresent(resolved,ifNotPresent) {
    const entry = this._content[resolved];
    if (!entry) {
      this._content[resolved] = {
        variants: {},
      };
      ifNotPresent();
    }
  }

  setContent(resolved,variants,content) {
    Object.assign(
      this._content[resolved].variants,
      variants.reduce((prev, next) => {
        prev[next] = content;
        return prev;
      },{})
    );
  }
}

module.exports = ContentMap;
