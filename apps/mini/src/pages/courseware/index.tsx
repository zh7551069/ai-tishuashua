import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import {
  COURSEWARE_MAX_BYTES,
  validateCoursewareFile,
  type ExtractJobView,
  type ExtractStage,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { MiniPage } from '../../components/MiniPage';
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
      <MiniPage
        title="上传教材"
        hint="上传后 AI 会自动学习并提炼知识点，材料越长可能越慢。完成后可以勾选，加入知识点树，再放进刷题包。"
      >
        <Text className="meta">支持 PPT、PPTX、PDF、DOC、DOCX，单个文件不超过 50MB。</Text>
        {error ? <Text className="error">{error}</Text> : null}
        <Button className="primary" disabled={busy} loading={busy} onClick={() => void choose()}>
          选择文件
        </Button>
        <Button className="ghost" onClick={() => void Taro.navigateBack()}>
          返回知识点
        </Button>
      </MiniPage>
    );
  }

  if (phase === 'uploading') {
    return (
      <MiniPage title="正在上传" hint="文件上传完成后会自动开始学习材料。">
        <StageList stage="uploading" uploadPercent={uploadPercent} />
        <View className="bar">
          <View className="bar-fill" style={{ width: `${uploadPercent}%` }} />
        </View>
        <Text className="meta">已上传 {uploadPercent}%</Text>
      </MiniPage>
    );
  }

  if (phase === 'success' && job) {
    return (
      <MiniPage title="提炼完成" hint="勾选要留下的知识点。它们会写进当前证书下的「我的课件」。">
        {error ? <Text className="error">{error}</Text> : null}
        {job.drafts.map((draft) => {
          const on = checked.includes(draft.id);
          return (
            <View
              key={draft.id}
              className="tree-row"
              onClick={() =>
                setChecked((current) =>
                  current.includes(draft.id)
                    ? current.filter((id) => id !== draft.id)
                    : [...current, draft.id],
                )
              }
            >
              <View className={on ? 'box box-on' : 'box box-off'}>
                <Text className="box-mark">{on ? '✓' : ''}</Text>
              </View>
              <View className="sheet-copy">
                <Text className="tree-name">{draft.name}</Text>
                <Text className="meta">{draft.excerpt}</Text>
              </View>
            </View>
          );
        })}
        <Button
          className="primary"
          disabled={busy || checked.length === 0}
          onClick={() => void commit()}
        >
          加入知识点树
        </Button>
        <Button className="ghost" onClick={backToTree}>
          返回知识点
        </Button>
      </MiniPage>
    );
  }

  if (phase === 'fail') {
    return (
      <MiniPage title="提炼失败" hint="可以换一份材料重新上传，或先回到知识点树。">
        <Text className="error">{job?.error?.message || error || '提炼没有完成'}</Text>
        <Button
          className="primary"
          onClick={() => {
            stopPolling();
            jobId.current = '';
            setJob(null);
            setError('');
            setPhase('pick');
          }}
        >
          重新上传
        </Button>
        <Button className="ghost" onClick={backToTree}>
          返回知识点
        </Button>
      </MiniPage>
    );
  }

  const stage = job?.stage ?? 'learning';
  return (
    <MiniPage title="正在提炼知识点" hint="材料越长提炼越慢，可先去做别的。关闭本页不影响提炼。">
      {error ? <Text className="error">{error}</Text> : null}
      <View className="card">
        <Text className="tree-name">{job?.file.fileName || '课件'}</Text>
        <Text className="meta">预计约 {job?.estimatedMinutes ?? 1} 分钟</Text>
        <StageList stage={stage} />
        <View className="bar">
          <View className="bar-fill" style={{ width: `${job?.progress ?? 8}%` }} />
        </View>
      </View>
      <Button className="danger" disabled={busy} onClick={() => void cancel()}>
        取消并返回
      </Button>
    </MiniPage>
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
          <View key={step.stage} className="step">
            <View className={done || active ? 'step-dot step-dot-on' : 'step-dot'} />
            <Text className={done || active ? 'step-label' : 'step-label step-label-wait'}>
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
