'use strict';

class ContentMap {
  constructor() {
    this._content = {};
  }

  contains(resolved) {
    return !!this._content[resolved];
  }

  addPending(resolved) {
    this._content[resolved] = {
      pending: true,
    };
  }

  setContent(resolved,content) {
    this._content[resolved] = {
      content: content,
    };
  }
}

module.exports = ContentMap;
