import { Button, Input, Text, View } from '@tarojs/components';
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
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
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

type ErrorKind = '' | 'network' | 'missing' | 'unavailable';

export default function KnowledgePage() {
  const params = useRouter().params;
  const domainId = queryValue(params.domainId);
  const certId = queryValue(params.certId);
  const packId = queryValue(params.packId);
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

  return (
    <Screen
      back
      title="选择知识点"
      subtitle={subtitle}
      footer={
        showFoot ? (
          <View>
            {saveError ? <Text className="u-foot-error">{saveError}</Text> : null}
            <Text className="u-foot-copy">
              已选 {selected.length} 个知识点 · AI 将生成约 {aiQuestionCount(selected.length)} 题
            </Text>
            <Button
              className="u-btn"
              style={{ marginTop: '10px' }}
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
      <Steps current={3} />
      <View className="u-pad u-pad-kp">
        <View className="u-search">
          <Text className="u-search-mark">⌕</Text>
          <Input
            className="u-search-input"
            placeholder="搜索教材或知识点"
            placeholderStyle="color:#9ca3af"
            value={query}
            onInput={(event) => setQuery(event.detail.value)}
          />
        </View>
        {ready && visible.length > 0 ? (
          <View className="u-tip u-tip-gap">
            <Text className="u-tip-text">{selectionTip(tree?.nodes ?? [], selected, collapsed)}</Text>
          </View>
        ) : null}
        {ready ? (
          <View className="u-upload" onClick={() => openCourseware(extractJobId || undefined)}>
            <View className="u-upload-icon">↑</View>
            <View className="u-card-copy">
              <Text className="u-upload-title">
                {extractJobId ? '查看课件提炼' : '上传课件或书籍'}
              </Text>
              <Text className="u-upload-sub">AI 自动提炼知识点 · 支持 PPT / PDF</Text>
            </View>
            <Text className="u-chev">›</Text>
          </View>
        ) : null}
        {!ready && !error ? (
          <View className="u-between">
            <Text className="u-block-title">教材与知识点</Text>
          </View>
        ) : null}
        {ready && visible.length > 0 ? (
          <View className="u-between">
            <Text className="u-block-title">教材与知识点</Text>
            <Text className="u-link">已选 {selected.length}</Text>
          </View>
        ) : null}
        {!ready && !error ? <LoadingBlock skeleton="rows" /> : null}
        {error && !ready ? (
          <ErrorBlock
            title={errorTitle(errorKind)}
            detail={errorKind === 'network' ? '网络好像不太稳定，请检查后重试' : error}
            onRetry={() => void load()}
            retryLabel={errorKind === 'network' ? '重新加载' : '重试'}
            onBack={errorKind === 'network' ? undefined : () => void Taro.navigateBack()}
          />
        ) : null}
        {ready && visible.length === 0 ? (
          <EmptyBlock
            title={query ? '没有找到相关教材或知识点' : '暂无知识点'}
            detail={
              query ? '换个关键词，或上传课件让 AI 提炼' : '可以上传课件，提炼后再加入刷题包。'
            }
            action={query ? '清除搜索' : '上传课件'}
            tone={query ? 'soft' : 'solid'}
            onAction={() => (query ? setQuery('') : openCourseware())}
          />
        ) : null}
        {ready
          ? visible.map((node) => {
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
            })
          : null}
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
  return '勾选教材 = 全选其下知识点；半选表示部分已选。';
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
    <View>
      <View className="u-material">
        <Text className="u-fold" onClick={props.onToggleExpand}>
          {props.collapsed ? '▸' : '▾'}
        </Text>
        <View className={kind === 'courseware' ? 'u-book u-book-file' : 'u-book'}>
          {kind === 'courseware' ? 'P' : '书'}
        </View>
        <View className="u-card-copy" onClick={props.onToggleExpand}>
          <Text className="u-kp-name">{props.node.name}</Text>
          <View className="u-mat-meta">
            <Text className={kind === 'courseware' ? 'u-tag u-tag-orange' : 'u-tag'}>
              {kind === 'courseware' ? '课件' : '书籍'}
            </Text>
            <Text className="u-mat-count">{props.checkChildIds.length} 个知识点</Text>
          </View>
        </View>
        <View onClick={props.onToggleTextbook}>
          <Tick state={state} end />
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
  return (
    <View
      className={
        'u-point' + (props.on ? ' u-point-on' : '') + (props.child ? ' u-point-child' : '')
      }
      onClick={props.onPress}
    >
      <Tick state={props.on ? 'checked' : 'unchecked'} />
      <View className="u-card-copy">
        <View className="u-point-title-row">
          {props.independent ? (
            <View className={props.on ? 'u-kp-dot u-kp-dot-on' : 'u-kp-dot'} />
          ) : null}
          <Text className="u-kp-name">{props.name}</Text>
        </View>
        {props.independent ? (
          <View className="u-mat-meta">
            <Text className="u-tag u-tag-blue">独立知识点</Text>
          </View>
        ) : null}
        <Text className="u-kp-meta">{props.meta}</Text>
      </View>
    </View>
  );
}

function Tick(props: { state: CheckState; end?: boolean }) {
  const on = props.state !== 'unchecked';
  const place = props.end ? ' u-tickbox-end' : ' u-tickbox-lead';
  return (
    <View className={(on ? 'u-tickbox u-tickbox-on' : 'u-tickbox') + place}>
      {props.state === 'checked' ? <View className="u-tick" /> : null}
      {props.state === 'indeterminate' ? <View className="u-dash" /> : null}
    </View>
  );
}
