import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import devConfig from './dev';
import prodConfig from './prod';

export default defineConfig<'webpack5'>(async (merge) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'tishuashua-mini',
    date: '2026-11-1',
    // 源码 px 与 Figma 390 画板一致。postcss 用 deviceRatio 把 px 收成 rpx：
    // 14px → 14 * (750/390) rpx，在 390 宽上仍是 14px。行内 style 不走 postcss，必须直接写稿面 px。
    designWidth: 390,
    deviceRatio: {
      390: 750 / 390,
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: 'dist',
    plugins: ['@tarojs/plugin-generator'],
    defineConstants: {},
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      // 开发态预编译用 esbuild 把 CJS 收成 ESM，只留 default。
      // shared 的命名导出（parsePublicSkuList 等）会变成 undefined。
      prebundle: {
        exclude: ['@tishuashua/shared'],
      },
    },
    cache: {
      enable: false,
    },
    mini: {
      // 小于 2KB 的 PNG 默认会内联成 base64。微信 image 不渲染 data URI，登录图标必须落成文件。
      imageUrlLoaderOption: {
        limit: true,
      },
      postcss: {
        pxtransform: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: false,
          config: {
            namingPattern: 'module',
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
