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

        // @tarojs/webpack5-runner@4.3.1 BaseConfig.setMinimizer 把 CSS 压缩器
        // 登记为 cssoWebpackPlugin，minify 仍走 cssnano。pxtransform 把 calc()
        // 里的 px 收成 rpx 后，postcss-calc 会报 UNKNOWN_DIMENSION。只关 calc，
        // test / preset 里原有的 discardComments 等选项保持不动。
        const cssMinimizerName = 'cssoWebpackPlugin';
        // webpack-chain 的 Optimization 类型只暴露 minimizer()，登记表在运行时的 minimizers 上。
        const minimizers = (
          chain.optimization as typeof chain.optimization & {
            minimizers: {
              has(name: string): boolean;
              get(name: string): {
                tap(fn: (args: Record<string, unknown>[]) => Record<string, unknown>[]): unknown;
              };
              values(): Array<{ name?: string }>;
            };
          }
        ).minimizers;
        const minimizing =
          chain.get('mode') === 'production' && chain.optimization.get('minimize') !== false;
        if (minimizing && !minimizers.has(cssMinimizerName)) {
          const found = minimizers
            .values()
            .map((item: { name?: string }) => item.name ?? '(unnamed)')
            .join(', ');
          throw new Error(
            `未找到 CSS minimizer「${cssMinimizerName}」（@tarojs/webpack5-runner 4.3.1）。当前：${found || '(none)'}`,
          );
        }
        if (minimizers.has(cssMinimizerName)) {
          minimizers.get(cssMinimizerName).tap((args: Record<string, unknown>[]) => {
            const options = args[0] ?? {};
            const minimizerOptions = (options.minimizerOptions ?? {}) as { preset?: unknown };
            const preset = minimizerOptions.preset;
            if (!Array.isArray(preset)) {
              throw new Error(
                `CSS minimizer「${cssMinimizerName}」的 minimizerOptions.preset 不是数组，无法关闭 postcss-calc`,
              );
            }
            const [presetName, presetOptions] = preset as [unknown, unknown];
            const nextPresetOptions =
              presetOptions !== null && typeof presetOptions === 'object'
                ? { ...(presetOptions as Record<string, unknown>), calc: false }
                : { calc: false };
            args[0] = {
              ...options,
              minimizerOptions: {
                ...minimizerOptions,
                preset: [presetName, nextPresetOptions],
              },
            };
            return args;
          });
        }

        // 设计稿 PNG 超过 webpack 默认体积，且主包没有 async chunk。只关 performance hint。
        chain.performance.hints(false);
      },
    },
  };

  if (process.env.NODE_ENV === 'development') {
    return merge({}, baseConfig, devConfig);
  }
  return merge({}, baseConfig, prodConfig);
});
