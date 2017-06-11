import { DependencyNode, DependencyGraph } from '../dependency-graph';

describe('dependency graph tests', () => {
  it('correctly builds a simple dependency graph', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['default'], 'bundle-a');

    graph.bundleEntrypoint('/src/entrypoint-b.js', ['default'], 'bundle-b');

    graph.imports(
      '/src/entrypoint-a.js',
      '/src/second-level-component.js',
      ['default'],
      {
        source: './second-level-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    graph.imports(
      '/src/entrypoint-b.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    graph.imports(
      '/src/third-level-component.js',
      '/src/fourth-level-component.js',
      ['default'],
      {
        source: './fourth-level-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    graph.imports(
      '/src/second-level-component.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    expect(Object.keys(graph.variants)).toEqual(['default']);

    const defaultVariant = graph.variants['default'];

    expect(Object.keys(defaultVariant.roots)).toEqual(['bundle-a', 'bundle-b']);
    expect(
      Array.from(defaultVariant.roots['bundle-a']).map(m => m.module),
    ).toEqual(['/src/entrypoint-a.js']);
    expect(
      Array.from(defaultVariant.roots['bundle-b']).map(m => m.module),
    ).toEqual(['/src/entrypoint-b.js']);
    expect(Object.keys(defaultVariant.lookups)).toEqual([
      '/src/entrypoint-a.js',
      '/src/entrypoint-b.js',
      '/src/second-level-component.js',
      '/src/third-level-component.js',
      '/src/fourth-level-component.js',
    ]);

    const entrypointA = defaultVariant.lookups['/src/entrypoint-a.js'];
    expect(entrypointA.importedBy).toEqual({});
    expect(Object.keys(entrypointA.imports)).toEqual([
      '/src/second-level-component.js',
    ]);
    expect(Object.keys(entrypointA.importAliases)).toEqual([
      './second-level-component',
    ]);
    expect(entrypointA.bundles.size).toEqual(1);
    expect(entrypointA.bundles.has('bundle-a')).toBe(true);

    const entrypointB = defaultVariant.lookups['/src/entrypoint-b.js'];
    expect(entrypointB.importedBy).toEqual({});
    expect(Object.keys(entrypointB.imports)).toEqual([
      '/src/third-level-component.js',
    ]);
    expect(Object.keys(entrypointB.importAliases)).toEqual([
      './third-level-component',
    ]);
    expect(entrypointB.bundles.size).toEqual(1);
    expect(entrypointB.bundles.has('bundle-b')).toBe(true);

    const secondLevel =
      defaultVariant.lookups['/src/second-level-component.js'];
    expect(Object.keys(secondLevel.importedBy)).toEqual([
      '/src/entrypoint-a.js',
    ]);
    expect(Object.keys(secondLevel.imports)).toEqual([
      '/src/third-level-component.js',
    ]);
    expect(Object.keys(secondLevel.importAliases)).toEqual([
      './third-level-component',
    ]);
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

    const fourthLevel =
      defaultVariant.lookups['/src/fourth-level-component.js'];
    expect(Object.keys(fourthLevel.importedBy)).toEqual([
      '/src/third-level-component.js',
    ]);
    expect(Object.keys(fourthLevel.imports)).toEqual([]);
    expect(Object.keys(fourthLevel.importAliases)).toEqual([]);
    expect(fourthLevel.bundles.size).toEqual(2);
    expect(fourthLevel.bundles.has('bundle-a')).toBe(true);
    expect(fourthLevel.bundles.has('bundle-b')).toBe(true);

    expect(entrypointA.importAliases['./second-level-component'].node).toBe(
      secondLevel,
    );
    expect(entrypointA.imports['/src/second-level-component.js'].node).toBe(
      secondLevel,
    );
    expect(entrypointB.importAliases['./third-level-component'].node).toBe(
      thirdLevel,
    );
    expect(entrypointB.imports['/src/third-level-component.js'].node).toBe(
      thirdLevel,
    );
    expect(secondLevel.importAliases['./third-level-component'].node).toBe(
      thirdLevel,
    );
    expect(secondLevel.imports['/src/third-level-component.js'].node).toBe(
      thirdLevel,
    );
    expect(thirdLevel.importAliases['./fourth-level-component'].node).toBe(
      fourthLevel,
    );
    expect(thirdLevel.imports['/src/fourth-level-component.js'].node).toBe(
      fourthLevel,
    );
  });

  it('marks dynamic and static imports correctly', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['default'], 'bundle-a');

    graph.bundleEntrypoint('/src/entrypoint-b.js', ['default'], 'bundle-b');

    graph.imports(
      '/src/entrypoint-a.js',
      '/src/dynamic-component.js',
      ['default'],
      {
        source: './dynamic-component',
        symbols: ['*'],
        type: 'dynamic',
      },
    );

    graph.imports(
      '/src/entrypoint-b.js',
      '/src/dynamic-component.js',
      ['default'],
      {
        source: './dynamic-component',
        symbols: ['*'],
        type: 'dynamic',
      },
    );

    graph.imports(
      '/src/entrypoint-b.js',
      '/src/static-component.js',
      ['default'],
      {
        source: './static-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    graph.imports(
      '/src/static-component.js',
      '/src/dynamic-component.js',
      ['default'],
      {
        source: './dynamic-component',
        symbols: ['*'],
        type: 'static',
      },
    );

    const dynamicComponent =
      graph.variants['default'].lookups['/src/dynamic-component.js'];

    expect(dynamicComponent.getImportTypeForBundle('bundle-a')).toEqual(
      'dynamic',
    );
    // if a module is imported both statically & dynamically in the same bundle
    // then we consider it to be static.
    expect(dynamicComponent.getImportTypeForBundle('bundle-b')).toEqual(
      'static',
    );
  });

  it('sets exports, content types, and generated assets correctly', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['default'], 'bundle-a');

    graph.exports('/src/entrypoint-a.js', ['default'], {
      identifier: '_',
      symbols: ['a'],
      esModule: true,
    });

    graph.exports('/src/entrypoint-a.js', ['default'], {
      identifier: '_',
      symbols: ['b'],
      esModule: true,
    });

    graph.setContentMetadata(
      '/src/entrypoint-a.js',
      ['default'],
      'text/javascript',
      'xxxx',
    );

    graph.addGenerated(
      '/src/entrypoint-a.js',
      ['default'],
      'foobar.txt',
      '/built/foobar.txt',
    );

    const entrypoint =
      graph.variants['default'].lookups['/src/entrypoint-a.js'];
    expect(entrypoint.exports.identifier).toEqual('_');
    expect(entrypoint.exports.symbols).toEqual(['a', 'b']);
    expect(entrypoint.exports.esModule).toEqual(true);
    expect(entrypoint.contentType).toEqual('text/javascript');
    expect(entrypoint.contentHash).toEqual('xxxx');
    expect(entrypoint.generatedAssets).toEqual({
      'foobar.txt': '/built/foobar.txt',
    });
  });

  it('computes symbol usage correctly', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['default'], 'bundle-a');

    graph.bundleEntrypoint('/src/entrypoint-b.js', ['default'], 'bundle-b');

    graph.imports('/src/entrypoint-b.js', '/src/component-1.js', ['default'], {
      source: './component-2',
      symbols: ['*'],
      type: 'static',
    });

    graph.imports('/src/entrypoint-a.js', '/src/component-1.js', ['default'], {
      source: './component-1',
      symbols: ['a', 'b'],
      type: 'static',
    });

    graph.imports('/src/entrypoint-a.js', '/src/component-2.js', ['default'], {
      source: './component-2',
      symbols: ['*'],
      type: 'static',
    });

    graph.imports('/src/component-2.js', '/src/component-1.js', ['default'], {
      source: './component-1',
      symbols: ['a', 'c'],
      type: 'static',
    });

    const component1 = graph.variants['default'].lookups['/src/component-1.js'];
    expect(Array.from(component1.getUsedSymbolsForBundle('bundle-a'))).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(Array.from(component1.getUsedSymbolsForBundle('bundle-b'))).toEqual([
      '*',
    ]);
  });

  it('variant graphs are independent of one another', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['en_US'], 'bundle-a');

    graph.bundleEntrypoint('/src/entrypoint-a.js', ['es_ES'], 'bundle-a');

    expect(Object.keys(graph.variants)).toEqual(['en_US', 'es_ES']);
    const entrypointEn =
      graph.variants['en_US'].lookups['/src/entrypoint-a.js'];
    const entrypointEs =
      graph.variants['es_ES'].lookups['/src/entrypoint-a.js'];
    expect(entrypointEn).not.toBe(entrypointEs);
  });
});
