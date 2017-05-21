jest.mock('fs');

import fs from 'fs';
import OutputPathHelpers from '../output-path-helpers';

describe('output path utils',() => {
  it('generates fixed length md5 hashes',() => {
    const helpers = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'md5',
        outputHashLength: 5,
      },
    });

    expect(helpers.generateHash('hello world').length).toBe(5);
  });

  it('generates fixed length sha1 hashes',() => {
    const helpers = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
      },
    });

    expect(helpers.generateHash('hello world').length).toBe(7);
  });

  it('Hashes vary by config',() => {
    const helpers = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
      },
    });

    const helpers1 = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
      },
      options: {
        base: {
          foo:'bar',
        }
      },
    });

    expect(helpers1.generateHash('hello world')).not.toEqual(helpers.generateHash('hello world'));
  });

  it('Generates correct paths',() => {
    const helpers = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
        outputPath: '/opt/build',
        outputPublicPath: '/static',
      },
    });
    expect(helpers.getOutputPaths(
      'my/resource.js',
      'xyzzy',
      {},
      '${hash}/${name}${ext}',
      '${name}${ext}',
    )).toEqual({
      outputPath: '/opt/build/xyzzy/my/resource.js',
      outputParentPath: '/opt/build/xyzzy/my',
      outputPublicPath: '/static/xyzzy/my/resource.js',
      assetName: 'my/resource.js',
    });
  });

  it('Generates paths from bundler templates', () => {
    const helpers = new OutputPathHelpers({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
        outputPath: '/opt/build',
        outputPublicPath: '/static',
      },
      bundlers: {
        'js': {
          invariantOptions: {
            staticOutputPathFormat: '/bundles/${options.lang}_${name}${ext}/${hash}${ext}',
            dynamicOutputPathFormat: '/bundles/dynamic/${name}${ext}',
            assetNameFormat: '${name}',
          },
          options: {
            'en_US': {
              lang: 'en_US',
            }
          }
        }
      },
    });

    expect(helpers.getBundlerStaticOutputPaths('foobar.js', 'xyzzy', 'js', 'en_US')).toEqual({
      outputPath: '/opt/build/bundles/en_US_foobar.js/xyzzy.js',
      outputParentPath: '/opt/build/bundles/en_US_foobar.js',
      outputPublicPath: '/static/bundles/en_US_foobar.js/xyzzy.js',
      assetName: 'foobar',
    });
    expect(helpers.getBundlerDynamicOutputPaths('foobar.js', 'xyzzy', 'js', 'en_US')).toEqual({
      outputPath: '/opt/build/bundles/dynamic/foobar.js',
      outputParentPath: '/opt/build/bundles/dynamic',
      outputPublicPath: '/static/bundles/dynamic/foobar.js',
      assetName: 'foobar',
    });


  });
});
