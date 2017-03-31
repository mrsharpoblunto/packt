/**
 * @flow
 */

export default class Timer {
  _categories: {
    [key: string]: ({ [key: string]: number } | number),
  };

  constructor() {
    this._categories = {};
  }

  clear() {
    this._categories = {};
  }

  accumulate(
    category: string,
    values: { [key: string]: number} | number
  ) {
    const c = this._categories[category];

    if (!c) {
      this._categories[category] = (typeof values === 'object') 
        ? Object.assign({},values)
        : values;
    } else if (typeof values === 'object' && typeof c === 'object') {
      for (let sub in values) {
        if (sub in c) {
          c[sub] += values[sub];
        } else {
          c[sub] = values[sub];
        }
      }
    } else if (typeof values === 'number' && typeof c === 'number') {
      this._categories[category] = c + values;
    }
  }

  get(
    category: string,
    sub: ?string
  ): number {
    const c = this._categories[category];
    if (!sub) {
      return (typeof c === 'number') ? c : 0;
    } else {
      return (typeof c === 'object') ? c[sub] : 0;
    }
  }

  getCategories(): Array<string>  {
    return Object.keys(this._categories);
  }

  getSubcategories(category: string): Array<string> {
    const c = this._categories[category];
    return Object.keys(typeof c === 'object' ? c : {});
  }
}
