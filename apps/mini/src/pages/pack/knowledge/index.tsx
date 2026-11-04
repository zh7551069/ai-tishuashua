import { Button, Input, Text, View } from '@tarojs/components';
import Taro, { useDidShow, useRouter } from '@tarojs/taro';
import {
  collectKnowledgePointIds,
  filterCatalogTree,
  textbookCheckState,
  toggleKnowledgePoint,
  toggleTextbook,
  type CatalogTreeNode,
  type CheckState,
  type KnowledgeTree,
} from '@tishuashua/shared';
import { useState } from 'react';
import { Screen } from '../../../components/Screen';
import { Steps } from '../../../components/Steps';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../../../components/StateBlock';
import { fetchKnowledgeTree } from '../../../services/catalog-api';
import { readCoursewareJob } from '../../../services/courseware-api';
import { withAuth } from '../../../services/guard';
import { createPack, fetchPack, updatePack } from '../../../services/pack-api';
import { queryValue } from '../../../services/query';

export default function KnowledgePage() {
  const params = useRouter().params;
  const domainId = queryValue(params.domainId);
  const certId = queryValue(params.certId);
  const packId = queryValue(params.packId);
  const [tree, setTree] = useState<KnowledgeTree | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extractJobId, setExtractJobId] = useState('');

  const load = async () => {
    if (!domainId || !certId) {
      setError('缺少领域或证书');
      setReady(false);
      return;
    }
    setError('');
    try {
      const data = await withAuth(async (token) => {
        const nextTree = await fetchKnowledgeTree(token, certId);
        const pack = packId ? await fetchPack(token, packId) : null;
        return { nextTree, pack };
      });
      if (!data) {
        return;
      }
      if (data.pack?.unavailable) {
        setError('关联证书已下架，此包只能删除');
        setReady(false);
        return;
      }
      const allowed = new Set(collectKnowledgePointIds(data.nextTree.nodes));
      setTree(data.nextTree);
      setSelected((data.pack?.knowledgePointIds ?? []).filter((id) => allowed.has(id)));
      setReady(true);
    } catch (caught) {
      setReady(false);
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
    setError('');
    try {
      const saved = await withAuth((token) =>
        packId
          ? updatePack(token, packId, { knowledgePointIds: selected })
          : createPack(token, { domainId, certId, knowledgePointIds: selected }),
      );
      if (!saved) {
        return;
      }
      await Taro.reLaunch({ url: '/pages/home/index?saved=1' });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const visible = tree ? filterCatalogTree(tree.nodes, query) : [];
  const originals = new Map(
    (tree?.nodes ?? []).filter((node) => node.kind === 'textbook').map((node) => [node.id, node]),
  );
  const subtitle = tree ? `${tree.domainName} · ${tree.certificateName}` : undefined;

  return (
    <Screen
      back
      title="选择知识点"
      subtitle={subtitle}
      footer={
        ready && !error ? (
          <View>
            <Text className="u-note">已选 {selected.length} 个知识点</Text>
            <Button
              className="u-btn"
              style={{ marginTop: '15px' }}
              disabled={saving || selected.length === 0}
              loading={saving}
              onClick={() => void save()}
            >
              保存到刷题包
            </Button>
          </View>
        ) : null
      }
    >
      <Steps current={3} />
      <View className="u-pad">
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
        <View className="u-tip" style={{ marginTop: '15px' }}>
          勾选教材 = 全选其下知识点；半选表示部分已选。
        </View>
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
        <View className="u-between">
          <Text className="u-label">教材与知识点</Text>
          <Text className="u-link">已选 {selected.length}</Text>
        </View>
        {!ready && !error ? <LoadingBlock skeleton /> : null}
        {error && !ready ? (
          <ErrorBlock detail={error} onRetry={() => void load()} onBack={() => void Taro.navigateBack()} />
        ) : null}
        {error && ready ? <Text className="u-state-sub">{error}</Text> : null}
        {ready && visible.length === 0 ? (
          <EmptyBlock
            title={query ? '没有匹配的知识点' : '暂无知识点'}
            detail={query ? '换个关键词，或上传课件提炼。' : '可以上传课件，提炼后再加入刷题包。'}
            action={query ? '清空搜索' : '上传课件'}
            onAction={() => (query ? setQuery('') : openCourseware())}
          />
        ) : null}
        {visible.map((node) => {
          const original = originals.get(node.id);
          const checkChildIds =
            original && original.kind === 'textbook' ? original.children.map((child) => child.id) : [];
          return (
            <TreeBlock
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
    </Screen>
  );
}

function TreeBlock(props: {
  node: CatalogTreeNode;
  checkChildIds: string[];
  selected: string[];
  collapsed: boolean;
  onToggleExpand: () => void;
  onToggleTextbook: () => void;
  onTogglePoint: (id: string) => void;
}) {
  if (props.node.kind === 'knowledge_point') {
    const on = props.selected.includes(props.node.id);
    return (
      <View className={on ? 'u-tree u-tree-on' : 'u-tree'} onClick={() => props.onTogglePoint(props.node.id)}>
        <CheckBox state={on ? 'checked' : 'unchecked'} />
        <View className="u-card-copy">
          <Text className="u-card-title">{props.node.name}</Text>
          <Text className="u-tag u-tag-blue">知识点</Text>
        </View>
      </View>
    );
  }

  const state = textbookCheckState(props.checkChildIds, props.selected);
  return (
    <View>
      <View className="u-tree">
        <Text className="u-fold" onClick={props.onToggleExpand}>
          {props.collapsed ? '▸' : '▾'}
        </Text>
        <View className="u-book">书</View>
        <View className="u-card-copy" onClick={props.onToggleExpand}>
          <Text className="u-card-title">{props.node.name}</Text>
          <View className="u-chips">
            <Text className="u-tag">教材</Text>
            <Text className="u-card-sub">{props.node.children.length} 个知识点</Text>
          </View>
        </View>
        <View onClick={props.onToggleTextbook}>
          <CheckBox state={state} />
        </View>
      </View>
      {props.collapsed
        ? null
        : props.node.children.map((child) => {
            const on = props.selected.includes(child.id);
            return (
              <View
                key={child.id}
                className={on ? 'u-tree u-tree-child u-tree-on' : 'u-tree u-tree-child'}
                onClick={() => props.onTogglePoint(child.id)}
              >
                <CheckBox state={on ? 'checked' : 'unchecked'} />
                <Text className="u-card-title">{child.name}</Text>
              </View>
            );
          })}
    </View>
  );
}

function CheckBox(props: { state: CheckState }) {
  const mark = props.state === 'checked' ? '✓' : props.state === 'indeterminate' ? '–' : '';
  return (
    <View className={props.state === 'unchecked' ? 'u-check' : 'u-check u-check-on'}>
      <Text className="u-check-mark">{mark}</Text>
    </View>
  );
}
