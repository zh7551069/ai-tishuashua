import { useOutletContext, useSearchParams } from 'react-router-dom';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { CommerceAuditList } from './CommerceAuditList';

export function CommerceAuditPage() {
  const { session } = useOutletContext<AdminOutletContext>();
  const [params] = useSearchParams();
  const userId = params.get('userId') ?? undefined;
  return (
    <section className="page commerce-page">
      <header className="commerce-head">
        <div>
          <p className="commerce-kicker">商业化 / 审计</p>
          <h1>商业化审计</h1>
        </div>
      </header>
      <p className="entitlement-notice">
        只读列表。补发、作废和配额 / SKU / 增长的写入都在这里。全站操作审计仍留给后续。
      </p>
      <CommerceAuditList token={session.token} userId={userId} />
    </section>
  );
}
