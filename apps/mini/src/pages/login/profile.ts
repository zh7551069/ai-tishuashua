import type { UserSummary } from '@tishuashua/shared';

export type ProfileTone = 'blue' | 'orange';

export interface ProfileRowModel {
  key: 'avatar' | 'nick' | 'phone';
  label: string;
  value: string;
  done: boolean;
  mark: string;
  tone: ProfileTone;
  initial: string;
  imageUrl: string;
  valueSize: 'sm' | 'md';
}

export interface ProfileModel {
  syncing: boolean;
  title: string;
  subtitle: string;
  cardHint: string;
  rows: ProfileRowModel[];
  doneCount: number;
  complete: boolean;
  progressLabel: string;
  cta: string;
  ctaNote: string;
}

function firstChar(value: string): string {
  return Array.from(value)[0] ?? '';
}

/**
 * 登录响应里的摘要直接填进资料卡。
 * 手机号不在微信登录接口里，未绑定时不计入完成，也不挡住「开始备考」。
 */
export function buildProfile(user: UserSummary | null, syncing: boolean): ProfileModel {
  const nick = user?.nick?.trim() ?? '';
  const phone = user?.phoneBound ? (user.phoneMasked?.trim() ?? '') : '';
  const avatar = user?.avatar?.trim() ?? '';

  const avatarDone = !syncing && Boolean(avatar || nick);
  const nickDone = !syncing && Boolean(nick);
  const phoneDone = !syncing && Boolean(phone);
  const doneCount = [avatarDone, nickDone, phoneDone].filter(Boolean).length;
  const complete = doneCount === 3;

  const rows: ProfileRowModel[] = [
    {
      key: 'avatar',
      label: '头像',
      value: syncing ? '同步中…' : avatarDone ? '已从微信同步' : '未上传头像',
      done: avatarDone,
      mark: '',
      tone: 'blue',
      initial: syncing ? '…' : firstChar(nick) || '微',
      imageUrl: syncing ? '' : avatar,
      valueSize: 'sm',
    },
    {
      key: 'nick',
      label: '昵称',
      value: syncing ? '同步中…' : nick || '微信用户',
      done: nickDone,
      mark: '昵',
      tone: 'blue',
      initial: '',
      imageUrl: '',
      valueSize: 'md',
    },
    {
      key: 'phone',
      label: '手机号',
      value: syncing ? '同步中…' : phone || '稍后在设置中补全',
      done: phoneDone,
      mark: '机',
      tone: phoneDone ? 'blue' : 'orange',
      initial: '',
      imageUrl: '',
      valueSize: 'md',
    },
  ];

  return {
    syncing,
    title: syncing ? '正在同步微信资料' : '登录成功',
    subtitle: syncing
      ? '授权已通过 · 自动写入昵称与手机号'
      : phoneDone
        ? '已自动注册账号，微信资料已写入'
        : '已自动注册账号，手机号可稍后在设置中补全',
    cardHint: syncing
      ? '请稍候，完成后即可开始备考'
      : phoneDone
        ? '无需手动填写，授权信息自动写入'
        : '无需手动填写，手机号可稍后在设置中补全',
    rows,
    doneCount,
    complete,
    progressLabel: syncing
      ? '资料补全中'
      : complete
        ? '资料已补全 3/3'
        : `资料补全中 ${doneCount}/3`,
    cta: syncing ? '同步完成后可进入' : '开始备考',
    ctaNote: syncing ? '预计几秒内完成' : '将进入首页，选择领域与证书',
  };
}
