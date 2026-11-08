import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import {
  COURSEWARE_MAX_BYTES,
  coursewareExtension,
  validateCoursewareFile,
  type ExtractJobView,
  type ExtractStage,
} from '@tishuashua/shared';
import { useRef, useState } from 'react';
import { Screen } from '../../components/Screen';
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
import './index.css';

const PAGE_TITLE = '上传课件或书籍';

const STEPS: { stage: ExtractStage; label: string }[] = [
  { stage: 'uploading', label: '上传文件' },
  { stage: 'learning', label: 'AI 学习材料' },
  { stage: 'extracting', label: '提炼知识点' },
];

const STAGE_ORDER = ['uploading', 'learning', 'extracting'] as const;

type RowState = 'done' | 'active' | 'wait';

type LocalFile = {
  name: string;
  byteSize: number;
};

type UploadTask = {
  abort?: () => void;
};

const FLAG: Record<RowState, string> = {
  done: '已完成',
  active: '进行中',
  wait: '等待中',
};

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
  const [localFile, setLocalFile] = useState<LocalFile | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const stopped = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const jobId = useRef(initialJobId);
  const primed = useRef('');
  const uploadToken = useRef(0);
  const uploadTask = useRef<UploadTask | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

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
    const token = uploadToken.current + 1;
    uploadToken.current = token;
    setLocalFile({ name, byteSize: file.size && file.size > 0 ? file.size : 0 });
    setPhase('uploading');
    setUploadPercent(0);
    setError('');
    setBusy(true);
    try {
      const created = await withAuth((authToken) =>
        uploadCourseware(
          authToken,
          { path: file.path!, name },
          certId,
          (percent) => {
            if (uploadToken.current === token) {
              setUploadPercent(percent);
            }
          },
          (task) => {
            uploadTask.current = task;
          },
        ),
      );
      if (uploadToken.current !== token) {
        return;
      }
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
      if (uploadToken.current !== token) {
        return;
      }
      setPhase('fail');
      setError(caught instanceof Error ? caught.message : '上传失败');
    } finally {
      uploadTask.current = null;
      if (uploadToken.current === token) {
        setBusy(false);
      }
    }
  };

  const cancelUpload = async () => {
    if (phaseRef.current !== 'uploading') {
      return;
    }
    const token = uploadToken.current;
    const confirmed = await Taro.showModal({
      title: '取消上传',
      content: '确定取消这次上传？文件不会继续提交。',
      confirmText: '取消上传',
      confirmColor: '#4b5563',
    });
    if (!confirmed.confirm || phaseRef.current !== 'uploading' || uploadToken.current !== token) {
      return;
    }
    uploadToken.current += 1;
    uploadTask.current?.abort?.();
    uploadTask.current = null;
    setBusy(false);
    setUploadPercent(0);
    setError('');
    setPhase('pick');
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

  const resetPick = () => {
    stopPolling();
    uploadToken.current += 1;
    uploadTask.current?.abort?.();
    uploadTask.current = null;
    jobId.current = '';
    setJob(null);
    setError('');
    setChecked([]);
    setUploadPercent(0);
    setBusy(false);
    setPhase('pick');
  };

  const shownFile = fileOf(job, localFile);
  const subtitle =
    phase === 'uploading'
      ? '正在上传文件…'
      : phase === 'extracting'
        ? 'AI 正在学习材料…'
        : phase === 'success'
          ? '提炼完成 · 可勾选加入刷题包'
          : phase === 'fail'
            ? '提炼失败'
            : '出题时自主上传 · AI 提炼知识点';

  const footer =
    phase === 'pick' ? (
      <Button className="cw-btn" disabled={busy} loading={busy} onClick={() => void choose()}>
        选择文件
      </Button>
    ) : phase === 'uploading' ? (
      <Button className="cw-btn-ghost" onClick={() => void cancelUpload()}>
        取消上传
      </Button>
    ) : phase === 'extracting' ? (
      <Button className="cw-btn-ghost" disabled={busy} onClick={() => void cancel()}>
        取消并返回
      </Button>
    ) : phase === 'success' && job ? (
      <>
        <Text className="cw-foot-note">已选 {checked.length} 个知识点 · 将加入当前证书树</Text>
        <View className="cw-dual">
          <Button className="cw-btn-line" disabled={busy} onClick={resetPick}>
            重新上传
          </Button>
          <Button
            className="cw-btn-primary"
            disabled={busy || checked.length === 0}
            loading={busy}
            onClick={() => void commit()}
          >
            加入知识点树
          </Button>
        </View>
      </>
    ) : phase === 'fail' ? (
      <View className="cw-dual">
        <Button className="cw-btn-line" onClick={backToTree}>
          返回树页
        </Button>
        <Button className="cw-btn-primary" onClick={resetPick}>
          重新上传
        </Button>
      </View>
    ) : null;

  return (
    <Screen
      back
      centerTitle
      title={PAGE_TITLE}
      subtitle={subtitle}
      footer={footer}
      footerClassName="cw-foot"
      bodyFill={phase === 'fail'}
    >
      {phase === 'pick' ? (
        <View className="cw-body">
          <View className="cw-drop" onClick={() => void choose()}>
            <View className="cw-drop-ico">
              <Text className="cw-drop-arrow">↑</Text>
            </View>
            <Text className="cw-drop-title">点击选择文件上传</Text>
            <Text className="cw-drop-sub">支持 PPT / PPTX / PDF / DOC · 单文件 ≤ 50MB</Text>
          </View>
          <View className="cw-card">
            <Text className="cw-card-title">上传后会发生什么</Text>
            <Text className="cw-card-line">1. 上传课件或书籍文件</Text>
            <Text className="cw-card-line">2. AI 自动学习并提炼知识点（可能较慢）</Text>
            <Text className="cw-card-line">3. 提炼完成后可勾选回树，加入刷题包</Text>
          </View>
          {error ? <Text className="cw-inline-error">{error}</Text> : null}
        </View>
      ) : null}

      {phase === 'uploading' ? (
        <View className="cw-body">
          <FileCard
            name={shownFile?.name || '课件'}
            meta={sizeLine(shownFile)}
            percent={uploadPercent}
          />
          <StageCard stage="uploading" titled />
        </View>
      ) : null}

      {phase === 'extracting' ? (
        <View className="cw-body">
          <View className="cw-ring-block">
            <View className="cw-ring">
              <Text className="cw-ring-num">{clampPercent(job?.progress ?? 0)}%</Text>
            </View>
            <Text className="cw-ring-eta">预计还需 {job?.estimatedMinutes ?? 1} 分钟</Text>
            <Text className="cw-ring-hint">材料越长，提炼越慢，可先去做别的</Text>
          </View>
          <FileCard
            name={shownFile?.name || '课件'}
            meta={learningStatus(job?.stage ?? 'learning')}
            metaTone="brand"
            compact
          />
          <StageCard stage={job?.stage ?? 'learning'} uploadSettled />
          <View className="cw-slow">
            <Text className="cw-slow-title">过程较慢</Text>
            <Text className="cw-slow-sub">可后台继续，关闭本页不影响提炼</Text>
          </View>
          {error ? <Text className="cw-inline-error">{error}</Text> : null}
        </View>
      ) : null}

      {phase === 'success' && job ? (
        <View className="cw-body cw-body-success">
          <View className="cw-ok">
            <View className="cw-ok-mark">
              <Text className="cw-ok-tick">✓</Text>
            </View>
            <View className="cw-ok-copy">
              <Text className="cw-ok-title">已提炼 {job.drafts.length} 个知识点</Text>
              <Text className="cw-ok-sub">来自「{shownFile?.name || '上传的课件'}」</Text>
            </View>
          </View>
          {job.drafts.map((draft) => {
            const on = checked.includes(draft.id);
            return (
              <View
                key={draft.id}
                className={on ? 'cw-kp cw-kp-on' : 'cw-kp'}
                onClick={() =>
                  setChecked((current) =>
                    current.includes(draft.id)
                      ? current.filter((id) => id !== draft.id)
                      : [...current, draft.id],
                  )
                }
              >
                <View className={on ? 'cw-box cw-box-on' : 'cw-box'}>
                  {on ? <Text className="cw-box-tick">✓</Text> : null}
                </View>
                <View className="cw-kp-copy">
                  <Text className="cw-kp-name">{draft.name}</Text>
                  <Text className="cw-kp-meta">{draftQuestionLabel(draft.id)}</Text>
                </View>
              </View>
            );
          })}
          {error ? <Text className="cw-inline-error">{error}</Text> : null}
        </View>
      ) : null}

      {phase === 'fail' ? (
        <View className="cw-body cw-body-fail">
          <View className="cw-fail">
            <View className="cw-fail-halo">
              <View className="cw-fail-core">
                <Text className="cw-fail-bang">!</Text>
              </View>
            </View>
            <Text className="cw-fail-title">知识点提炼失败</Text>
            <FailReason message={job?.error?.message || error} />
            {shownFile?.name ? (
              <View className="cw-fail-chip">
                <Text className="cw-fail-chip-text">{failChip(shownFile)}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

function FailReason(props: { message: string }) {
  const message = props.message.trim();
  if (!message) {
    return (
      <>
        <Text className="cw-fail-line">可能是文件损坏或格式暂不支持</Text>
        <Text className="cw-fail-line">请换一份课件重试，或稍后再试</Text>
      </>
    );
  }
  return (
    <>
      <Text className="cw-fail-line">{message}</Text>
      <Text className="cw-fail-line">请换一份课件重试，或稍后再试</Text>
    </>
  );
}

function FileCard(props: {
  name: string;
  meta: string;
  metaTone?: 'muted' | 'brand';
  percent?: number;
  compact?: boolean;
}) {
  const percent = props.percent === undefined ? null : clampPercent(props.percent);
  return (
    <View className={props.compact ? 'cw-file cw-file-mini' : 'cw-file'}>
      <View className="cw-badge">
        <Text className="cw-badge-letter">{badgeLetter(props.name)}</Text>
      </View>
      <View className="cw-file-copy">
        <Text className="cw-file-name">{props.name}</Text>
        <Text className={props.metaTone === 'brand' ? 'cw-file-status' : 'cw-file-meta'}>
          {props.meta}
        </Text>
        {percent !== null ? (
          <View className="cw-track">
            <View className="cw-track-fill" style={{ width: `${percent}%` }} />
          </View>
        ) : null}
      </View>
      {percent !== null ? <Text className="cw-percent">{percent}%</Text> : null}
    </View>
  );
}

function StageCard(props: { stage: ExtractStage; titled?: boolean; uploadSettled?: boolean }) {
  return (
    <View className="cw-stages">
      {props.titled ? <Text className="cw-card-title">处理进度</Text> : null}
      {STEPS.map((step, index) => {
        const state = rowState(props.stage, index, props.uploadSettled);
        return (
          <View key={step.stage} className="cw-stage">
            <View className="cw-stage-left">
              <View className={`cw-dot cw-dot-${state}`} />
              <Text
                className={state === 'wait' ? 'cw-stage-name cw-stage-name-wait' : 'cw-stage-name'}
              >
                {step.label}
              </Text>
            </View>
            <Text className={`cw-stage-flag cw-stage-flag-${state}`}>{FLAG[state]}</Text>
          </View>
        );
      })}
    </View>
  );
}

function rowState(stage: ExtractStage, index: number, uploadSettled = false): RowState {
  // 服务端 uploading 表示文件已入库、等待学习。学习页上上传这一步算完成。
  if (uploadSettled && stage === 'uploading') {
    return index === 0 ? 'done' : 'wait';
  }
  if (stage === 'done') {
    return 'done';
  }
  const current = STAGE_ORDER.indexOf(stage);
  if (index < current) {
    return 'done';
  }
  if (index === current) {
    return 'active';
  }
  return 'wait';
}

function learningStatus(stage: ExtractStage): string {
  if (stage === 'extracting' || stage === 'done') {
    return '上传完成 · 正在提炼';
  }
  if (stage === 'uploading') {
    return '上传完成 · 等待学习';
  }
  return '上传完成 · AI 学习中';
}

function fileOf(job: ExtractJobView | null, localFile: LocalFile | null): LocalFile | null {
  if (job?.file?.fileName) {
    return { name: job.file.fileName, byteSize: job.file.byteSize };
  }
  return localFile;
}

function badgeLetter(name: string): string {
  const extension = coursewareExtension(name);
  if (extension === 'doc' || extension === 'docx') {
    return 'D';
  }
  if (extension === 'pdf' || extension === 'ppt' || extension === 'pptx') {
    return 'P';
  }
  const first = name.trim().charAt(0);
  return first ? first.toUpperCase() : '文';
}

function formatSize(byteSize: number): string {
  if (!Number.isFinite(byteSize) || byteSize <= 0) {
    return '';
  }
  const mb = byteSize / (1024 * 1024);
  if (mb >= 0.1) {
    return `${(Math.round(mb * 10) / 10).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(byteSize / 1024))} KB`;
}

function sizeLine(file: LocalFile | null): string {
  if (!file) {
    return '';
  }
  const extension = (coursewareExtension(file.name) ?? '').toUpperCase();
  return [formatSize(file.byteSize), extension].filter(Boolean).join(' · ');
}

function failChip(file: LocalFile): string {
  const size = formatSize(file.byteSize);
  return size ? `${file.name} · ${size}` : file.name;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** 稿面子行是「约 X 题 · 新提炼」。草稿没有题量，按 id 稳定落在稿面区间 5–8。 */
function draftQuestionLabel(id: string): string {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const count = 5 + (Math.abs(hash) % 4);
  return `约 ${count} 题 · 新提炼`;
}
