jest.mock('fs');

import fs from 'fs';
import OutputPathUtils from '../output-path-utils';

describe('output path utils',() => {
  it('generates fixed length md5 hashes',() => {
    const utils = new OutputPathUtils({
      invariantOptions: {
        outputHash: 'md5',
        outputHashLength: 5,
      },
    });

    expect(utils.generateHash('hello world')).toBe('773db');
  });

  it('generates fixed length sha1 hashes',() => {
    const utils = new OutputPathUtils({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
      },
    });

    expect(utils.generateHash('hello world')).toBe('457ccad');
  });

  it('Hashes vary by config',() => {
    const utils = new OutputPathUtils({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
      },
    });

    const utils1 = new OutputPathUtils({
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

    expect(utils1.generateHash('hello world')).not.toEqual(utils.generateHash('hello world'));
  });

  it('Generates correct paths',() => {
    const utils = new OutputPathUtils({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
        outputPath: '/opt/build',
        outputPublicPath: '/static',
      },
    });
    expect(utils.getOutputPaths(
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
    const utils = new OutputPathUtils({
      invariantOptions: {
        outputHash: 'sha1',
        outputHashLength: 7,
        outputPath: '/opt/build',
        outputPublicPath: '/static',
      },
      bundlers: {
        'js': {
          invariantOptions: {
            outputPathFormat: '/bundles/${options.lang}_${name}${ext}/${hash}${ext}',
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

    expect(utils.getBundlerOutputPaths('foobar.js', 'xyzzy', 'js', 'en_US')).toEqual({
      outputPath: '/opt/build/bundles/en_US_foobar.js/xyzzy.js',
      outputParentPath: '/opt/build/bundles/en_US_foobar.js',
      outputPublicPath: '/static/bundles/en_US_foobar.js/xyzzy.js',
      assetName: 'foobar',
    });


  });
});
