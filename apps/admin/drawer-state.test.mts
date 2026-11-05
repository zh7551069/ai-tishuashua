import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CLOSED_EDITOR,
  createEditor,
  editEditor,
  matchesQuery,
  matchesStatus,
  parseEditorQuery,
  parseOfflineConfirm,
  readListQuery,
  writeEditorQuery,
  writeListQuery,
  writeOfflineConfirm,
} from './src/content/drawer-state.ts';

test('closed editor drops drawer and copy source', () => {
  const params = new URLSearchParams('drawer=create&from=cert-1&q=fde&status=online');
  const next = writeEditorQuery(params, CLOSED_EDITOR);
  assert.equal(next.get('drawer'), null);
  assert.equal(next.get('from'), null);
  assert.equal(next.get('q'), 'fde');
  assert.deepEqual(parseEditorQuery(next), CLOSED_EDITOR);
});

test('create and copy round-trip without turning into edit', () => {
  const params = writeEditorQuery(new URLSearchParams('status=offline'), createEditor('cert-9'));
  assert.equal(params.get('drawer'), 'create');
  assert.equal(params.get('from'), 'cert-9');
  assert.equal(params.get('status'), 'offline');
  assert.deepEqual(parseEditorQuery(params), createEditor('cert-9'));
});

test('edit clears a previous copy source', () => {
  const params = writeEditorQuery(
    new URLSearchParams('drawer=create&from=cert-9'),
    editEditor('cert-2'),
  );
  assert.equal(params.get('from'), null);
  assert.deepEqual(parseEditorQuery(params), editEditor('cert-2'));
});

test('offline confirm stacks on an open drawer and cancels independently', () => {
  const editing = writeEditorQuery(new URLSearchParams(), editEditor('cert-2'));
  const confirming = writeOfflineConfirm(editing, 'cert-2');
  assert.equal(parseOfflineConfirm(confirming), 'cert-2');
  assert.deepEqual(parseEditorQuery(confirming), editEditor('cert-2'));
  const cancelled = writeOfflineConfirm(confirming, null);
  assert.equal(parseOfflineConfirm(cancelled), null);
  assert.equal(cancelled.get('drawer'), 'cert-2');
});

test('list query keeps the drawer and ignores unknown status', () => {
  const params = writeListQuery(new URLSearchParams('drawer=dom-1'), '  前沿  ', 'online');
  assert.deepEqual(readListQuery(params), { q: '前沿', status: 'online' });
  assert.equal(parseEditorQuery(params).id, 'dom-1');
  const cleared = writeListQuery(params, '   ', 'all');
  assert.deepEqual(readListQuery(cleared), { q: '', status: 'all' });
  assert.equal(parseStatusSafe(cleared.get('status')), 'all');
});

test('search and status filters', () => {
  assert.equal(matchesQuery('FDE 前沿部署', 'fde'), true);
  assert.equal(matchesQuery('云计算', '安全'), false);
  assert.equal(matchesQuery('云计算', '  '), true);
  assert.equal(matchesStatus('online', 'all'), true);
  assert.equal(matchesStatus('offline', 'online'), false);
});

function parseStatusSafe(value: string | null): string {
  return readListQuery(new URLSearchParams(value ? `status=${value}` : '')).status;
}
