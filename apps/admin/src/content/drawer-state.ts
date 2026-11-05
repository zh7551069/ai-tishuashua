/**
 * 内容配置抽屉状态机（TB-10）。
 *
 * 列表路由各自独立。编辑叠在列表右侧，不再使用 /catalog 三栏 cascade。
 *
 * - closed：没有 drawer
 * - create：drawer=create，可选 from=<id> 表示从已有实体带入（证书一键复制）
 * - edit：drawer=<实体 id>
 *
 * 证书下架确认是单独一层，查询参数 confirm=<证书 id>，可以和抽屉同时打开。
 * 取消只清 confirm。确认后由页面调用 catalog API，再清 confirm。
 */

export type EditorMode = 'closed' | 'create' | 'edit';

export interface EditorQuery {
  mode: EditorMode;
  id: string | null;
  copyFromId: string | null;
}

export const CLOSED_EDITOR: EditorQuery = { mode: 'closed', id: null, copyFromId: null };

const CREATE = 'create';

export function createEditor(copyFromId: string | null = null): EditorQuery {
  return { mode: 'create', id: null, copyFromId };
}

export function editEditor(id: string): EditorQuery {
  return { mode: 'edit', id, copyFromId: null };
}

export function parseEditorQuery(params: URLSearchParams): EditorQuery {
  const drawer = params.get('drawer');
  if (!drawer) {
    return CLOSED_EDITOR;
  }
  if (drawer === CREATE) {
    const from = params.get('from')?.trim() ?? '';
    return createEditor(from ? from : null);
  }
  return editEditor(drawer);
}

export function writeEditorQuery(params: URLSearchParams, editor: EditorQuery): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete('drawer');
  next.delete('from');
  if (editor.mode === 'create') {
    next.set('drawer', CREATE);
    if (editor.copyFromId) {
      next.set('from', editor.copyFromId);
    }
  } else if (editor.mode === 'edit' && editor.id) {
    next.set('drawer', editor.id);
  }
  return next;
}

export function parseOfflineConfirm(params: URLSearchParams): string | null {
  const id = params.get('confirm')?.trim() ?? '';
  return id ? id : null;
}

export function writeOfflineConfirm(
  params: URLSearchParams,
  certificateId: string | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (certificateId) {
    next.set('confirm', certificateId);
  } else {
    next.delete('confirm');
  }
  return next;
}

export type StatusFilter = 'all' | 'online' | 'offline';

export function parseStatusFilter(value: string | null): StatusFilter {
  if (value === 'online' || value === 'offline') {
    return value;
  }
  return 'all';
}

export function readListQuery(params: URLSearchParams): { q: string; status: StatusFilter } {
  return {
    q: params.get('q') ?? '',
    status: parseStatusFilter(params.get('status')),
  };
}

export function writeListQuery(
  params: URLSearchParams,
  q: string,
  status: StatusFilter,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const trimmed = q.trim();
  if (trimmed) {
    next.set('q', trimmed);
  } else {
    next.delete('q');
  }
  if (status === 'all') {
    next.delete('status');
  } else {
    next.set('status', status);
  }
  return next;
}

export function matchesQuery(haystack: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return haystack.toLowerCase().includes(needle);
}

export function matchesStatus(
  status: 'online' | 'offline',
  filter: StatusFilter,
): boolean {
  return filter === 'all' || status === filter;
}
