import { useCallback, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

export function useAdminAction() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const report = useCallback(
    (caught: unknown): void => {
      if (caught instanceof AdminApiError && caught.status === 401) {
        clearAdminSession();
        navigate('/login', { replace: true });
        return;
      }
      setError(caught instanceof Error ? caught.message : '操作失败');
    },
    [navigate],
  );

  const run = useCallback(
    async (task: () => Promise<void>): Promise<boolean> => {
      setPending(true);
      setError('');
      try {
        await task();
        return true;
      } catch (caught) {
        report(caught);
        return false;
      } finally {
        setPending(false);
      }
    },
    [report],
  );

  return { token: session.token, pending, error, setError, report, run };
}
