import { Button, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  filterCatalogTree,
  textbookCheckState,
  toggleKnowledgePoint,
  toggleTextbook,
  type CatalogTreeNode,
  type CheckState,
  type KnowledgePointNode,
  type KnowledgeTree,
  type PackView,
  type TextbookNode,
} from '@tishuashua/shared';
import { useState } from 'react';
import { BridgeSteps } from '../../../components/BridgeSteps';
import { Screen } from '../../../components/Screen';
import { EmptyBlock, ErrorBlock } from '../../../components/StateBlock';
import { fetchCertificates, fetchDomains, fetchKnowledgeTree } from '../../../services/catalog-api';
import { readCoursewareJob } from '../../../services/courseware-api';
import { isAuthFailure, withAuth } from '../../../services/guard';
import { createPack, fetchPack, updatePack } from '../../../services/pack-api';
import { queryValue } from '../../../services/query';
import {
  aiQuestionCount,
  knowledgeStatLabel,
  materialKind,
  type MaterialKind,
} from '../../../ui/knowledge-meta';
import iconSearch from '../assets/icon-search-kp.png';
import { PackSearch } from '../PackSearch';

type ErrorKind = '' | 'network' | 'missing' | 'unavailable';

const DEFAULT_TIP = '勾选教材 = 全选其下知识点；半选表示部分已选。';

function readInset(): number {
  try {
    return Taro.getSystemInfoSync().statusBarHeight ?? 0;
  } catch {
    return 0;
  }
}

function goBack() {
  void Taro.navigateBack({
    fail: () => {
      void Taro.reLaunch({ url: '/pages/home/index' });
    },
  });
}

