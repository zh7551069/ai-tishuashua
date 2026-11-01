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
import { MiniPage } from '../../../components/MiniPage';
import { fetchKnowledgeTree } from '../../../services/catalog-api';
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
    void load();
  });

  const save = async () => {
    if (!tree || selected.length === 0) {
      setError('请至少选择一个知识点');
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

  return (
    <MiniPage
      title={tree?.certificateName || '选择知识点'}
      hint="勾选教材 = 全选其下知识点；半选表示部分已选。"
    >
      <Input
        className="field"
        placeholder="搜索教材或知识点"
        value={query}
        onInput={(event) => setQuery(event.detail.value)}
      />
      <Button
        className="ghost"
        onClick={() => {
          void Taro.showToast({ title: '即将开放', icon: 'none' });
        }}
      >
        上传课件或书籍 · 即将开放
      </Button>
      {error ? <Text className="error">{error}</Text> : null}
      {!ready && !error ? <Text className="hint">正在加载知识点。</Text> : null}
      {ready && visible.length === 0 ? (
        <Text className="hint">没有匹配的教材或知识点。</Text>
      ) : null}
      {visible.map((node) => {
        const original = originals.get(node.id);
        const checkChildIds =
          original && original.kind === 'textbook'
            ? original.children.map((child) => child.id)
            : [];
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
      <Text className="meta">已选 {selected.length} 个知识点</Text>
      <Button
        className="primary"
        disabled={saving || selected.length === 0}
        loading={saving}
        onClick={() => void save()}
      >
        保存到刷题包
      </Button>
    </MiniPage>
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
      <View className="tree-row" onClick={() => props.onTogglePoint(props.node.id)}>
        <CheckBox state={on ? 'checked' : 'unchecked'} />
        <Text className="tree-name">{props.node.name}</Text>
      </View>
    );
  }

  return (
    <View>
      <View className="tree-row">
        <View onClick={props.onToggleTextbook}>
          <CheckBox state={textbookCheckState(props.checkChildIds, props.selected)} />
        </View>
        <Text className="expander" onClick={props.onToggleExpand}>
          {props.collapsed ? '▸' : '▾'}
        </Text>
        <Text className="tree-name" onClick={props.onToggleExpand}>
          {props.node.name}
        </Text>
      </View>
      {props.collapsed
        ? null
        : props.node.children.map((child) => {
            const on = props.selected.includes(child.id);
            return (
              <View
                key={child.id}
                className="tree-row kp-row"
                onClick={() => props.onTogglePoint(child.id)}
              >
                <CheckBox state={on ? 'checked' : 'unchecked'} />
                <Text className="tree-name">{child.name}</Text>
              </View>
            );
          })}
    </View>
  );
}

function CheckBox(props: { state: CheckState }) {
  const mark = props.state === 'checked' ? '✓' : props.state === 'indeterminate' ? '–' : '';
  return (
    <View className={props.state === 'unchecked' ? 'box box-off' : 'box box-on'}>
      <Text className="box-mark">{mark}</Text>
    </View>
  );
}
