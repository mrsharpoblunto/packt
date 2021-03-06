import path from 'path';
import { DependencyNode, DependencyGraph } from '../dependency-graph';
import { GeneratedBundleSet } from '../generated-bundle-set';
import { generateBundleLookups } from '../bundle-utils';
import OutputPathHelpers from '../output-path-helpers';
import { parseConfig } from '../packt-config';

function parseMockConfig(configJson) {
  const mockResolver = {
    resolve: (require, configFile, expectFolder, cb) => cb(null, require),
  };
  return parseConfig('/packt.config.js', configJson, {
    resolver: mockResolver,
  });
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

function mockEntryPoint(graph, module, variants, bundleName) {
  graph.bundleEntrypoint(module, variants, bundleName);
  let contentType;
  switch (path.extname(module)) {
    case '.js':
      contentType = 'text/javascript';
      break;
    case '.css':
      contentType = 'text/css';
      break;
    default:
      throw new Error('Unexpected content type');
  }
  graph.setContentMetadata(module, variants, contentType, module);
}

function mockDependent(
  graph,
  parentModule,
  module,
  variants,
  importDeclaration,
) {
  graph.imports(parentModule, module, variants, importDeclaration);
  graph.setContentMetadata(module, variants, 'text/javascript', module);
}

describe('generated bundle set tests', () => {
  it('generates bundles from a simple dependency graph', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/entrypoint-a.js', ['default'], 'bundle-a.js');

    mockEntryPoint(graph, '/src/entrypoint-b.js', ['default'], 'bundle-b.js');

    mockEntryPoint(graph, '/src/entrypoint-c.js', ['default'], 'bundle-c.js');

    mockDependent(
      graph,
      '/src/entrypoint-a.js',
      '/src/second-level-component.js',
      ['default'],
      {
        source: './second-level-component',
        symbols: ['*'],
        type: 'static',
      },
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
      },
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
      },
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
      },
    );

    return parseMockConfig({
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          requires: ['/src/entrypoint-a.js'],
          bundler: 'js',
        },
        'bundle-b.js': {
          type: 'entrypoint',
          requires: ['/src/entrypoint-b.js'],
          bundler: 'js',
        },
        'bundle-c.js': {
          type: 'entrypoint',
          requires: ['/src/entrypoint-c.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a.js',
        'bundle-b.js',
        'bundle-c.js',
      ]);

      const bundleA = generatedBundles.getStaticBundle('bundle-a.js');
      expect(bundleA.modules.map(m => m.module)).toEqual([
        '/src/fourth-level-component.js',
        '/src/third-level-component.js',
        '/src/second-level-component.js',
        '/src/entrypoint-a.js',
      ]);
      expect(bundleA.paths).toEqual({
        assetName: `bundle-a.js`,
        outputParentPath: `/build/bundles`,
        outputPath: `/build/bundles/bundle-a_${bundleA.hash}.js`,
        outputPublicPath: `/bundles/bundle-a_${bundleA.hash}.js`,
      });

      const bundleB = generatedBundles.getStaticBundle('bundle-b.js');
      expect(bundleB.modules.map(m => m.module)).toEqual([
        '/src/fourth-level-component.js',
        '/src/third-level-component.js',
        '/src/entrypoint-b.js',
      ]);
      expect(bundleB.paths).toEqual({
        assetName: `bundle-b.js`,
        outputParentPath: `/build/bundles`,
        outputPath: `/build/bundles/bundle-b_${bundleB.hash}.js`,
        outputPublicPath: `/bundles/bundle-b_${bundleB.hash}.js`,
      });

      const bundleC = generatedBundles.getStaticBundle('bundle-c.js');
      expect(bundleC.modules.map(m => m.module)).toEqual([
        '/src/entrypoint-c.js',
      ]);
      expect(bundleC.paths).toEqual({
        assetName: `bundle-c.js`,
        outputParentPath: `/build/bundles`,
        outputPath: `/build/bundles/bundle-c_${bundleC.hash}.js`,
        outputPublicPath: `/bundles/bundle-c_${bundleC.hash}.js`,
      });
    });
  });

  it('puts modules in common bundles', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-a');

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-b');

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-c');

    mockEntryPoint(graph, '/src/module-2.js', ['default'], 'bundle-b');

    mockEntryPoint(graph, '/src/module-3.js', ['default'], 'bundle-c');

    mockEntryPoint(graph, '/src/module-4.css', ['default'], 'bundle-b');

    mockEntryPoint(graph, '/src/module-5.css', ['default'], 'bundle-c');

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/module-1.js'],
          bundler: 'js',
          depends: ['common-a-js'],
        },
        'bundle-b': {
          type: 'entrypoint',
          requires: [
            '/src/module-1.js',
            '/src/module-2.js',
            '/src/module-4.css',
          ],
          depends: ['common-b-js'],
          bundler: 'js',
        },
        'bundle-c': {
          type: 'entrypoint',
          requires: [
            '/src/module-1.js',
            '/src/module-3.js',
            '/src/module-5.css',
          ],
          depends: ['common-b-js', 'common-css'],
          bundler: 'js',
        },
        'common-a-js': {
          type: 'common',
          contentTypes: ['text/javascript'],
          threshold: 1.0,
          bundler: 'js',
        },
        'common-b-js': {
          type: 'common',
          contentTypes: ['text/javascript'],
          threshold: 0.6,
          bundler: 'js',
        },
        'common-css': {
          type: 'common',
          contentTypes: ['text/css'],
          threshold: 0,
          bundler: 'css',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
        css: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a',
        'bundle-b',
        'bundle-c',
        'common-a-js',
        'common-b-js',
        'common-css',
      ]);
      expect(
        generatedBundles.getStaticBundle('bundle-a').modules.map(m => m.module),
      ).toEqual(
        [
          // all of bundle a is extracted into common-a-js
        ],
      );
      expect(
        generatedBundles.getStaticBundle('bundle-b').modules.map(m => m.module),
      ).toEqual(['/src/module-2.js', '/src/module-4.css']);
      expect(
        generatedBundles.getStaticBundle('bundle-c').modules.map(m => m.module),
      ).toEqual(['/src/module-3.js']);
      expect(
        generatedBundles
          .getStaticBundle('common-a-js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-1.js']);
      expect(
        generatedBundles
          .getStaticBundle('common-b-js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-1.js']);
      expect(
        generatedBundles
          .getStaticBundle('common-css')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-5.css']);
    });
  });

  it('Externalizes modules in a dependent library bundle', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-a');

    mockDependent(graph, '/src/module-1.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'static',
    });

    mockEntryPoint(graph, '/src/module-2.js', ['default'], 'lib-bundle');

    mockDependent(graph, '/src/module-2.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/module-1.js'],
          bundler: 'js',
          depends: ['lib-bundle'],
        },
        'lib-bundle': {
          type: 'library',
          requires: ['/src/module-2.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a',
        'lib-bundle',
      ]);
      expect(
        generatedBundles.getStaticBundle('bundle-a').modules.map(m => m.module),
      ).toEqual(['/src/module-1.js']);
      expect(
        generatedBundles
          .getStaticBundle('lib-bundle')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-3.js', '/src/module-2.js']);
    });
  });

  it('Creates dynamic sub-bundles', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-a.js');

    mockDependent(graph, '/src/module-1.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-1.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(
      graph,
      '/src/module-3.js',
      '/src/module-3-a.js',
      ['default'],
      {
        source: './module-3-a',
        symbols: ['*'],
        type: 'static',
      },
    );

    mockDependent(graph, '/src/module-1.js', '/src/module-4.js', ['default'], {
      source: './module-4',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockDependent(graph, '/src/module-4.js', '/src/module-5.js', ['default'], {
      source: './module-5',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-5.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-5.js', '/src/module-6.js', ['default'], {
      source: './module-6',
      symbols: ['*'],
      type: 'dynamic',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          requires: ['/src/module-1.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a.js',
        'bundle-a.js:/src/module-4.js',
        'bundle-a.js:/src/module-6.js',
      ]);

      expect(
        generatedBundles
          .getStaticBundle('bundle-a.js')
          .modules.map(m => m.module),
      ).toEqual([
        '/src/module-2.js',
        '/src/module-3-a.js',
        '/src/module-3.js',
        '/src/module-1.js',
      ]);

      const module4Bundle = generatedBundles.getDynamicBundle(
        'bundle-a.js:/src/module-4.js',
      );
      expect(module4Bundle.modules.map(m => m.module)).toEqual([
        '/src/module-5.js',
        '/src/module-4.js',
      ]);
      expect(module4Bundle.paths).toEqual({
        assetName: `bundle-a.js_module-4.js`,
        outputParentPath: `/build/bundles/dynamic`,
        outputPath: `/build/bundles/dynamic/${module4Bundle.hash}.js`,
        outputPublicPath: `/bundles/dynamic/${module4Bundle.hash}.js`,
      });

      const module6Bundle = generatedBundles.getDynamicBundle(
        'bundle-a.js:/src/module-6.js',
      );
      expect(module6Bundle.modules.map(m => m.module)).toEqual([
        '/src/module-6.js',
      ]);
      expect(module6Bundle.paths).toEqual({
        assetName: `bundle-a.js_module-6.js`,
        outputParentPath: `/build/bundles/dynamic`,
        outputPath: `/build/bundles/dynamic/${module6Bundle.hash}.js`,
        outputPublicPath: `/bundles/dynamic/${module6Bundle.hash}.js`,
      });
    });
  });

  it('Dynamic bundle modules arent considered as common bundle candidates', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-1.js', ['default'], 'bundle-a.js');

    mockDependent(graph, '/src/module-1.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-1.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockDependent(graph, '/src/module-3.js', '/src/module-4.js', ['default'], {
      source: './module-4',
      symbols: ['*'],
      type: 'static',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          requires: ['/src/module-1.js'],
          depends: ['common.js'],
          bundler: 'js',
        },
        'common.js': {
          type: 'common',
          contentTypes: ['text/javascript'],
          threshold: 0,
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a.js',
        'common.js',
        'bundle-a.js:/src/module-3.js',
      ]);

      expect(
        generatedBundles
          .getStaticBundle('bundle-a.js')
          .modules.map(m => m.module),
      ).toEqual(
        [
          // everything in bundle-a should have been extracted to common.js
        ],
      );

      // even though modules 3&4 appeared above the common threshold in bundle-a, they are not added
      // to the common set because they were imported dynamically
      const module3Bundle = generatedBundles.getDynamicBundle(
        'bundle-a.js:/src/module-3.js',
      );
      expect(module3Bundle.modules.map(m => m.module)).toEqual([
        '/src/module-4.js',
        '/src/module-3.js',
      ]);

      // only statically imported bundles from bundle-a got put in commons
      const commonBundle = generatedBundles.getStaticBundle('common.js');
      expect(commonBundle.modules.map(m => m.module)).toEqual([
        '/src/module-2.js',
        '/src/module-1.js',
      ]);
    });
  });

  it('Dynamic sub-bundles have resources common to the parent extracted to the parents common module', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-a.js', ['default'], 'bundle-a.js');

    mockEntryPoint(graph, '/src/module-3.js', ['default'], 'bundle-a.js');

    mockDependent(graph, '/src/module-a.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockDependent(graph, '/src/module-2.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-2.js', '/src/module-4.js', ['default'], {
      source: './module-4',
      symbols: ['*'],
      type: 'static',
    });

    mockEntryPoint(graph, '/src/module-b.js', ['default'], 'bundle-b.js');

    mockEntryPoint(graph, '/src/module-4.js', ['default'], 'bundle-b.js');

    mockDependent(graph, '/src/module-b.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockEntryPoint(graph, '/src/module-c.js', ['default'], 'bundle-c.js');

    mockEntryPoint(graph, '/src/module-3.js', ['default'], 'bundle-c.js');

    return parseMockConfig({
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          requires: ['/src/module-a.js', '/src/module-3.js'],
          depends: ['common.js'],
          bundler: 'js',
        },
        'bundle-b.js': {
          type: 'entrypoint',
          requires: ['/src/module-b.js', '/src/module-4.js'],
          depends: ['common.js'],
          bundler: 'js',
        },
        'bundle-c.js': {
          type: 'entrypoint',
          requires: ['/src/module-c.js', '/src/module-3.js'],
          depends: ['common.js'],
          bundler: 'js',
        },
        'common.js': {
          type: 'common',
          contentTypes: ['text/javascript'],
          threshold: 0.5,
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a.js',
        'bundle-b.js',
        'bundle-c.js',
        'common.js',
        'bundle-a.js:/src/module-2.js',
        'bundle-b.js:/src/module-2.js',
      ]);

      expect(
        generatedBundles
          .getStaticBundle('bundle-a.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-a.js']);
      expect(
        generatedBundles
          .getStaticBundle('bundle-b.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-4.js', '/src/module-b.js']);
      expect(
        generatedBundles
          .getStaticBundle('bundle-c.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-c.js']);
      expect(
        generatedBundles
          .getStaticBundle('common.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-3.js']);

      const module3aBundle = generatedBundles.getDynamicBundle(
        'bundle-a.js:/src/module-2.js',
      );
      expect(module3aBundle.modules.map(m => m.module)).toEqual([
        '/src/module-4.js',
        '/src/module-2.js',
      ]);
      const module3bBundle = generatedBundles.getDynamicBundle(
        'bundle-b.js:/src/module-2.js',
      );
      expect(module3bBundle.modules.map(m => m.module)).toEqual([
        '/src/module-2.js',
      ]);
    });
  });

  it('Duplicate dynamic children can be preserved', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-a.js', ['default'], 'bundle-a.js');

    mockEntryPoint(graph, '/src/module-3.js', ['default'], 'bundle-a.js');

    mockDependent(graph, '/src/module-a.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockDependent(graph, '/src/module-2.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-2.js', '/src/module-4.js', ['default'], {
      source: './module-4',
      symbols: ['*'],
      type: 'static',
    });

    mockEntryPoint(graph, '/src/module-b.js', ['default'], 'bundle-b.js');

    mockEntryPoint(graph, '/src/module-4.js', ['default'], 'bundle-b.js');

    mockDependent(graph, '/src/module-b.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'dynamic',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a.js': {
          type: 'entrypoint',
          requires: ['/src/module-a.js', '/src/module-3.js'],
          dynamicChildren: {
            preserveDuplicates: false,
          },
          bundler: 'js',
        },
        'bundle-b.js': {
          type: 'entrypoint',
          requires: ['/src/module-b.js', '/src/module-4.js'],
          dynamicChildren: {
            preserveDuplicates: true,
          },
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a.js',
        'bundle-b.js',
        'bundle-a.js:/src/module-2.js',
        'bundle-b.js:/src/module-2.js',
      ]);

      expect(
        generatedBundles
          .getStaticBundle('bundle-a.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-a.js', '/src/module-3.js']);
      expect(
        generatedBundles
          .getStaticBundle('bundle-b.js')
          .modules.map(m => m.module),
      ).toEqual(['/src/module-4.js', '/src/module-b.js']);

      // this bundle has had module-3 removed because it is statically present in bundle-a, and bundle-a
      // is configured to remove any modules from dynamic bundles that are also statically included
      const module3aBundle = generatedBundles.getDynamicBundle(
        'bundle-a.js:/src/module-2.js',
      );
      expect(module3aBundle.modules.map(m => m.module)).toEqual([
        '/src/module-4.js',
        '/src/module-2.js',
      ]);
      // this bundle still has module-3 because bundle-b has been configured to preserve duplicates in
      // the parent & dynamic child bundles
      const module3bBundle = generatedBundles.getDynamicBundle(
        'bundle-b.js:/src/module-2.js',
      );
      expect(module3bBundle.modules.map(m => m.module)).toEqual([
        '/src/module-3.js',
        '/src/module-4.js',
        '/src/module-2.js',
      ]);
    });
  });

  it('Generates bundle maps', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/entrypoint-a.js', ['default'], 'bundle-a');

    graph.exports('/src/entrypoint-a.js', ['default'], {
      identifier: '_',
      symbols: ['*'],
      esModule: true,
    });

    graph.addGenerated(
      '/src/entrypoint-a.js',
      ['default'],
      'asset-a',
      '/build/asset-a.png',
    );

    mockEntryPoint(graph, '/src/entrypoint-b.js', ['default'], 'bundle-b');

    graph.exports('/src/entrypoint-b.js', ['default'], {
      identifier: '$',
      symbols: ['foo'],
      esModule: false,
    });

    graph.addGenerated(
      '/src/entrypoint-b.js',
      ['default'],
      'asset-b',
      '/build/asset-b.png',
    );

    mockDependent(
      graph,
      '/src/entrypoint-a.js',
      '/src/dynamic-bundle.js',
      ['default'],
      {
        source: './dynamic-bundle',
        symbols: ['*'],
        type: 'dynamic',
      },
    );

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/entrypoint-a.js'],
          bundler: 'js',
        },
        'bundle-b': {
          type: 'entrypoint',
          requires: ['/src/entrypoint-b.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      const lookups = generateBundleLookups(graph, {
        default: generatedBundles,
      });

      expect(Object.keys(lookups)).toEqual(['default']);
      expect(lookups['default'].assetMap).toEqual({
        'asset-a': '/build/asset-a.png',
        'asset-b': '/build/asset-b.png',
      });
      expect(lookups['default'].moduleMap).toEqual({
        '/src/dynamic-bundle.js': {
          exportsIdentifier: '',
          exportsESModule: false,
        },
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
        'bundle-a:/src/dynamic-bundle.js': `/bundles/dynamic/${generatedBundles.getDynamicBundle(
          'bundle-a:/src/dynamic-bundle.js',
        ).hash}.js`,
      });
    });
  });

  it('Tracks used symbols across static bundles', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-a.js', ['default'], 'bundle-a');

    mockDependent(graph, '/src/module-a.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['foo'],
      type: 'static',
    });
    graph.exports('/src/module-1.js', ['default'], {
      identifier: '_',
      symbols: ['foo', 'bar'],
      esModule: true,
    });

    mockDependent(graph, '/src/module-a.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['alpha'],
      type: 'static',
    });
    graph.exports('/src/module-2.js', ['default'], {
      identifier: '_',
      symbols: ['alpha', 'beta'],
      esModule: true,
    });

    mockEntryPoint(graph, '/src/module-b.js', ['default'], 'bundle-b');

    mockDependent(graph, '/src/module-b.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['bar'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-b.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['*'],
      type: 'static',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/module-a.js'],
          bundler: 'js',
        },
        'bundle-b': {
          type: 'entrypoint',
          requires: ['/src/module-b.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a',
        'bundle-b',
      ]);
      const bundleA = generatedBundles.getStaticBundle('bundle-a');
      expect(bundleA.usedSymbols).toEqual({
        '/src/module-2.js': ['alpha'],
        '/src/module-1.js': ['foo'],
        '/src/module-a.js': [],
      });
      const bundleB = generatedBundles.getStaticBundle('bundle-b');
      expect(bundleB.usedSymbols).toEqual({
        '/src/module-2.js': ['*'],
        '/src/module-1.js': ['bar'],
        '/src/module-b.js': [],
      });
    });
  });

  it('Tracks used symbols across dynamic bundles', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-a.js', ['default'], 'bundle-a');

    mockDependent(graph, '/src/module-a.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['*'],
      type: 'dynamic',
    });
    graph.exports('/src/module-1.js', ['default'], {
      identifier: '_',
      symbols: ['default'],
      esModule: true,
    });

    mockDependent(graph, '/src/module-1.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['alpha'],
      type: 'static',
    });
    graph.exports('/src/module-2.js', ['default'], {
      identifier: '_',
      symbols: ['alpha', 'beta'],
      esModule: true,
    });

    mockEntryPoint(graph, '/src/module-b.js', ['default'], 'bundle-b');

    mockDependent(graph, '/src/module-b.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['*'],
      type: 'dynamic',
    });

    mockDependent(graph, '/src/module-b.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['beta'],
      type: 'static',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/module-a.js'],
          bundler: 'js',
        },
        'bundle-b': {
          type: 'entrypoint',
          requires: ['/src/module-b.js'],
          dynamicChildren: {
            preserveDuplicates: true,
          },
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'bundle-a',
        'bundle-b',
        'bundle-a:/src/module-1.js',
        'bundle-b:/src/module-1.js',
      ]);
      const bundleA = generatedBundles.getStaticBundle('bundle-a');
      expect(bundleA.usedSymbols).toEqual({
        '/src/module-a.js': [],
      });
      const bundleB = generatedBundles.getStaticBundle('bundle-b');
      expect(bundleB.usedSymbols).toEqual({
        '/src/module-2.js': ['alpha', 'beta'],
        '/src/module-b.js': [],
      });
      const dynamicBundleA = generatedBundles.getDynamicBundle(
        'bundle-a:/src/module-1.js',
      );
      expect(dynamicBundleA.usedSymbols).toEqual({
        '/src/module-2.js': ['alpha'],
        '/src/module-1.js': ['*'],
      });
      const dynamicBundleB = generatedBundles.getDynamicBundle(
        'bundle-b:/src/module-1.js',
      );
      expect(dynamicBundleB.usedSymbols).toEqual({
        '/src/module-2.js': ['alpha', 'beta'],
        '/src/module-1.js': ['*'],
      });
    });
  });

  it('Tracks used symbols in common and library bundles', () => {
    const graph = new DependencyGraph();

    mockEntryPoint(graph, '/src/module-2.js', ['default'], 'lib');

    mockEntryPoint(graph, '/src/module-a.js', ['default'], 'bundle-a');

    mockDependent(graph, '/src/module-a.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['foo'],
      type: 'static',
    });
    graph.exports('/src/module-1.js', ['default'], {
      identifier: '_',
      symbols: ['foo', 'bar', 'baz'],
      esModule: true,
    });

    mockDependent(graph, '/src/module-a.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['alpha'],
      type: 'static',
    });
    graph.exports('/src/module-2.js', ['default'], {
      identifier: '_',
      symbols: ['alpha', 'beta', 'gaga'],
      esModule: true,
    });

    mockDependent(graph, '/src/module-a.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['one'],
      type: 'static',
    });
    graph.exports('/src/module-3.js', ['default'], {
      identifier: '_',
      symbols: ['one', 'two', 'three'],
      esModule: true,
    });

    mockEntryPoint(graph, '/src/module-b.js', ['default'], 'bundle-b');

    mockDependent(graph, '/src/module-b.js', '/src/module-1.js', ['default'], {
      source: './module-1',
      symbols: ['bar'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-b.js', '/src/module-2.js', ['default'], {
      source: './module-2',
      symbols: ['beta'],
      type: 'static',
    });

    mockDependent(graph, '/src/module-b.js', '/src/module-3.js', ['default'], {
      source: './module-3',
      symbols: ['*'],
      type: 'static',
    });

    return parseMockConfig({
      bundles: {
        'bundle-a': {
          type: 'entrypoint',
          requires: ['/src/module-a.js'],
          depends: ['common', 'lib'],
          bundler: 'js',
        },
        'bundle-b': {
          type: 'entrypoint',
          requires: ['/src/module-b.js'],
          depends: ['common', 'lib'],
          bundler: 'js',
        },
        common: {
          type: 'common',
          contentTypes: ['text/javascript'],
          threshold: 1,
          bundler: 'js',
        },
        lib: {
          type: 'library',
          requires: ['/src/module-2.js'],
          bundler: 'js',
        },
      },
      bundlers: {
        js: {
          require: 'bundler.js',
        },
      },
      handlers: [
        {
          pattern: '.js',
          require: 'handler.js',
        },
      ],
    }).then(config => {
      const workingSet = generateMockWorkingSet(config);
      const outputPaths = new OutputPathHelpers(config);
      const generatedBundles = new GeneratedBundleSet(
        'default',
        graph.variants['default'],
        workingSet,
        config,
        outputPaths,
      );

      expect(Object.keys(generatedBundles.getBundles())).toEqual([
        'lib',
        'bundle-a',
        'bundle-b',
        'common',
      ]);
      const bundleA = generatedBundles.getStaticBundle('bundle-a');
      expect(bundleA.usedSymbols).toEqual({
        '/src/module-a.js': [],
      });
      const bundleB = generatedBundles.getStaticBundle('bundle-b');
      expect(bundleB.usedSymbols).toEqual({
        '/src/module-b.js': [],
      });
      const common = generatedBundles.getStaticBundle('common');
      expect(common.usedSymbols).toEqual({
        '/src/module-3.js': ['*'],
        '/src/module-1.js': ['bar', 'foo'],
      });
      const lib = generatedBundles.getStaticBundle('lib');
      expect(lib.usedSymbols).toEqual({
        '/src/module-2.js': ['alpha', 'beta'],
      });
    });
  });
});
