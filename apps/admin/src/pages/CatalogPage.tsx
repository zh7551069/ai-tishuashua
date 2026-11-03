import type {
  AdminCatalogTree,
  AdminCertificate,
  AdminDomain,
  PublishStatus,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import {
  createCertificate,
  createDomain,
  deleteCertificate,
  deleteDomain,
  getCatalogTree,
  listCertificates,
  listDomains,
  updateCertificate,
  updateDomain,
} from '../catalog-api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';
import { CertificateColumn } from './catalog/CertificateColumn';
import { DomainColumn } from './catalog/DomainColumn';
import { TreeColumn } from './catalog/TreeColumn';

export function CatalogPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [domainId, setDomainId] = useState<string | null>(null);
  const [certificates, setCertificates] = useState<AdminCertificate[]>([]);
  const [certificateId, setCertificateId] = useState<string | null>(null);
  const [tree, setTree] = useState<AdminCatalogTree | null>(null);
  const [treeVersion, setTreeVersion] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then((result) => {
        if (!cancelled) {
          setDomains(result.items);
          setReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!domainId) {
      setCertificates([]);
      setCertificateId(null);
      return;
    }
    let cancelled = false;
    listCertificates(token, domainId)
      .then((result) => {
        if (!cancelled) {
          setCertificates(result.items);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [domainId, token]);

  useEffect(() => {
    if (!certificateId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    getCatalogTree(token, certificateId)
      .then((result) => {
        if (!cancelled) {
          setTree(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, token, treeVersion]);

  function report(caught: unknown): void {
    if (caught instanceof AdminApiError && caught.status === 401) {
      clearAdminSession();
      navigate('/login', { replace: true });
      return;
    }
    setError(caught instanceof Error ? caught.message : '操作失败');
  }

  async function run(task: () => Promise<void>): Promise<boolean> {
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
  }

  function chooseDomain(id: string): void {
    setDomainId(id);
    setCertificateId(null);
    setTree(null);
  }

  if (!ready) {
    return <p className="muted">正在读取目录…</p>;
  }

  return (
    <div>
      <div className="catalog-intro">
        <h1>目录</h1>
        <p className="muted">
          维护小程序可选的官方领域、证书、教材和知识点。下架可以恢复。证书下架后，已有刷题包只能删除。用户从课件提炼的内容不会出现在这里。
        </p>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="catalog">
        <DomainColumn
          items={domains}
          selectedId={domainId}
          pending={pending}
          onSelect={chooseDomain}
          onCreate={(body) =>
            run(async () => {
              const created = await createDomain(token, body);
              setDomains((await listDomains(token)).items);
              chooseDomain(created.id);
            })
          }
          onUpdate={(id, body) =>
            run(async () => {
              await updateDomain(token, id, body);
              setDomains((await listDomains(token)).items);
            })
          }
          onDelete={(id) =>
            run(async () => {
              await deleteDomain(token, id);
              setDomains((await listDomains(token)).items);
              if (domainId === id) {
                setDomainId(null);
                setCertificateId(null);
                setTree(null);
              }
            })
          }
        />
        <CertificateColumn
          domainId={domainId}
          items={certificates}
          selectedId={certificateId}
          pending={pending}
          onSelect={setCertificateId}
          onCreate={(body) =>
            run(async () => {
              if (!domainId) {
                return;
              }
              const created = await createCertificate(token, domainId, body);
              setCertificates((await listCertificates(token, domainId)).items);
              setCertificateId(created.id);
            })
          }
          onUpdate={(id, body) =>
            run(async () => {
              if (!domainId) {
                return;
              }
              await updateCertificate(token, id, body);
              setCertificates((await listCertificates(token, domainId)).items);
              if (certificateId === id) {
                setTreeVersion((value) => value + 1);
              }
            })
          }
          onDelete={(id) =>
            run(async () => {
              if (!domainId) {
                return;
              }
              await deleteCertificate(token, id);
              setCertificates((await listCertificates(token, domainId)).items);
              if (certificateId === id) {
                setCertificateId(null);
              }
            })
          }
        />
        <TreeColumn
          token={token}
          certificateId={certificateId}
          tree={tree}
          pending={pending}
          run={run}
          onChanged={() => setTreeVersion((value) => value + 1)}
        />
      </div>
    </div>
  );
}

export function statusLabel(status: PublishStatus): string {
  return status === 'online' ? '上架' : '下架';
}
