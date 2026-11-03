import { PRODUCT_NAME } from '@tishuashua/shared';
import { useOutletContext } from 'react-router-dom';
import type { AdminOutletContext } from '../layout/AdminLayout';

export function OverviewPage() {
  const { session, sessionNotice } = useOutletContext<AdminOutletContext>();
  return (
    <section className="panel">
      <span className="tag">{sessionNotice ? '会话未确认' : '已登录'}</span>
      <h1>{PRODUCT_NAME} 概览</h1>
      <p>当前帐号：{session.username}</p>
      <p className="muted">
        {sessionNotice
          ? sessionNotice
          : '已用后管会话访问连通性接口。目录可以维护领域、证书和知识点。错题、课件、证书与成绩可以只读查看全站记录。'}
      </p>
    </section>
  );
}
