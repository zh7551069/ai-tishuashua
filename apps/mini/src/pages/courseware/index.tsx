import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import {
  COURSEWARE_MAX_BYTES,
  validateCoursewareFile,
  type ExtractJobView,
  type ExtractStage,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { Screen } from '../../components/Screen';
import { ErrorBlock } from '../../components/StateBlock';
import {
  cancelExtractJob,
  commitExtractJob,
  fetchExtractJob,
  forgetCoursewareJob,
  rememberCoursewareJob,
  uploadCourseware,
} from '../../services/courseware-api';
import { isAuthFailure, withAuth } from '../../services/guard';
import { queryValue } from '../../services/query';

const STEPS: { stage: ExtractStage; label: string }[] = [
  { stage: 'uploading', label: '上传文件' },
  { stage: 'learning', label: 'AI 学习材料' },
  { stage: 'extracting', label: '提炼知识点' },
];

export default function CoursewarePage() {
  const params = useRouter().params;
  const domainId = queryValue(params.domainId);
  const certId = queryValue(params.certId);
  const packId = queryValue(params.packId);
  const initialJobId = queryValue(params.jobId);
  const [job, setJob] = useState<ExtractJobView | null>(null);
  const [phase, setPhase] = useState<'pick' | 'uploading' | 'extracting' | 'success' | 'fail'>(
    initialJobId ? 'extracting' : 'pick',
  );
  const [uploadPercent, setUploadPercent] = useState(0);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobId = useRef(initialJobId);
  const primed = useRef('');

  const follow = (next: ExtractJobView) => {
    setJob(next);
    if (next.status === 'succeeded') {
      stopped.current = true;
      setPhase('success');
      if (primed.current !== next.id) {
        primed.current = next.id;
        setChecked(next.drafts.map((draft) => draft.id));
      }
      return;
    }
    if (next.status === 'failed') {
      stopped.current = true;
      setPhase('fail');
      return;
    }
    if (next.status === 'cancelled') {
      stopped.current = true;
      if (certId) {
        forgetCoursewareJob(certId);
      }
      void Taro.navigateBack().catch(() => {
        void Taro.navigateBack();
      });
      return;
    }
    setPhase('extracting');
  };

  const poll = async () => {
    if (!jobId.current || stopped.current) {
      return;
    }
    try {
      const next = await withAuth((token) => fetchExtractJob(token, jobId.current));
      if (!next || stopped.current) {
        return;
      }
      setError('');
      follow(next);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        stopped.current = true;
        return;
      }
      setError(caught instanceof Error ? caught.message : '进度加载失败');
    }
  };

  const stopPolling = () => {
    stopped.current = true;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  useDidShow(() => {
    if (!jobId.current) {
      return;
    }
    if (timer.current) {
      clearInterval(timer.current);
    }
    stopped.current = false;
    void poll();
    timer.current = setInterval(() => {
      void poll();
    }, 1500);
  });

  useDidHide(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    stopped.current = true;
  });

  const choose = async () => {
    if (!certId) {
      setError('缺少证书，请从选知识点页进入');
      return;
    }
    const api = Taro as unknown as {
      chooseMessageFile?: (option: {
        count: number;
        type: 'file';
        extension: string[];
      }) => Promise<{ tempFiles?: { path?: string; name?: string; size?: number }[] }>;
    };
    if (!api.chooseMessageFile) {
      await Taro.showToast({ title: '请在微信里选择文件', icon: 'none' });
      return;
    }
    const result = await api.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['ppt', 'pptx', 'pdf', 'doc', 'docx'],
    });
    const file = result.tempFiles?.[0];
    if (!file?.path) {
      return;
    }
    const name = file.name || '课件.pdf';
    const checkedFile = validateCoursewareFile({
      fileName: name,
      byteSize: file.size && file.size > 0 ? file.size : 1,
    });
    if (!checkedFile.ok && checkedFile.code !== 'VALIDATION_ERROR') {
      setError(checkedFile.message);
      return;
    }
    if (file.size && file.size > COURSEWARE_MAX_BYTES) {
      setError('单个文件不能超过 50MB');
      return;
    }
    setPhase('uploading');
    setUploadPercent(0);
    setError('');
    setBusy(true);
    try {
      const created = await withAuth((token) =>
        uploadCourseware(token, { path: file.path!, name }, certId, setUploadPercent),
      );
      if (!created) {
        setPhase('pick');
        return;
      }
      jobId.current = created.id;
      rememberCoursewareJob(certId, created.id);
      follow(created);
      stopped.current = false;
      if (timer.current) {
        clearInterval(timer.current);
      }
      timer.current = setInterval(() => {
        void poll();
      }, 1500);
    } catch (caught) {
      setPhase('fail');
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!jobId.current || busy) {
      return;
    }
    const confirmed = await Taro.showModal({
      title: '取消提炼',
      content: '取消后这次提炼会停掉。已经在学习的材料不会写进知识点树。',
      confirmText: '取消并返回',
      confirmColor: '#b42318',
    });
    if (!confirmed.confirm) {
      return;
    }
    setBusy(true);
    try {
      const next = await withAuth((token) => cancelExtractJob(token, jobId.current));
      if (!next) {
        return;
      }
      follow(next);
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        await Taro.showToast({
          title: caught instanceof Error ? caught.message : '取消失败',
          icon: 'none',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const commit = async () => {
    if (!job || checked.length === 0) {
      setError('请至少勾选一个知识点');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = await withAuth((token) =>
        commitExtractJob(token, job.id, checked, packId || undefined),
      );
      if (!saved) {
        return;
      }
      if (certId) {
        forgetCoursewareJob(certId);
      }
      await Taro.showToast({ title: '已加入知识点树', icon: 'success' });
      const back = await Taro.navigateBack().then(
        () => true,
        () => false,
      );
      if (!back) {
        const query = [`domainId=${domainId}`, `certId=${certId}`];
        if (packId) {
          query.push(`packId=${packId}`);
        }
        await Taro.redirectTo({ url: `/pages/pack/knowledge/index?${query.join('&')}` });
      }
    } catch (caught) {
      if (!isAuthFailure(caught)) {
        setError(caught instanceof Error ? caught.message : '加入失败');
      }
    } finally {
      setBusy(false);
    }
  };

  const backToTree = () => {
    if (certId) {
      forgetCoursewareJob(certId);
    }
    void Taro.navigateBack().catch(() => {
      void Taro.redirectTo({
        url: `/pages/pack/knowledge/index?domainId=${domainId}&certId=${certId}`,
      });
    });
  };

  if (phase === 'pick') {
    return (
      <Screen
        back
        title="上传课件或书籍"
        subtitle="出题时自主上传 · AI 提炼知识点"
        footer={
          <Button className="u-btn" disabled={busy} loading={busy} onClick={() => void choose()}>
            选择文件
          </Button>
        }
      >
        <View className="u-pad">
          <View className="u-drop" onClick={() => void choose()}>
            <View className="u-drop-icon">↑</View>
            <Text className="u-drop-title">点击选择文件上传</Text>
            <Text className="u-drop-sub">支持 PPT / PPTX / PDF / DOC · 单文件 ≤ 50MB</Text>
          </View>
          <View className="u-panel" style={{ marginTop: '23px' }}>
            <Text className="u-label">上传后会发生什么</Text>
            <Text className="u-meta">1. 上传课件或书籍文件</Text>
            <Text className="u-meta">2. AI 自动学习并提炼知识点（可能较慢）</Text>
            <Text className="u-meta">3. 提炼完成后可勾选回树，加入刷题包</Text>
          </View>
          {error ? <ErrorBlock detail={error} /> : null}
        </View>
      </Screen>
    );
  }

  if (phase === 'uploading') {
    return (
      <Screen back title="正在上传" subtitle="文件上传完成后会自动开始学习材料">
        <View className="u-pad">
          <View className="u-panel">
            <Text className="u-label">上传文件</Text>
            <Text className="u-clock">{uploadPercent}%</Text>
            <View className="u-bar">
              <View className="u-bar-fill" style={{ width: `${uploadPercent}%` }} />
            </View>
            <StageList stage="uploading" uploadPercent={uploadPercent} />
          </View>
        </View>
      </Screen>
    );
  }

  if (phase === 'success' && job) {
    return (
      <Screen
        back
        title="提炼完成"
        subtitle="勾选要留下的知识点"
        footer={
          <Button className="u-btn" disabled={busy || checked.length === 0} onClick={() => void commit()}>
            加入知识点树
          </Button>
        }
      >
        <View className="u-pad">
          <View className="u-state" style={{ paddingTop: '12px', paddingBottom: '12px' }}>
            <View className="u-check-lg">✓</View>
          </View>
          {error ? <Text className="u-state-sub">{error}</Text> : null}
          {job.drafts.map((draft) => {
            const on = checked.includes(draft.id);
            return (
              <View
                key={draft.id}
                className={on ? 'u-tree u-tree-on' : 'u-tree'}
                onClick={() =>
                  setChecked((current) =>
                    current.includes(draft.id)
                      ? current.filter((id) => id !== draft.id)
                      : [...current, draft.id],
                  )
                }
              >
                <View className={on ? 'u-check u-check-on' : 'u-check'}>
                  <Text className="u-check-mark">{on ? '✓' : ''}</Text>
                </View>
                <View className="u-card-copy">
                  <Text className="u-card-title">{draft.name}</Text>
                  <Text className="u-card-sub">{draft.excerpt}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </Screen>
    );
  }

  if (phase === 'fail') {
    return (
      <Screen back title="提炼失败" subtitle="可以换一份材料重新上传">
        <View className="u-pad">
          <ErrorBlock
            detail={job?.error?.message || error || '提炼没有完成'}
            retryLabel="重新上传"
            onRetry={() => {
              stopPolling();
              jobId.current = '';
              setJob(null);
              setError('');
              setPhase('pick');
            }}
            onBack={backToTree}
          />
        </View>
      </Screen>
    );
  }

  const stage = job?.stage ?? 'learning';
  return (
    <Screen
      back
      title="正在提炼知识点"
      subtitle="材料越长提炼越慢，关闭本页不影响提炼"
      footer={
        <Button className="u-btn-ghost" disabled={busy} onClick={() => void cancel()}>
          取消并返回
        </Button>
      }
    >
      <View className="u-pad">
        <View className="u-center-card" style={{ marginTop: '24px', width: '100%' }}>
          <View className="u-spin" />
          <Text className="u-state-title">{job?.file.fileName || '课件'}</Text>
          <Text className="u-state-sub">预计约 {job?.estimatedMinutes ?? 1} 分钟</Text>
          <View className="u-bar" style={{ width: '100%' }}>
            <View className="u-bar-fill" style={{ width: `${job?.progress ?? 8}%` }} />
          </View>
          <StageList stage={stage} />
        </View>
        {error ? <Text className="u-state-sub">{error}</Text> : null}
      </View>
    </Screen>
  );
}

function StageList(props: { stage: ExtractStage; uploadPercent?: number }) {
  const order: ExtractStage[] = ['uploading', 'learning', 'extracting', 'done'];
  const current = order.indexOf(props.stage);
  return (
    <View>
      {STEPS.map((step, index) => {
        const done = props.stage === 'done' || index < current;
        const active = index === current;
        return (
          <View key={step.stage} className="u-step" style={{ marginTop: '15px' }}>
            <View className={done || active ? 'u-step-dot u-step-dot-on' : 'u-step-dot'} />
            <Text className={done || active ? 'u-step-name u-step-name-on' : 'u-step-name'}>
              {step.label}
              {step.stage === 'uploading' && props.uploadPercent !== undefined
                ? ` ${props.uploadPercent}%`
                : ''}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
