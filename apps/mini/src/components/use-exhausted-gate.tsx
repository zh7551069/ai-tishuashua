import Taro from '@tarojs/taro';
import type { EntitlementCtaType } from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { fetchEntitlement, fetchSessionPacks } from '../services/commerce-api';
import {
  EXHAUSTED_ROUTES,
  PACK_CTA_FALLBACK,
  packCtaLabel,
  pickSessionPack,
  startEntitledSession,
  type ExhaustedSnapshot,
  type StartOutcome,
} from '../services/exhausted-sheet';
import { withAuth } from '../services/guard';
import { readToken } from '../services/session';
import { ExhaustedSheet } from './ExhaustedSheet';

export function useExhaustedGate() {
  const [snapshot, setSnapshot] = useState<ExhaustedSnapshot | null>(null);
  const [packLabel, setPackLabel] = useState(PACK_CTA_FALLBACK);
  const packTicket = useRef(0);

  const open = (next: ExhaustedSnapshot) => {
    const ticket = packTicket.current + 1;
    packTicket.current = ticket;
    setSnapshot(next);
    setPackLabel(PACK_CTA_FALLBACK);
    const token = readToken();
    if (!token) {
      return;
    }
    void fetchSessionPacks(token)
      .then((items) => {
        if (packTicket.current === ticket) {
          setPackLabel(packCtaLabel(pickSessionPack(items)));
        }
      })
      .catch(() => {
        if (packTicket.current === ticket) {
          setPackLabel(PACK_CTA_FALLBACK);
        }
      });
  };

  const run = async <T,>(input: {
    source: string;
    create: (token: string) => Promise<T>;
  }): Promise<StartOutcome<T>> => {
    const result = await startEntitledSession({
      source: input.source,
      withAuth,
      readEntitlement: fetchEntitlement,
      create: input.create,
    });
    if (result.kind === 'sheet') {
      open(result.snapshot);
    } else if (result.kind === 'error') {
      await Taro.showToast({ title: result.message, icon: 'none' });
    }
    return result;
  };

  const go = (type: EntitlementCtaType) => {
    setSnapshot(null);
    void Taro.navigateTo({ url: EXHAUSTED_ROUTES[type] });
  };

  const sheet = snapshot ? (
    <ExhaustedSheet
      snapshot={snapshot}
      packLabel={packLabel}
      onClose={() => setSnapshot(null)}
      onCta={go}
    />
  ) : null;

  return { run, sheet, sheetOpen: Boolean(snapshot) };
}
