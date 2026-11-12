import {
  ROLE_CAPABILITIES,
  ROLE_CAPABILITY_LABELS,
  ROLE_LEVELS,
  defaultAdminRoleMatrix,
  roleLevelLabel,
  type AdminRoleKey,
  type AdminRoleMatrix,
  type RoleCapability,
  type RoleLevel,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

interface RoleMatrixView extends AdminRoleMatrix {
  updatedAt: string | null;
  updatedBy: string | null;
}

const ROLE_COLUMNS: Array<{ key: AdminRoleKey; label: string }> = [
  { key: 'research', label: '教研' },
  { key: 'ops', label: '运营' },
  { key: 'superadmin', label: '超管' },
];

export function RolesPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [matrix, setMatrix] = useState<RoleMatrixView | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch<RoleMatrixView>('/admin/system/roles', { token })
      .then((body) => {
        if (!cancelled) {
          setMatrix(body);
          setError('');
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (leaveIfUnauthorized(caught, navigate)) {
          return;
        }
        setError(caught instanceof Error ? caught.message : '读取失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  function setLevel(capability: RoleCapability, role: AdminRoleKey, level: RoleLevel) {
    setMatrix((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        capabilities: {
          ...current.capabilities,
          [capability]: { ...current.capabilities[capability], [role]: level },
        },
      };
    });
    setSaved('');
  }

  async function save() {
    if (!matrix || saving) {
      return;
    }
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const next = await adminFetch<RoleMatrixView>('/admin/system/roles', {
        method: 'PUT',
        token,
        body: { roles: matrix.roles, capabilities: matrix.capabilities },
      });
      setMatrix(next);
      setSaved('已保存。当前登录者仍可写，本期不按矩阵拒写。');
    } catch (caught: unknown) {
      if (leaveIfUnauthorized(caught, navigate)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  const shown = matrix ?? { ...defaultAdminRoleMatrix(), updatedAt: null, updatedBy: null };

  return (
    <section className="page system-page">
      <h1 className="system-title">角色权限</h1>
      {error ? (
        <p className="system-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !matrix ? <p className="system-muted">读取中</p> : null}
      <article className="system-card system-matrix">
        <h2>能力矩阵（对齐 PRD §8）</h2>
        <p className="system-banner">
          本期登录仍是一份帐密，唯一登录者为超管。矩阵可编辑、可保存，但运行时不会按矩阵拒写；即使把某角色改成不可写，当前登录者仍可写。
        </p>
        <div className="system-grid system-grid-head">
          <span>能力</span>
          {ROLE_COLUMNS.map((column) => (
            <span key={column.key}>{column.label}</span>
          ))}
        </div>
        {ROLE_CAPABILITIES.map((capability) => (
          <div className="system-grid" key={capability}>
            <span>{ROLE_CAPABILITY_LABELS[capability]}</span>
            {ROLE_COLUMNS.map((column) => {
              const level = shown.capabilities[capability][column.key];
              return (
                <label key={column.key} className="system-cell">
                  <span className="visually-hidden">
                    {ROLE_CAPABILITY_LABELS[capability]} {column.label}
                  </span>
                  <select
                    value={level}
                    disabled={!matrix || saving}
                    onChange={(event) =>
                      setLevel(capability, column.key, event.target.value as RoleLevel)
                    }
                  >
                    {ROLE_LEVELS.map((option) => (
                      <option key={option} value={option}>
                        {roleLevelLabel(capability, option)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        ))}
        <div className="system-actions">
          <button type="button" disabled={!matrix || saving} onClick={() => void save()}>
            {saving ? '保存中' : '保存'}
          </button>
          {saved ? <span className="system-ok">{saved}</span> : null}
        </div>
      </article>
      <p className="system-foot">矩阵供展示与预留，本期不按矩阵拒写。</p>
    </section>
  );
}

function leaveIfUnauthorized(caught: unknown, navigate: ReturnType<typeof useNavigate>): boolean {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return true;
  }
  return false;
}
