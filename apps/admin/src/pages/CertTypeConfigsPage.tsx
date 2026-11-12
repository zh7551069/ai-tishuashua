import type { AdminCertificate, CertQuestionTypeConfig, QuestionTypeView } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listCertificates, listDomains } from '../catalog-api';
import { useAdminAction } from '../content/use-admin-action';
import { getCertTypeConfigs, listQuestionTypes, saveCertTypeConfigs } from '../generation-config-api';

interface Row extends CertQuestionTypeConfig {
  name: string;
  enabled: boolean;
}

export function CertTypeConfigsPage() {
  const { token, pending, error, setError, run } = useAdminAction();
  const [certificates, setCertificates] = useState<AdminCertificate[]>([]);
  const [certificateId, setCertificateId] = useState('');
  const [totalScore, setTotalScore] = useState<number | null>(null);
  const [enabledCodes, setEnabledCodes] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [savedRows, setSavedRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then(async (domains) => {
        const groups = await Promise.all(
          domains.items.map(async (domain) => {
            const list = await listCertificates(token, domain.id);
            return list.items;
          }),
        );
        if (!cancelled) {
          const items = groups.flat();
          setCertificates(items);
          setCertificateId((current) => current || items[0]?.id || '');
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '证书加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setError, token]);

  useEffect(() => {
    if (!certificateId) {
      return;
    }
    let cancelled = false;
    Promise.all([listQuestionTypes(token), getCertTypeConfigs(token, certificateId)])
      .then(([types, configs]) => {
        if (cancelled) {
          return;
        }
        const next = mergeRows(types.items, configs.items, configs.enabledQuestionTypeCodes);
        setRows(next);
        setSavedRows(next);
        setTotalScore(configs.totalScore);
        setEnabledCodes(configs.enabledQuestionTypeCodes);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '默认参数加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, setError, token]);

  function patch(code: string, partial: Partial<Row>): void {
    setRows((current) => current.map((row) => (row.questionTypeCode === code ? { ...row, ...partial } : row)));
  }

  return (
    <section className="page gc-page">
      <header className="gc-head">
        <div>
          <p className="gc-crumb">出题配置 / 证书题型与默认参数</p>
          <h1>证书题型与默认参数</h1>
        </div>
        <div className="gc-actions">
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setRows(savedRows);
              setNotice('已恢复为上次读取的默认参数，尚未保存。');
            }}
          >
            恢复默认
          </button>
          <button
            type="button"
            disabled={pending || !certificateId}
            onClick={() => {
              setNotice('');
              void run(async () => {
                const saved = await saveCertTypeConfigs(
                  token,
                  certificateId,
                  rows.map(toWrite),
                );
                const types = await listQuestionTypes(token);
                const next = mergeRows(types.items, saved.items, saved.enabledQuestionTypeCodes);
                setRows(next);
                setSavedRows(next);
                setEnabledCodes(saved.enabledQuestionTypeCodes);
                setNotice('已保存到独立配置表。启用子集没有改动。');
              });
            }}
          >
            保存
          </button>
        </div>
      </header>
      <p className="gc-note">
        改启用子集请到内容配置 · 证书抽屉。本页只维护默认勾选、分值与选配配比。启用子集在本页为只读指示。
        <Link to="/content/certificates"> 打开证书抽屉</Link>
      </p>
      <div className="gc-filters">
        <label>
          当前证书
          <select value={certificateId} onChange={(event) => setCertificateId(event.target.value)}>
            {certificates.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <p className="gc-score">总分 {totalScore ?? '—'}</p>
      </div>
      <p className="gc-foot">分值与总分不一致时出题后归一化（不阻断上架）。</p>
      {error ? <p className="gc-error">{error}</p> : null}
      {notice ? <p className="gc-note">{notice}</p> : null}
      <div className="table-card">
        <table className="grid">
          <thead>
            <tr>
              <th>题型</th>
              <th>启用子集</th>
              <th>默认勾选</th>
              <th>默认分值</th>
              <th>最少</th>
              <th>最多</th>
              <th>配比</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.questionTypeCode}>
                <td>
                  {row.questionTypeCode} {row.name}
                </td>
                <td>{enabledCodes.includes(row.questionTypeCode) ? <span className="gc-pill on">已启用</span> : '未启用'}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={row.defaultSelected}
                    onChange={(event) => patch(row.questionTypeCode, { defaultSelected: event.target.checked })}
                  />
                </td>
                <td>
                  <input
                    value={row.scorePerQuestion ?? ''}
                    onChange={(event) =>
                      patch(row.questionTypeCode, { scorePerQuestion: readOptionalNumber(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.minCount ?? ''}
                    onChange={(event) =>
                      patch(row.questionTypeCode, { minCount: readOptionalInt(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.maxCount ?? ''}
                    onChange={(event) =>
                      patch(row.questionTypeCode, { maxCount: readOptionalInt(event.target.value) })
                    }
                  />
                </td>
                <td>
                  <input
                    value={row.defaultCountShare ?? ''}
                    onChange={(event) =>
                      patch(row.questionTypeCode, {
                        defaultCountShare: readOptionalInt(event.target.value),
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function mergeRows(
  types: QuestionTypeView[],
  configs: CertQuestionTypeConfig[],
  enabled: string[],
): Row[] {
  const byCode = new Map(configs.map((item) => [item.questionTypeCode, item]));
  return types.map((type) => {
    const config = byCode.get(type.code);
    return {
      questionTypeCode: type.code,
      name: type.name,
      enabled: enabled.includes(type.code),
      defaultSelected: config?.defaultSelected ?? false,
      minCount: config?.minCount ?? null,
      maxCount: config?.maxCount ?? null,
      defaultCountShare: config?.defaultCountShare ?? null,
      scorePerQuestion: config?.scorePerQuestion ?? null,
    };
  });
}

function toWrite(row: Row): CertQuestionTypeConfig {
  return {
    questionTypeCode: row.questionTypeCode,
    defaultSelected: row.defaultSelected,
    minCount: row.minCount,
    maxCount: row.maxCount,
    defaultCountShare: row.defaultCountShare,
    scorePerQuestion: row.scorePerQuestion,
  };
}

function readOptionalInt(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function readOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