export default function KnowledgePage() {
  const params = useRouter().params;
  const domainId = queryValue(params.domainId);
  const certId = queryValue(params.certId);
  const packId = queryValue(params.packId);
  const [inset] = useState(readInset);
  const [tree, setTree] = useState<KnowledgeTree | null>(null);
  const [header, setHeader] = useState<{ domainName: string; certificateName: string } | null>(
    null,
  );
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [errorKind, setErrorKind] = useState<ErrorKind>('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [extractJobId, setExtractJobId] = useState('');
  const [savedPack, setSavedPack] = useState<PackView | null>(null);

  const load = async () => {
    if (!domainId || !certId) {
      setError('缺少领域或证书');
      setErrorKind('missing');
      setReady(false);
      return;
    }
    setError('');
    setErrorKind('');
    setSaveError('');
    setSavedPack(null);
    setReady(false);
    try {
      const data = await withAuth(async (token) => {
        const treeTask = fetchKnowledgeTree(token, certId);
        const [domains, certs] = await Promise.all([
          fetchDomains(token).catch(() => null),
          fetchCertificates(token, domainId).catch(() => null),
        ]);
        const domainName = domains?.items.find((item) => item.id === domainId)?.name ?? '';
        const certificateName = certs?.items.find((item) => item.id === certId)?.name ?? '';
        if (domainName || certificateName) {
          setHeader({ domainName, certificateName });
        }
        const nextTree = await treeTask;
        const pack = packId ? await fetchPack(token, packId) : null;
        return { nextTree, pack };
      });
      if (!data) {
        return;
      }
      setHeader({
        domainName: data.nextTree.domainName,
        certificateName: data.nextTree.certificateName,
      });
      if (data.pack?.unavailable) {
        setError('关联证书已下架，此包只能删除');
        setErrorKind('unavailable');
        setReady(false);
        return;
      }
      const allowed = new Set(collectIds(data.nextTree.nodes));
      setTree(data.nextTree);
      setSelected((data.pack?.knowledgePointIds ?? []).filter((id) => allowed.has(id)));
      setReady(true);
    } catch (caught) {
      if (isAuthFailure(caught)) {
        return;
      }
      setReady(false);
      setErrorKind('network');
      setError(caught instanceof Error ? caught.message : '加载失败');
    }
  };

  useDidShow(() => {
    setExtractJobId(certId ? readCoursewareJob(certId) : '');
    void load();
  });

  const openCourseware = (jobId?: string) => {
    if (!domainId || !certId) {
      setError('缺少领域或证书');
      setErrorKind('missing');
      return;
    }
    const next = [`domainId=${domainId}`, `certId=${certId}`];
    if (packId) {
      next.push(`packId=${packId}`);
    }
    if (jobId) {
      next.push(`jobId=${jobId}`);
    }
    void Taro.navigateTo({ url: `/pages/courseware/index?${next.join('&')}` });
  };

  const save = async () => {
    if (!tree || selected.length === 0 || saving) {
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const saved = await withAuth((token) =>
        packId
          ? updatePack(token, packId, { knowledgePointIds: selected })
          : createPack(token, { domainId, certId, knowledgePointIds: selected }),
      );
      if (!saved) {
        return;
      }
      setSavedPack(saved);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const visible = tree ? filterCatalogTree(tree.nodes, query) : [];
  const originals = new Map(
    (tree?.nodes ?? []).filter((node) => node.kind === 'textbook').map((node) => [node.id, node]),
  );
  const subtitle = joinDot(
    tree?.domainName || header?.domainName || '',
    tree?.certificateName || header?.certificateName || '',
  );
  const showFoot = ready && visible.length > 0;
  const headStyle = { marginTop: `-${inset}px`, paddingTop: `${inset}px` };

  if (savedPack && tree) {
    const points = selectedPoints(tree, selected);
    return (
      <Screen
        back
        title="编辑刷题包"
        subtitle={tree.certificateName}
        subtitleTone="muted"
        titleSize="lg"
        onBack={() => setSavedPack(null)}
        footer={
          <Button
            className="u-btn"
            onClick={() => {
              void Taro.navigateTo({ url: `/pages/quiz/index?packId=${savedPack.id}` });
            }}
          >
            完成并开始刷题
          </Button>
        }
      >
        <View className="u-pad u-pad-kp">
          <View className="u-saved-row">
            <View className="u-saved-pill">
              <View className="u-saved-mark">
                <View className="u-saved-tick" />
              </View>
              <Text className="u-saved-text">已保存到刷题包</Text>
            </View>
          </View>
          <View className="u-saved-list">
            {points.map((point) => (
              <PointRow key={point.id} name={point.name} meta={knowledgeStatLabel(point.id)} on />
            ))}
          </View>
        </View>
      </Screen>
    );
  }

  const tip = ready && visible.length > 0 ? selectionTip(tree?.nodes ?? [], selected, collapsed) : '';

  return (
    <Screen
      bare
      background="#f8f9fb"
      bodyFill
      footerClassName="kp-foot"
      footer={
        showFoot ? (
          <View className="kp-foot-stack">
            {saveError ? <Text className="u-foot-error">{saveError}</Text> : null}
            <Text className="kp-foot-copy">
              已选 {selected.length} 个知识点 · AI 将生成约 {aiQuestionCount(selected.length)} 题
            </Text>
            <Button
              className="u-btn kp-cta"
              disabled={saving || selected.length === 0}
              loading={saving}
              onClick={() => void save()}
            >
              开始刷题
            </Button>
          </View>
        ) : null
      }
    >
      <View className="kp-sheet">
        <View className="kp-head" style={headStyle}>
          <View className="kp-nav">
            <Text className="kp-back" onClick={goBack}>
              ‹
            </Text>
            <View className="kp-nav-copy">
              <Text className="kp-title">选择知识点</Text>
              {subtitle ? <Text className="kp-sub">{subtitle}</Text> : null}
            </View>
          </View>
          <BridgeSteps current={3} numWeight="regular" ring />
          <View className="kp-search-wrap">
            <PackSearch
              placeholder="搜索教材或知识点"
              value={query}
              onChange={setQuery}
              icon={iconSearch}
            />
          </View>
        </View>
        <View className="kp-body">
          {tip ? <Tip text={tip} /> : null}
          {ready ? (
            <View className="kp-upload-wrap">
              <View className="kp-upload" onClick={() => openCourseware(extractJobId || undefined)}>
                <View className="kp-upload-icon">
                  <Text className="kp-upload-arrow">↑</Text>
                </View>
                <View className="kp-upload-copy">
                  <Text className="kp-upload-title">
                    {extractJobId ? '查看课件提炼' : '上传课件或书籍'}
                  </Text>
                  <Text className="kp-upload-sub">AI 自动提炼知识点 · 支持 PPT / PDF</Text>
                </View>
                <Text className="kp-upload-chev">›</Text>
              </View>
            </View>
          ) : null}
          {!ready && !error ? (
            <View className="kp-section">
              <Text className="kp-section-title">教材与知识点</Text>
            </View>
          ) : null}
          {ready && visible.length > 0 ? (
            <View className="kp-section">
              <Text className="kp-section-title">教材与知识点</Text>
              <Text className="kp-section-count">已选 {selected.length}</Text>
            </View>
          ) : null}
          {!ready && !error ? <KnowledgeSkeleton /> : null}
          {error && !ready ? (
            <ErrorBlock
              className="pack-state"
              title={errorTitle(errorKind)}
              detail={errorKind === 'network' ? '网络好像不太稳定，请检查后重试' : error}
              onRetry={() => void load()}
              retryLabel={errorKind === 'network' ? '重新加载' : '重试'}
              onBack={errorKind === 'network' ? undefined : goBack}
            />
          ) : null}
          {ready && visible.length === 0 ? (
            <EmptyBlock
              className="pack-state"
              title={query ? '没有找到相关教材或知识点' : '暂无知识点'}
              detail={
                query ? '换个关键词，或上传课件让 AI 提炼' : '可以上传课件，提炼后再加入刷题包。'
              }
              action={query ? '清除搜索' : '上传课件'}
              tone={query ? 'soft' : 'solid'}
              onAction={() => (query ? setQuery('') : openCourseware())}
            />
          ) : null}
          {ready && visible.length > 0 ? (
            <View className="kp-list">
              {visible.map((node) => {
                if (node.kind === 'knowledge_point') {
                  return (
                    <PointRow
                      key={node.id}
                      name={node.name}
                      meta={knowledgeStatLabel(node.id)}
                      on={selected.includes(node.id)}
                      independent
                      onPress={() => setSelected(toggleKnowledgePoint(selected, node.id))}
                    />
                  );
                }
                const original = originals.get(node.id);
                const checkChildIds =
                  original && original.kind === 'textbook'
                    ? original.children.map((child) => child.id)
                    : [];
                return (
                  <MaterialBlock
                    key={node.id}
                    node={node}
                    checkChildIds={checkChildIds}
                    selected={selected}
                    collapsed={Boolean(collapsed[node.id])}
                    onToggleExpand={() =>
                      setCollapsed((current) => ({ ...current, [node.id]: !current[node.id] }))
                    }
                    onToggleTextbook={() => setSelected(toggleTextbook(selected, checkChildIds))}
                    onTogglePoint={(id) => setSelected(toggleKnowledgePoint(selected, id))}
                  />
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

function collectIds(nodes: readonly CatalogTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'knowledge_point') {
      ids.push(node.id);
      continue;
    }
    for (const child of node.children) {
      ids.push(child.id);
    }
  }
  return ids;
}

function selectedPoints(tree: KnowledgeTree, ids: string[]): KnowledgePointNode[] {
  const want = new Set(ids);
  const points: KnowledgePointNode[] = [];
  for (const node of tree.nodes) {
    if (node.kind === 'knowledge_point') {
      if (want.has(node.id)) {
        points.push(node);
      }
      continue;
    }
    for (const child of node.children) {
      if (want.has(child.id)) {
        points.push(child);
      }
    }
  }
  return points;
}

function joinDot(left: string, right: string): string | undefined {
  const text = [left, right].filter(Boolean).join(' · ');
  return text || undefined;
}

function errorTitle(kind: ErrorKind): string {
  if (kind === 'network') {
    return '知识点加载失败';
  }
  if (kind === 'unavailable') {
    return '无法编辑知识点';
  }
  return '加载失败';
}

function selectionTip(
  nodes: readonly CatalogTreeNode[],
  selected: readonly string[],
  collapsed: Record<string, boolean>,
): string {
  const textbooks = nodes.filter((node): node is TextbookNode => node.kind === 'textbook');
  const stateOf = (node: TextbookNode) =>
    textbookCheckState(
      node.children.map((child) => child.id),
      selected,
    );
  const expandedFull = textbooks.filter(
    (node) => !collapsed[node.id] && stateOf(node) === 'checked',
  );
  if (expandedFull.length > 0) {
    const count = expandedFull.reduce((sum, node) => sum + node.children.length, 0);
    return `已勾选教材：下属 ${count} 个知识点全部选中。`;
  }
  const collapsedActive = textbooks.filter(
    (node) => collapsed[node.id] && stateOf(node) !== 'unchecked',
  );
  const expandedPartial = textbooks.some(
    (node) => !collapsed[node.id] && stateOf(node) === 'indeterminate',
  );
  if (collapsedActive.length > 0 && !expandedPartial) {
    return '教材勾选后折叠仍显示已选；点行展开查看明细。';
  }
  return DEFAULT_TIP;
}

function Tip(props: { text: string }) {
  if (props.text === DEFAULT_TIP) {
    return (
      <View className="kp-tip-bleed">
        <View className="kp-tip-bar">
          <Text className="kp-tip-text">{props.text}</Text>
        </View>
      </View>
    );
  }
  return (
    <View className="kp-tip-card-wrap">
      <View className="kp-tip-card">
        <Text className="kp-tip-text">{props.text}</Text>
      </View>
    </View>
  );
}

function KnowledgeSkeleton() {
  const rows = [
    { child: false, key: 'a' },
    { child: true, key: 'b' },
    { child: true, key: 'c' },
    { child: false, key: 'd' },
    { child: false, key: 'e' },
  ];
  return (
    <View className="kp-list">
      {rows.map((row) => (
        <View key={row.key} className={row.child ? 'kp-skel kp-skel-child' : 'kp-skel'}>
          <View className="kp-skel-dot" />
          <View className="kp-skel-lines">
            <View className="kp-skel-line" />
            <View className="kp-skel-line kp-skel-line-short" />
          </View>
          <View className="kp-skel-dot" />
        </View>
      ))}
    </View>
  );
}

function MaterialBlock(props: {
  node: TextbookNode;
  checkChildIds: string[];
  selected: string[];
  collapsed: boolean;
  onToggleExpand: () => void;
  onToggleTextbook: () => void;
  onTogglePoint: (id: string) => void;
}) {
  const kind: MaterialKind = materialKind(props.node.name);
  const state = textbookCheckState(props.checkChildIds, props.selected);
  return (
    <View className="kp-group">
      <View className="kp-material">
        <Text className="kp-fold" onClick={props.onToggleExpand}>
          {props.collapsed ? '▸' : '▾'}
        </Text>
        <View className={kind === 'courseware' ? 'kp-book kp-book-file' : 'kp-book'}>
          <Text className="kp-book-mark">{kind === 'courseware' ? 'P' : '书'}</Text>
        </View>
        <View className="kp-copy" onClick={props.onToggleExpand}>
          <Text className="kp-mat-name">{props.node.name}</Text>
          <View className="kp-meta-row">
            <Text className={kind === 'courseware' ? 'kp-badge kp-badge-file' : 'kp-badge'}>
              {kind === 'courseware' ? '课件' : '书籍'}
            </Text>
            <Text className="kp-count">{props.checkChildIds.length} 个知识点</Text>
          </View>
        </View>
        <View onClick={props.onToggleTextbook}>
          <Check state={state} />
        </View>
      </View>
      {props.collapsed
        ? null
        : props.node.children.map((child) => (
            <PointRow
              key={child.id}
              name={child.name}
              meta={knowledgeStatLabel(child.id)}
              on={props.selected.includes(child.id)}
              child
              onPress={() => props.onTogglePoint(child.id)}
            />
          ))}
    </View>
  );
}

function PointRow(props: {
  name: string;
  meta: string;
  on: boolean;
  child?: boolean;
  independent?: boolean;
  onPress?: () => void;
}) {
  const className = [
    'kp-point',
    props.on ? 'kp-point-on' : '',
    props.child ? 'kp-point-child' : '',
    props.independent ? 'kp-point-root' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <View className={className} onClick={props.onPress}>
      <Check state={props.on ? 'checked' : 'unchecked'} />
      {props.independent ? (
        <View className={props.on ? 'kp-indot kp-indot-on' : 'kp-indot'}>
          <View className={props.on ? 'kp-indot-core kp-indot-core-on' : 'kp-indot-core'} />
        </View>
      ) : null}
      <View className="kp-point-copy">
        <Text className="kp-point-name">{props.name}</Text>
        {props.independent ? (
          <View className="kp-meta-row">
            <Text className="kp-badge kp-badge-free">独立知识点</Text>
            <Text className="kp-point-meta">{props.meta}</Text>
          </View>
        ) : (
          <Text className="kp-point-meta">{props.meta}</Text>
        )}
      </View>
    </View>
  );
}

function Check(props: { state: CheckState }) {
  if (props.state === 'unchecked') {
    return <View className="kp-check" />;
  }
  const dash = props.state === 'indeterminate';
  return (
    <View className="kp-check kp-check-on">
      <Text className={dash ? 'kp-check-dash' : 'kp-check-mark'}>{dash ? '–' : '✓'}</Text>
    </View>
  );
}
