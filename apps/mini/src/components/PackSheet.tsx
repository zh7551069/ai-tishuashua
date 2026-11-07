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
  const [menuId, setMenuId] = useState<string | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<PackView | null>(null);
  const renaming = props.items.find((item) => item.id === renameId) ?? null;
  const hasUnavailable = props.items.some((item) => item.unavailable);

  const rename = async () => {
    if (!renaming || renaming.unavailable) {
      return;
    }
    const name = draft.trim();
    if (!name) {
      void Taro.showToast({ title: '请填写刷题包名称', icon: 'none' });
      return;
    }
    try {
      await props.onRename(renaming.id, name);
      setRenameId(null);
      void Taro.showToast({ title: '已重命名', icon: 'success' });
    } catch (error) {
      void Taro.showToast({
        title: error instanceof Error ? error.message : '重命名失败',
        icon: 'none',
      });
    }
  };

  const sheetClass = hasUnavailable
    ? 'u-sheet u-sheet-pack u-sheet-pack-gray'
    : 'u-sheet u-sheet-pack';

  return (
    <View
      className={hasUnavailable ? 'u-sheet-mask u-mask-strong' : 'u-sheet-mask u-mask-dim'}
      onClick={() => {
        if (pending) {
          return;
        }
        props.onClose();
      }}
    >
      <View className={sheetClass} onClick={(event) => event.stopPropagation()}>
        <View className="u-sheet-handle" />
        <Text className="u-sheet-title">切换刷题包</Text>
        <ScrollView scrollY className="u-sheet-cards">
          {props.items.map((item) => {
            const on = item.id === props.activeId;
            const rowClass = item.unavailable
              ? 'u-sheet-option u-sheet-option-off'
              : on
                ? 'u-sheet-option u-sheet-option-on'
                : 'u-sheet-option';
            return (
              <View
                key={item.id}
                className={rowClass}
                onClick={() => {
                  setMenuId(null);
                  if (item.unavailable || props.busy) {
                    return;
                  }
                  props.onSelect(item.id);
                }}
              >
                <View className="u-card-copy">
                  <Text
                    className={item.unavailable ? 'u-sheet-name u-sheet-name-dim' : 'u-sheet-name'}
                  >
                    {item.name}
                  </Text>
                  {item.unavailable ? (
                    <View className="u-sheet-subrow">
                      <Text className="u-flag">不可用</Text>
                      <Text className="u-sheet-note">证书已下架 · 不可修改</Text>
                    </View>
                  ) : (
                    <Text className="u-card-sub">
                      {item.knowledgePointCount} 个知识点 · {item.domainName}
                    </Text>
                  )}
                </View>
                {item.unavailable ? (
                  <Text
                    className="u-row-delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuId(null);
                      setPending(item);
                    }}
                  >
                    删除
                  </Text>
                ) : (
                  <View className={on ? 'sheet-dot sheet-dot-on' : 'sheet-dot'}>
                    {on ? <Text className="sheet-dot-mark">✓</Text> : null}
                  </View>
                )}
                {!item.unavailable && on ? (
                  <Text
                    className="u-more"
                    onClick={(event) => {
                      event.stopPropagation();
                      setMenuId(menuId === item.id ? null : item.id);
                    }}
                  >
                    ⋯
                  </Text>
                ) : null}
                {menuId === item.id ? (
                  <View className="u-menu" onClick={(event) => event.stopPropagation()}>
                    <Text
                      className="u-menu-item"
                      onClick={() => {
                        setMenuId(null);
                        setRenameId(item.id);
                        setDraft(item.name);
                      }}
                    >
                      重命名
                    </Text>
                    <Text
                      className="u-menu-item u-menu-danger"
                      onClick={() => {
                        setMenuId(null);
                        setPending(item);
                      }}
                    >
                      删除
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        {hasUnavailable ? (
          <Text className="u-sheet-hint">不可用项无法选中或编辑，仅可删除</Text>
        ) : null}
        {renaming && !renaming.unavailable ? (
          <View>
            <Input
              className="u-search"
              style={{ marginTop: '12px' }}
              maxlength={40}
              value={draft}
              placeholder="刷题包名称"
              onInput={(event) => setDraft(event.detail.value)}
            />
            <Button
              className="u-btn"
              style={{ marginTop: '10px' }}
              disabled={props.busy}
              onClick={() => void rename()}
            >
              确认重命名
            </Button>
            <Button
              className="u-btn-ghost"
              style={{ marginTop: '8px' }}
              disabled={props.busy}
              onClick={() => setRenameId(null)}
            >
              取消
            </Button>
          </View>
        ) : (
          <Button className="u-btn u-btn-sheet" disabled={props.busy} onClick={props.onCreate}>
            新建刷题包
          </Button>
        )}
        {hasUnavailable ? null : <Text className="u-sheet-foot">也可从首页重新选择领域</Text>}
      </View>
      {pending ? (
        <ConfirmDialog
          title={pending.unavailable ? '删除不可用刷题包？' : '删除刷题包？'}
          body={
            pending.unavailable
              ? '证书已下架，删除后无法恢复。\n不会影响其他可用刷题包。'
              : `确定删除「${pending.name}」？\n删除后不可恢复。`
          }
          confirmText="确认删除"
          solid
          align="start"
          mask="strong"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const pack = pending;
            setPending(null);
            void props.onDelete(pack.id).catch((error: unknown) => {
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
