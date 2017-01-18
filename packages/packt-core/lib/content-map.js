'use strict';

class ContentMap {
  constructor() {
    this._content = {};
  }

  get(resolved,variant) {
    return this._content[resolved].variants[variant];
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
