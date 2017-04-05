import {
  DependencyNode,
  DependencyGraph,
} from '../dependency-graph';
import {
  generateBundlesFromWorkingSet,
} from '../dependency-graph-transformations';

describe('dependency graph manipulation tests', () => {
  it('generates bundles from a simple dependency graph', () => {
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

    graph.bundleEntrypoint(
      '/src/entrypoint-c.js',
      ['default'],
      'bundle-c'
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

    const mockWorkingSet = {
      bundles: {
        'bundle-a': [
          { name: '/src/entrypoint-a.js', folder: false },
        ],
        'bundle-b': [
          { name: '/src/entrypoint-b.js', folder: false },
        ]
      },
      commonBundles: new Set(),
    };

    const mockConfig = {
      bundles: {
        'bundle-a': {
        },
        'bundle-b': {
        },
      }
    }

    const generatedBundles = generateBundlesFromWorkingSet(
      graph,
      mockWorkingSet,
      mockConfig
    );

    expect(Object.keys(generatedBundles)).toEqual(['default']);
    expect(Object.keys(generatedBundles['default'])).toEqual([
      'bundle-a',
      'bundle-b',
    ]);
    expect(generatedBundles['default']['bundle-a'].map(m => m.module)).toEqual([
      '/src/fourth-level-component.js',  
      '/src/third-level-component.js',  
      '/src/second-level-component.js',  
      '/src/entrypoint-a.js',  
    ]);
    expect(generatedBundles['default']['bundle-b'].map(m => m.module)).toEqual([
      '/src/fourth-level-component.js',  
      '/src/third-level-component.js',  
      '/src/entrypoint-b.js',  
    ]);
  });

  it('puts modules in common bundles', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-a'
    );
    graph.setContentType(
      '/src/module-1.js',
      ['default'],
      'text/javascript'
    );

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-b'
    );

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-c'
    );

    graph.bundleEntrypoint(
      '/src/module-2.js',
      ['default'],
      'bundle-b'
    );
    graph.setContentType(
      '/src/module-2.js',
      ['default'],
      'text/javascript'
    );

    graph.bundleEntrypoint(
      '/src/module-3.js',
      ['default'],
      'bundle-c'
    );
    graph.setContentType(
      '/src/module-3.js',
      ['default'],
      'text/javascript'
    );

    graph.bundleEntrypoint(
      '/src/module-4.css',
      ['default'],
      'bundle-b'
    );
    graph.setContentType(
      '/src/module-4.css',
      ['default'],
      'text/css'
    );

    graph.bundleEntrypoint(
      '/src/module-5.css',
      ['default'],
      'bundle-c'
    );
    graph.setContentType(
      '/src/module-5.css',
      ['default'],
      'text/css'
    );

    const mockWorkingSet = {
      bundles: {
        'bundle-a': [],
        'bundle-b': [],
        'bundle-c': [],
      },
      commonBundles: new Set(['common-a-js','common-b-js','common-css']),
    };

    const mockConfig = {
      bundles: {
        'bundle-a': {
          commons: new Set(['common-a-js']),
        },
        'bundle-b': {
          commons: new Set(['common-b-js']),
        },
        'bundle-c': {
          commons: new Set(['common-b-js','common-css']),
        },
        'common-a-js': {
          contentTypes: new Set(['text/javascript']),
          threshold: 1.0,
          dependedBy: new Set(['bundle-a']),
        },
        'common-b-js': {
          contentTypes: new Set(['text/javascript']),
          threshold: 0.6,
          dependedBy: new Set(['bundle-b','bundle-c']),
        },
        'common-css': {
          contentTypes: new Set(['text/css']),
          threshold: 0,
          dependedBy: new Set(['bundle-c']),
        },
      }
    }

    const generatedBundles = generateBundlesFromWorkingSet(
      graph,
      mockWorkingSet,
      mockConfig
    );

    expect(Object.keys(generatedBundles['default'])).toEqual([
      'common-a-js',
      'common-b-js',
      'bundle-b',
      'bundle-c',
      'common-css',
    ]);
    expect(generatedBundles['default']['common-a-js'].map(m => m.module)).toEqual([
      '/src/module-1.js',  
    ]);
    expect(generatedBundles['default']['common-b-js'].map(m => m.module)).toEqual([
      '/src/module-1.js',  
    ]);
    expect(generatedBundles['default']['bundle-b'].map(m => m.module)).toEqual([
      '/src/module-2.js',  
      '/src/module-4.css',  
    ]);
    expect(generatedBundles['default']['bundle-c'].map(m => m.module)).toEqual([
      '/src/module-3.js',  
    ]);
    expect(generatedBundles['default']['common-css'].map(m => m.module)).toEqual([
      '/src/module-5.css',  
    ]);
  });

  it('Externalizes modules in a dependent library bundle', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-a'
    );

    graph.bundleEntrypoint(
      '/src/module-2.js',
      ['default'],
      'bundle-a'
    );

    graph.bundleEntrypoint(
      '/src/module-2.js',
      ['default'],
      'lib-bundle'
    );

    const mockWorkingSet = {
      bundles: {
        'bundle-a': [],
        'lib-bundle': [],
      },
      commonBundles: new Set(),
    };

    const mockConfig = {
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          depends: new Set(['lib-bundle']),
        },
        'lib-bundle': {
          type: 'library',
          dependedBy: new Set(['bundle-a']),
        },
      }
    }

    const generatedBundles = generateBundlesFromWorkingSet(
      graph,
      mockWorkingSet,
      mockConfig
    );

    expect(Object.keys(generatedBundles)).toEqual(['default']);
    expect(Object.keys(generatedBundles['default'])).toEqual([
      'bundle-a',
      'lib-bundle',
    ]);
    expect(generatedBundles['default']['bundle-a'].map(m => m.module)).toEqual([
      '/src/module-1.js',  
    ]);
    expect(generatedBundles['default']['lib-bundle'].map(m => m.module)).toEqual([
      '/src/module-2.js',  
    ]);
  });
});
