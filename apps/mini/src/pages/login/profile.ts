import type { UserSummary } from '@tishuashua/shared';

export type ProfileMode = 'syncing' | 'ready' | 'failed';

/** later：未下发手机号，不是失败。 */
export type RowState = 'pending' | 'done' | 'failed' | 'later';

export interface ProfileRowModel {
  key: 'avatar' | 'nick' | 'phone';
  label: string;
  value: string;
  state: RowState;
  mark: string;
  initial: string;
  imageUrl: string;
}

export interface ProfileModel {
  mode: ProfileMode;
  title: string;
  subtitle: string;
  rows: ProfileRowModel[];
  doneCount: number;
  progressLabel: string;
  /** full 仅三行都写入；其余用橄榄比例。 */
  fill: 'full' | 'partial';
}

const FAILED_VALUE = '未能写入';

function firstChar(value: string): string {
  return Array.from(value)[0] ?? '';
}

function row(
  key: ProfileRowModel['key'],
  label: string,
  value: string,
  state: RowState,
  mark: string,
  initial: string,
  imageUrl: string,
): ProfileRowModel {
  return { key, label, value, state, mark, initial, imageUrl };
}

/**
 * 登录响应里的摘要直接填进资料卡。
 * 手机号不在微信登录接口里。未绑定不计入完成，也不挡住「开始备考」。
 * 整次登录失败没有字段级结果，三行都标未能写入，不套用稿面示例号。
 */
export function buildProfile(user: UserSummary | null, mode: ProfileMode): ProfileModel {
  if (mode === 'syncing') {
    return {
      mode,
      title: '正在同步微信资料',
      subtitle: '授权已通过，请稍候即可开始备考',
      rows: [
        row('avatar', '头像', '同步中…', 'pending', '', '', ''),
        row('nick', '昵称', '同步中…', 'pending', '昵', '', ''),
        row('phone', '手机号', '同步中…', 'pending', '机', '', ''),
      ],
      doneCount: 0,
      progressLabel: '资料补全中 0/3',
      fill: 'partial',
    };
  }

  if (mode === 'failed') {
    return {
      mode,
      title: '同步失败',
      subtitle: '微信资料未能写入，请重试',
      rows: [
        row('avatar', '头像', FAILED_VALUE, 'failed', '', '', ''),
        row('nick', '昵称', FAILED_VALUE, 'failed', '昵', '', ''),
        row('phone', '手机号', FAILED_VALUE, 'failed', '机', '', ''),
      ],
      doneCount: 0,
      progressLabel: '资料写入失败 0/3',
      fill: 'partial',
    };
  }

  const nick = user?.nick?.trim() ?? '';
  const phone = user?.phoneBound ? (user.phoneMasked?.trim() ?? '') : '';
  const avatar = user?.avatar?.trim() ?? '';
  const avatarDone = Boolean(avatar || nick);
  const nickDone = Boolean(nick);
  const phoneDone = Boolean(phone);
  const doneCount = [avatarDone, nickDone, phoneDone].filter(Boolean).length;
  const complete = doneCount === 3;

  return {
    mode,
    title: '登录成功',
    subtitle: phoneDone
      ? '已自动注册账号，微信资料已写入'
      : '已自动注册账号，手机号可稍后在设置中补全',
    rows: [
      row(
        'avatar',
        '头像',
        avatarDone ? '已从微信同步' : '未上传头像',
        avatarDone ? 'done' : 'pending',
        '',
        firstChar(nick),
        avatar,
      ),
      row('nick', '昵称', nick || '微信用户', nickDone ? 'done' : 'pending', '昵', '', ''),
      row(
        'phone',
        '手机号',
        phoneDone ? phone : '稍后在设置中补全',
        phoneDone ? 'done' : 'later',
        '机',
        '',
        '',
      ),
    ],
    doneCount,
    progressLabel: complete ? '资料已补全 3/3' : `资料补全中 ${doneCount}/3`,
    fill: complete ? 'full' : 'partial',
  };
}
