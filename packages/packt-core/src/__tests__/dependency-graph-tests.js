import {
  DependencyNode,
  DependencyGraph,
} from '../dependency-graph';

describe('dependency graph tests', () => {
  it('correctly builds a simple dependency graph', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/entrypoint-a.js',
      ['default'],
      'bundle-a'
    );

    graph.bundleEntrypoint(
      '/src/entrypoint-b.js',
      ['default'],
      'bundle-b'
    );

    graph.imports(
      '/src/entrypoint-a.js',
      '/src/second-level-component.js',
      ['default'],
      {
        source: './second-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );
    
    graph.imports(
      '/src/entrypoint-b.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    graph.imports(
      '/src/third-level-component.js',
      '/src/fourth-level-component.js',
      ['default'],
      {
        source: './fourth-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    graph.imports(
      '/src/second-level-component.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    expect(Object.keys(graph.variants)).toEqual(['default']);

    const defaultVariant = graph.variants['default'];

    expect(Object.keys(defaultVariant.roots)).toEqual([
      '/src/entrypoint-a.js',
      '/src/entrypoint-b.js', 
    ]);
    expect(Object.keys(defaultVariant.lookups)).toEqual([
      '/src/entrypoint-a.js',
      '/src/entrypoint-b.js',
      '/src/second-level-component.js',
      '/src/third-level-component.js',
      '/src/fourth-level-component.js',
    ]);

    const entrypointA = defaultVariant.roots['/src/entrypoint-a.js'];
    expect(entrypointA.importedBy).toEqual({});
    expect(Object.keys(entrypointA.imports)).toEqual(['/src/second-level-component.js']);
    expect(Object.keys(entrypointA.importAliases)).toEqual(['./second-level-component']);
    expect(entrypointA.bundles.size).toEqual(1);
    expect(entrypointA.bundles.has('bundle-a')).toBe(true);

    const entrypointB = defaultVariant.roots['/src/entrypoint-b.js'];
    expect(entrypointB.importedBy).toEqual({});
    expect(Object.keys(entrypointB.imports)).toEqual(['/src/third-level-component.js']);
    expect(Object.keys(entrypointB.importAliases)).toEqual(['./third-level-component']);
    expect(entrypointB.bundles.size).toEqual(1);
    expect(entrypointB.bundles.has('bundle-b')).toBe(true);

    const secondLevel = defaultVariant.lookups['/src/second-level-component.js'];
    expect(Object.keys(secondLevel.importedBy)).toEqual([
      '/src/entrypoint-a.js',
    ]);
    expect(Object.keys(secondLevel.imports)).toEqual(['/src/third-level-component.js']);
    expect(Object.keys(secondLevel.importAliases)).toEqual(['./third-level-component']);
    expect(secondLevel.bundles.size).toEqual(1);
    expect(secondLevel.bundles.has('bundle-a')).toBe(true);

    const thirdLevel = defaultVariant.lookups['/src/third-level-component.js'];
    expect(Object.keys(thirdLevel.importedBy)).toEqual([
      '/src/entrypoint-b.js',
      '/src/second-level-component.js',
    ]);
    expect(Object.keys(thirdLevel.imports)).toEqual([
      '/src/fourth-level-component.js', 
    ]);
    expect(Object.keys(thirdLevel.importAliases)).toEqual([
      './fourth-level-component',
    ]);
    expect(thirdLevel.bundles.size).toEqual(2);
    expect(thirdLevel.bundles.has('bundle-a')).toBe(true);
    expect(thirdLevel.bundles.has('bundle-b')).toBe(true);

    const fourthLevel = defaultVariant.lookups['/src/fourth-level-component.js'];
    expect(Object.keys(fourthLevel.importedBy)).toEqual([
      '/src/third-level-component.js',
    ]);
    expect(Object.keys(fourthLevel.imports)).toEqual([]);
    expect(Object.keys(fourthLevel.importAliases)).toEqual([]);
    expect(fourthLevel.bundles.size).toEqual(2);
    expect(fourthLevel.bundles.has('bundle-a')).toBe(true);
    expect(fourthLevel.bundles.has('bundle-b')).toBe(true);

    expect(entrypointA.importAliases['./second-level-component'].node).toBe(secondLevel);
    expect(entrypointA.imports['/src/second-level-component.js'].node).toBe(secondLevel);
    expect(entrypointB.importAliases['./third-level-component'].node).toBe(thirdLevel);
    expect(entrypointB.imports['/src/third-level-component.js'].node).toBe(thirdLevel);
    expect(secondLevel.importAliases['./third-level-component'].node).toBe(thirdLevel);
    expect(secondLevel.imports['/src/third-level-component.js'].node).toBe(thirdLevel);
    expect(thirdLevel.importAliases['./fourth-level-component'].node).toBe(fourthLevel);
    expect(thirdLevel.imports['/src/fourth-level-component.js'].node).toBe(fourthLevel);
  });

  it('marks dynamic and static imports correctly', () => {
    // TODO
    // if a module is imported both statically & dynamically in the same bundle
  });

  it('sets exports, content types, and generated assets correctly', () => {
    // TODO
  });

  it('computes symbol usage correctly', () => {
    // TODO
  });
});
