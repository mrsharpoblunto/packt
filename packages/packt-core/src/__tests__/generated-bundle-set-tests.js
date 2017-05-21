import {
  DependencyNode,
  DependencyGraph,
} from '../dependency-graph';
import {
  GeneratedBundleSet
} from '../generated-bundle-set';
import {
  generateBundleLookups,
} from '../bundle-utils';
import OutputPathHelpers from '../output-path-helpers';
import {parseConfig} from '../packt-config';

function parseMockConfig(configJson) {
  const mockResolver = {
    resolve: (require, configFile, expectFolder, cb) => cb(null, require),
  };
  return parseConfig('/packt.config.js', configJson, { resolver: mockResolver });
}

function generateMockWorkingSet(config) {
  const workingSet = {
    bundles: {},
    commonBundles: new Set(),
  };
  for (let bundleName in config.bundles) {
    if (config.bundles[bundleName].type === 'common') {
      workingSet.commonBundles.add(bundleName);
    } else {
      workingSet.bundles[bundleName] = [];
    }
  }
  return workingSet;
}

function mockEntryPoint(
  graph,
  module,
  variants,
  bundleName
) {
  graph.bundleEntrypoint(
    module,
    variants,
    bundleName
  );
  graph.setContentMetadata(
    module,
    variants,
    'text/javascript',
    module
  );
}

function mockDependent(
  graph,
  parentModule,
  module,
  variants,
  importDeclaration,
) {

  graph.imports(
    parentModule,
    module,
    variants,
    importDeclaration
  );
  graph.setContentMetadata(
    module,
    variants,
    'text/javascript',
    module
  );
}

