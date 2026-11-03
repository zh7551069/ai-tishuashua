import { useState } from 'react';
import {
  EMPTY_LINK_FILTERS,
  EMPTY_SCORE_FILTERS,
  type CertificateLinkFilterInput,
  type ScoreFilterInput,
} from '../certificates-api';
import { LinkPanel } from './certificates/LinkPanel';
import { ScorePanel } from './certificates/ScorePanel';

export function CertificatesPage() {
  const [tab, setTab] = useState<'links' | 'scores'>('links');
  const [scoresMounted, setScoresMounted] = useState(false);
  const [linkFocus, setLinkFocus] = useState<CertificateLinkFilterInput | null>(null);
  const [linkFocusToken, setLinkFocusToken] = useState(0);
  const [scoreFocus, setScoreFocus] = useState<ScoreFilterInput | null>(null);
  const [scoreFocusToken, setScoreFocusToken] = useState(0);

  function showLinks(filters: Pick<CertificateLinkFilterInput, 'userId' | 'certId' | 'domainId'>) {
    setLinkFocus({ ...EMPTY_LINK_FILTERS, ...filters });
    setLinkFocusToken((value) => value + 1);
    setTab('links');
  }

  function showScores(filters: Pick<ScoreFilterInput, 'userId' | 'certId' | 'domainId'>) {
    setScoreFocus({ ...EMPTY_SCORE_FILTERS, ...filters });
    setScoreFocusToken((value) => value + 1);
    setScoresMounted(true);
    setTab('scores');
  }

  return (
    <section className="panel wide">
      <h1>证书与成绩</h1>
      <p className="muted">
        只读查看全站用户与证书的关联，以及已交卷成绩。关联规则和小程序证书卡相同。成绩对照小程序成绩列表，读不出的快照仍保留这一行。这里不能改成绩、删会话、改关联或改及格线。上架领域和证书在「目录」。
      </p>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'links'}
          className={tab === 'links' ? undefined : 'secondary'}
          onClick={() => setTab('links')}
        >
          证书关联
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'scores'}
          className={tab === 'scores' ? undefined : 'secondary'}
          onClick={() => {
            setScoresMounted(true);
            setTab('scores');
          }}
        >
          已交卷成绩
        </button>
      </div>
      <div hidden={tab !== 'links'}>
        <LinkPanel focus={linkFocus} focusToken={linkFocusToken} onShowScores={showScores} />
      </div>
      {scoresMounted ? (
        <div hidden={tab !== 'scores'}>
          <ScorePanel focus={scoreFocus} focusToken={scoreFocusToken} onShowLinks={showLinks} />
        </div>
      ) : null}
    </section>
  );
}
