/** 空模块统一响应。implemented 固定为 false，避免被当成已完成的业务结果。 */
export interface ScaffoldPlaceholder {
  implemented: false;
  module: string;
  action: string;
  message: string;
}

export function scaffoldPlaceholder(module: string, action: string): ScaffoldPlaceholder {
  return {
    implemented: false,
    module,
    action,
    message: '脚手架占位，业务尚未实现',
  };
}
