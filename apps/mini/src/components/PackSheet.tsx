import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PackView } from '@tishuashua/shared';
import { useState } from 'react';

export function PackSheet(props: {
  items: PackView[];
  activeId: string | null;
  busy: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onRename: (id: string, name: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const selected = props.items.find((item) => item.id === props.activeId) ?? props.items[0];
  const [draft, setDraft] = useState<string | null>(null);

  const rename = async () => {
    if (!selected || selected.unavailable) {
      return;
    }
    const name = (draft ?? '').trim();
    if (!name) {
      void Taro.showToast({ title: '请填写刷题包名称', icon: 'none' });
      return;
    }
    try {
      await props.onRename(selected.id, name);
      setDraft(null);
      void Taro.showToast({ title: '已重命名', icon: 'success' });
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '重命名失败',
        icon: 'none',
      });
    }
  };

  const remove = async () => {
    if (!selected) {
      return;
    }
    const result = await Taro.showModal({
      title: '删除刷题包',
      content: `确定删除「${selected.name}」？删除后不可恢复。`,
      confirmText: '删除',
      confirmColor: '#b42318',
    });
    if (!result.confirm) {
      return;
    }
    try {
      await props.onDelete(selected.id);
      setDraft(null);
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '删除失败',
        icon: 'none',
      });
    }
  };

  return (
    <View className="sheet-mask" onClick={props.onClose}>
      <View className="sheet" onClick={(event) => event.stopPropagation()}>
        <Text className="section-title">切换刷题包</Text>
        <ScrollView scrollY className="sheet-list">
          {props.items.map((item) => {
            const on = item.id === selected?.id;
            return (
              <View key={item.id} className="sheet-row" onClick={() => props.onSelect(item.id)}>
                <View className={on ? 'radio radio-on' : 'radio'} />
                <View className="sheet-copy">
                  <Text className="tree-name">{item.name}</Text>
                  <Text className="meta">
                    {item.certName} · {item.knowledgePointCount} 个知识点
                    {item.unavailable ? ' · 不可用' : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
        {selected?.unavailable ? (
          <Text className="meta">此包关联证书已下架，只能删除，不能重命名。</Text>
        ) : null}
        {draft !== null && selected && !selected.unavailable ? (
          <View>
            <Input
              className="field"
              maxlength={40}
              value={draft}
              placeholder="刷题包名称"
              onInput={(event) => setDraft(event.detail.value)}
            />
            <Button className="primary" disabled={props.busy} onClick={() => void rename()}>
              确认重命名
            </Button>
            <Button className="ghost" disabled={props.busy} onClick={() => setDraft(null)}>
              取消
            </Button>
          </View>
        ) : (
          <View>
            <Button className="primary" disabled={props.busy} onClick={props.onCreate}>
              新建刷题包
            </Button>
            <Button
              className="ghost"
              disabled={props.busy || !selected || selected.unavailable}
              onClick={() => setDraft(selected?.name ?? '')}
            >
              重命名
            </Button>
            <Button
              className="danger"
              disabled={props.busy || !selected}
              onClick={() => void remove()}
            >
              删除
            </Button>
          </View>
        )}
      </View>
    </View>
  );
}
