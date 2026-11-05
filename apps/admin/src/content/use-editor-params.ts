import { useSearchParams } from 'react-router-dom';
import {
  type EditorQuery,
  type StatusFilter,
  parseEditorQuery,
  parseOfflineConfirm,
  readListQuery,
  writeEditorQuery,
  writeListQuery,
  writeOfflineConfirm,
} from './drawer-state';

export function useEditorParams() {
  const [params, setParams] = useSearchParams();

  function replace(next: URLSearchParams): void {
    setParams(next, { replace: true });
  }

  return {
    editor: parseEditorQuery(params),
    list: readListQuery(params),
    confirmId: parseOfflineConfirm(params),
    setEditor(editor: EditorQuery) {
      replace(writeEditorQuery(params, editor));
    },
    setList(q: string, status: StatusFilter) {
      replace(writeListQuery(params, q, status));
    },
    setConfirm(certificateId: string | null) {
      replace(writeOfflineConfirm(params, certificateId));
    },
  };
}