describe('generated bundle set tests', () => {
  it('generates bundles from a simple dependency graph', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(
      graph,
      '/src/entrypoint-a.js',
      ['default'],
      'bundle-a'
    );

    mockEntryPoint(
      graph,
      '/src/entrypoint-b.js',
      ['default'],
      'bundle-b'
    );

    mockEntryPoint(
      graph,
      '/src/entrypoint-c.js',
      ['default'],
      'bundle-c'
    );

    mockDependent(
      graph,
      '/src/entrypoint-a.js',
      '/src/second-level-component.js',
      ['default'],
      {
        source: './second-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );
    
    mockDependent(
      graph,
      '/src/entrypoint-b.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    mockDependent(
      graph,
      '/src/third-level-component.js',
      '/src/fourth-level-component.js',
      ['default'],
      {
        source: './fourth-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    mockDependent(
      graph,
      '/src/second-level-component.js',
      '/src/third-level-component.js',
      ['default'],
      {
        source: './third-level-component',
        symbols: ['*'],
        type: 'static',
      }
    );

    return parseMockConfig({
      "bundles": {
        "bundle-a": {
          type: "entrypoint",
          requires: ["/src/entrypoint-a.js"],
          bundler: "js",
        },
        "bundle-b": {
          type: "entrypoint",
          requires: ["/src/entrypoint-b.js"],
          bundler: "js",
        },
        "bundle-c": {
          type: "entrypoint",
          requires: ["/src/entrypoint-c.js"],
          bundler: "js",
        },
      },
      "bundlers": {
        "js": {
          "require": "bundler.js",
        },
      },
      "handlers": [
        {
          "pattern": ".js",
          "require": "handler.js",
        },
      ],
    }).then((config) => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a',
        'bundle-b',
        'bundle-c',
      ]);
      expect(generatedBundles.getStaticBundle('bundle-a').modules.map(m => m.module)).toEqual([
        '/src/fourth-level-component.js',  
        '/src/third-level-component.js',  
        '/src/second-level-component.js',  
        '/src/entrypoint-a.js',  
      ]);
      expect(generatedBundles.getStaticBundle('bundle-b').modules.map(m => m.module)).toEqual([
        '/src/fourth-level-component.js',  
        '/src/third-level-component.js',  
        '/src/entrypoint-b.js',  
      ]);
      expect(generatedBundles.getStaticBundle('bundle-c').modules.map(m => m.module)).toEqual([
        '/src/entrypoint-c.js',  
      ]);
    });
  });

  /*it('puts modules in common bundles', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-a'
    );
    graph.setContentMetadata(
      '/src/module-1.js',
      ['default'],
      'text/javascript',
      'xxxx',
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
    graph.setContentMetadata(
      '/src/module-2.js',
      ['default'],
      'text/javascript',
      'xxxx',
    );

    graph.bundleEntrypoint(
      '/src/module-3.js',
      ['default'],
      'bundle-c'
    );
    graph.setContentMetadata(
      '/src/module-3.js',
      ['default'],
      'text/javascript',
      'xxxx',
    );

    graph.bundleEntrypoint(
      '/src/module-4.css',
      ['default'],
      'bundle-b'
    );
    graph.setContentMetadata(
      '/src/module-4.css',
      ['default'],
      'text/css',
      'xxxx',
    );

    graph.bundleEntrypoint(
      '/src/module-5.css',
      ['default'],
      'bundle-c'
    );
    graph.setContentMetadata(
      '/src/module-5.css',
      ['default'],
      'text/css',
      'xxxx'
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
      invariantOptions: {
        outputHash: 'md5',
        outputHashLength: 6,
        outputPath: '/build',
        outputPublicPath: '/',
      },
      bundles: {
        'bundle-a': {
          commons: {'common-a-js': true },
          bundler: 'js',
        },
        'bundle-b': {
          commons: {'common-b-js': true },
          bundler: 'js',
        },
        'bundle-c': {
          commons: {
            'common-b-js': true,
            'common-css': true,
          },
          bundler: 'js',
        },
        'common-a-js': {
          contentTypes: { 'text/javascript': true },
          threshold: 1.0,
          dependedBy: { 'bundle-a': true },
          bundler: 'js',
        },
        'common-b-js': {
          contentTypes: { 'text/javascript': true },
          threshold: 0.6,
          dependedBy: {
            'bundle-b': true,
            'bundle-c': true,
          },
          bundler: 'js',
        },
        'common-css': {
          contentTypes: { 'text/css': true },
          threshold: 0,
          dependedBy: { 'bundle-c': true },
          bundler: 'css',
        },
      },
      bundlers: {
        'js': {
          invariantOptions: {
            outputPathFormat: '${hash}/${name}${ext}',
            assetNameFormat: '${name}${ext}',
          },
          options: {
            'default': {},
          }
        },
        'css': {
          invariantOptions: {
            outputPathFormat: '${hash}/${name}${ext}',
            assetNameFormat: '${name}${ext}',
          },
          options: {
            'default': {},
          }
        }
      }
    }

    const outputPathHelpers = new OutputPathHelpers(mockConfig);
    const generatedBundles = generateBundlesFromWorkingSet(
      graph,
      mockWorkingSet,
      mockConfig,
      outputPathHelpers
    );

    expect(generatedBundles['default'].staticBundleMap).toEqual([
      'common-a-js',
      'common-b-js',
      'common-c-js',
      'bundle-b',
      'bundle-c',
      'common-css',
    ]);
    expect(generatedBundles['default'].staticBundleMap['common-a-js'].map(m => m.module)).toEqual([
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

    graph.imports(
      '/src/module-1.js',
      '/src/module-2.js',
      ['default'],
      {
        source: './module-2',
        symbols: ['*'],
        type: 'static',
      }
    );

    graph.bundleEntrypoint(
      '/src/module-2.js',
      ['default'],
      'lib-bundle'
    );

    graph.imports(
      '/src/module-2.js',
      '/src/module-3.js',
      ['default'],
      {
        source: './module-3',
        symbols: ['*'],
        type: 'static',
      }
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
          depends: { 'lib-bundle': true },
        },
        'lib-bundle': {
          type: 'library',
          dependedBy: { 'bundle-a': true },
        },
      }
    }

    const generatedBundles = generateStaticBundlesFromWorkingSet(
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
      '/src/module-3.js',  
      '/src/module-2.js',  
    ]);
  });

  it('Creates dynamic sub-bundles', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/module-1.js',
      ['default'],
      'bundle-a.js'
    );
    graph.setContentMetadata(
      '/src/module-1.js',
      ['default'],
      'text/javascript',
      '1'
    );

    graph.imports(
      '/src/module-1.js',
      '/src/module-2.js',
      ['default'],
      {
        source: './module-2',
        symbols: ['*'],
        type: 'static',
      }
    );
    graph.setContentMetadata(
      '/src/module-2.js',
      ['default'],
      'text/javascript',
      '2'
    );

    graph.imports(
      '/src/module-1.js',
      '/src/module-3.js',
      ['default'],
      {
        source: './module-3',
        symbols: ['*'],
        type: 'static',
      }
    );
    graph.setContentMetadata(
      '/src/module-3.js',
      ['default'],
      'text/javascript',
      '3'
    );

    graph.imports(
      '/src/module-1.js',
      '/src/module-4.js',
      ['default'],
      {
        source: './module-4',
        symbols: ['*'],
        type: 'dynamic',
      }
    );
    graph.setContentMetadata(
      '/src/module-4.js',
      ['default'],
      'text/javascript',
      '4'
    );

    graph.imports(
      '/src/module-4.js',
      '/src/module-5.js',
      ['default'],
      {
        source: './module-5',
        symbols: ['*'],
        type: 'static',
      }
    );
    graph.setContentMetadata(
      '/src/module-5.js',
      ['default'],
      'text/javascript',
      '5'
    );

    graph.imports(
      '/src/module-5.js',
      '/src/module-3.js',
      ['default'],
      {
        source: './module-3',
        symbols: ['*'],
        type: 'static',
      }
    );

    graph.imports(
      '/src/module-5.js',
      '/src/module-6.js',
      ['default'],
      {
        source: './module-6',
        symbols: ['*'],
        type: 'dynamic',
      }
    );
    graph.setContentMetadata(
      '/src/module-6.js',
      ['default'],
      'text/javascript',
      '6'
    );

    const mockWorkingSet = {
      bundles: {
        'bundle-a.js': [],
      },
      commonBundles: new Set(),
    };

    const mockConfig = {
      invariantOptions: {
        outputHash: 'md5',
        outputHashLength: 6,
        outputPath: '/build',
        outputPublicPath: '/',
      },
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          depends: {},
          bundler: 'js',
        },
      },
      bundlers: {
        'js': {
          invariantOptions: {
            outputPathFormat: '${hash}/${name}${ext}',
            assetNameFormat: '${name}${ext}',
          },
          options: {
            'default': {},
          }
        }
      }
    };

    const generatedStaticBundles = generateStaticBundlesFromWorkingSet(
      graph,
      mockWorkingSet,
      mockConfig
    );

    const generatedBundles = {
      dynamicBundleMap: {},
      dynamicBundles: {},
      denormalizedStaticBundles: {},
    };

    const outputPathHelpers = new OutputPathHelpers(mockConfig);

    splitDynamicBundles(
      'bundle-a.js',
      'default',
      generatedStaticBundles['default']['bundle-a.js'],
      mockConfig,
      outputPathHelpers,
      generatedBundles
    );

    expect(Object.keys(generatedBundles.dynamicBundleMap)).toEqual([
      'bundle-a.js:/src/module-6.js',
      'bundle-a.js:/src/module-4.js',
    ]);

    const MODULE6_HASH = '810980';
    expect(generatedBundles.dynamicBundleMap['bundle-a.js:/src/module-6.js']).toEqual({
      hash: MODULE6_HASH,
      paths: {
        assetName: `${MODULE6_HASH}.js`,
        outputParentPath: `/build/${MODULE6_HASH}`,
        outputPath: `/build/${MODULE6_HASH}/${MODULE6_HASH}.js`,
        outputPublicPath: `/${MODULE6_HASH}/${MODULE6_HASH}.js`,
      },
    });
    expect(generatedBundles.dynamicBundles[MODULE6_HASH].map(m => m.module)).toEqual([
      '/src/module-6.js',
    ]);

    const MODULE4_HASH = '5527967';
    expect(generatedBundles.dynamicBundleMap['bundle-a.js:/src/module-4.js']).toEqual({
      hash: MODULE4_HASH,
      paths: {
        assetName: `${MODULE4_HASH}.js`,
        outputParentPath: `/build/${MODULE4_HASH}`,
        outputPath: `/build/${MODULE4_HASH}/${MODULE4_HASH}.js`,
        outputPublicPath: `/${MODULE4_HASH}/${MODULE4_HASH}.js`,
      },
    });
    expect(generatedBundles.dynamicBundles[MODULE4_HASH].map(m => m.module)).toEqual([
      '/src/module-5.js',
      '/src/module-4.js',
    ]);

    const BUNDLEA_HASH = 'ef08d6';
    expect(generatedBundles.staticBundleMap['bundle-a.js']).toEqual({
      hash: BUNDLEA_HASH,
      paths: {
        assetName: `bundle-a.js`,
        outputParentPath: `/build/${BUNDLEA_HASH}`,
        outputPath: `/build/${BUNDLEA_HASH}/bundle-a.js`,
        outputPublicPath: `/${BUNDLEA_HASH}/bundle-a.js`,
      },
    });
    expect(generatedBundles.staticBundles[BUNDLEA_HASH].map(m => m.module)).toEqual([
      '/src/module-2.js',
      '/src/module-3.js',
      '/src/module-1.js',
    ]);
  });

  it('Generates bundle maps', () => {
    const graph = new DependencyGraph();

    graph.bundleEntrypoint(
      '/src/entrypoint-a.js',
      ['default'],
      'bundle-a'
    );

    graph.exports(
      '/src/entrypoint-a.js',
      ['default'],
      {
        identifier: '_',
        symbols: ['*'],
        esModule: true,
      }
    );

    graph.addGenerated(
      '/src/entrypoint-a.js',
      ['default'],
      'asset-a',
      '/build/asset-a.png'
    );

    graph.bundleEntrypoint(
      '/src/entrypoint-b.js',
      ['default'],
      'bundle-b'
    );

    graph.exports(
      '/src/entrypoint-b.js',
      ['default'],
      {
        identifier: '$',
        symbols: ['foo'],
        esModule: false,
      }
    );

    graph.addGenerated(
      '/src/entrypoint-b.js',
      ['default'],
      'asset-b',
      '/build/asset-b.png'
    );

    const mockGeneratedBundles = {
      'default': {
        dynamicBundleMap: {
          'bundle-a:/src/dynamic-bundle': {
            paths: {
              outputPublicPath: '/dynamic-bundle.js',
            },
          },
        },
      },
    };

    const lookups = generateBundleLookups(graph, mockGeneratedBundles);

    expect(Object.keys(lookups)).toEqual(['default']);
    expect(lookups['default'].assetMap).toEqual({
      'asset-a':'/build/asset-a.png',
      'asset-b':'/build/asset-b.png',
    });
    expect(lookups['default'].moduleMap).toEqual({
      '/src/entrypoint-a.js': {
        exportsIdentifier: '_',
        exportsESModule: true,
      },
      '/src/entrypoint-b.js': {
        exportsIdentifier: '$',
        exportsESModule: false,
      },
    });
    expect(lookups['default'].dynamicBundleMap).toEqual({
      'bundle-a:/src/dynamic-bundle': '/dynamic-bundle.js', 
    });
  });*/

});
