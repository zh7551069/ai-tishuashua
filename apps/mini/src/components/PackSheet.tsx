import { Button, Input, ScrollView, Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import type { PackView } from '@tishuashua/shared';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

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
  const [confirming, setConfirming] = useState(false);

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

  return (
    <View className="u-sheet-mask" onClick={props.onClose}>
      <View className="u-sheet" onClick={(event) => event.stopPropagation()}>
        <Text className="u-sheet-title">切换刷题包</Text>
        <ScrollView scrollY className="u-sheet-list">
          {props.items.map((item) => {
            const on = item.id === selected?.id;
            return (
              <View key={item.id} className="u-sheet-row" onClick={() => props.onSelect(item.id)}>
                <View className={on ? 'u-radio u-radio-on' : 'u-radio'} />
                <View className="u-card-copy">
                  <Text className="u-card-title" style={{ color: item.unavailable ? '#9ca3af' : '#111827' }}>
                    {item.name}
                  </Text>
                  <Text className="u-card-sub">
                    {item.certName} · {item.knowledgePointCount} 个知识点
                    {item.unavailable ? ' · 不可用' : ''}
                  </Text>
                </View>
                {item.unavailable ? <Text className="u-badge">不可用</Text> : null}
              </View>
            );
          })}
        </ScrollView>
        {selected?.unavailable ? (
          <Text className="u-meta">此包关联证书已下架，只能删除，不能重命名。</Text>
        ) : null}
        {draft !== null && selected && !selected.unavailable ? (
          <View>
            <Input
              className="u-search"
              style={{ marginTop: '12px' }}
              maxlength={40}
              value={draft}
              placeholder="刷题包名称"
              onInput={(event) => setDraft(event.detail.value)}
            />
            <Button className="u-btn" style={{ marginTop: '10px' }} disabled={props.busy} onClick={() => void rename()}>
              确认重命名
            </Button>
            <Button className="u-btn-ghost" style={{ marginTop: '8px' }} disabled={props.busy} onClick={() => setDraft(null)}>
              取消
            </Button>
          </View>
        ) : (
          <View>
            <Button className="u-btn" style={{ marginTop: '12px' }} disabled={props.busy} onClick={props.onCreate}>
              新建刷题包
            </Button>
            <Button
              className="u-btn-ghost"
              style={{ marginTop: '8px' }}
              disabled={props.busy || !selected || selected.unavailable}
              onClick={() => setDraft(selected?.name ?? '')}
            >
              重命名
            </Button>
            <Button
              className="u-btn-danger"
              style={{ marginTop: '8px' }}
              disabled={props.busy || !selected}
              onClick={() => setConfirming(true)}
            >
              删除
            </Button>
          </View>
        )}
      </View>
      {confirming && selected ? (
        <ConfirmDialog
          title="删除刷题包"
          body={`确定删除「${selected.name}」？删除后不可恢复。`}
          confirmText="删除"
          danger
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            void props.onDelete(selected.id).catch((error: unknown) => {
              void Taro.showToast({
                title: error instanceof Error ? error.message : '删除失败',
                icon: 'none',
              });
            });
          }}
        />
      ) : null}
    </View>
  );
}
