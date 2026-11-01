/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    NODE_ENV: 'development' | 'production';
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'qq' | 'jd' | 'harmony' | 'jdrn';
    /** 若设置，Taro 构建时写入 project.config.json 的 appid。 */
    TARO_APP_ID?: string;
    /** 小程序可访问的 API 根路径，例如 http://127.0.0.1:3000/api */
    TARO_APP_API_BASE?: string;
  }
}
