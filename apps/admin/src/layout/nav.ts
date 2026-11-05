export interface NavItem {
  to: string;
  label: string;
  crumb: string;
  /** 入口保留，本刀不接业务。 */
  placeholder?: boolean;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: null,
    items: [{ to: '/', label: '工作台', crumb: '后管 / 工作台' }],
  },
  {
    label: '内容配置',
    items: [
      { to: '/content/domains', label: '领域', crumb: '内容配置 / 领域' },
      { to: '/content/certificates', label: '证书', crumb: '内容配置 / 证书' },
      { to: '/content/textbooks', label: '教材', crumb: '内容配置 / 教材' },
      { to: '/content/knowledge', label: '章节知识点', crumb: '内容配置 / 章节知识点' },
    ],
  },
  {
    label: '出题配置',
    items: [
      {
        to: '/config/prompts',
        label: 'Prompt 模板',
        crumb: '出题配置 / Prompt 模板',
        placeholder: true,
      },
      {
        to: '/config/question-types',
        label: '题型管理',
        crumb: '出题配置 / 题型管理',
        placeholder: true,
      },
      {
        to: '/config/cert-types',
        label: '证书题型与默认参数',
        crumb: '出题配置 / 证书题型与默认参数',
        placeholder: true,
      },
    ],
  },
  {
    label: '数据查询',
    items: [
      { to: '/users', label: '用户', crumb: '数据查询 / 用户' },
      {
        to: '/practice',
        label: '练习记录',
        crumb: '数据查询 / 练习记录',
        placeholder: true,
      },
      { to: '/wrong-book', label: '错题库', crumb: '数据查询 / 错题库' },
      {
        to: '/quiz-logs',
        label: '出题日志',
        crumb: '数据查询 / 出题日志',
        placeholder: true,
      },
      { to: '/courseware', label: '用户上传教材', crumb: '数据查询 / 用户上传教材' },
      { to: '/quiz', label: '出题会话', crumb: '数据查询 / 出题会话' },
      { to: '/certificates', label: '证书与成绩', crumb: '数据查询 / 证书与成绩' },
    ],
  },
  {
    label: '系统',
    items: [
      {
        to: '/system/roles',
        label: '角色权限',
        crumb: '系统 / 角色权限',
        placeholder: true,
      },
      {
        to: '/system/retention',
        label: '数据保留周期',
        crumb: '系统 / 数据保留周期',
        placeholder: true,
      },
      {
        to: '/system/audit',
        label: '操作审计',
        crumb: '系统 / 操作审计',
        placeholder: true,
      },
    ],
  },
];

export function crumbFor(pathname: string): string {
  for (const group of NAV) {
    for (const item of group.items) {
      if (item.to === '/') {
        if (pathname === '/') {
          return item.crumb;
        }
        continue;
      }
      if (pathname === item.to || pathname.startsWith(`${item.to}/`)) {
        return item.crumb;
      }
    }
  }
  return '后管';
}
