import { Image, Input, Text, View } from '@tarojs/components';
import { useState } from 'react';

/** 证书 / 知识点搜索。聚焦时对齐 Bridge `search` 条：42 高、左右 13、无内描边。 */
export function PackSearch(props: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: string;
}) {
  const [focused, setFocused] = useState(false);
  const bare = !props.icon;
  const className = [
    'pack-search',
    bare ? 'pack-search-bare' : '',
    !bare && focused ? 'pack-search-focus' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <View className={className}>
      {props.icon ? (
        <Image className="pack-search-ico" src={props.icon} mode="aspectFit" />
      ) : (
        <Text className="pack-search-mark">⌕</Text>
      )}
      <Input
        className="pack-search-input"
        placeholder={props.placeholder}
        placeholderStyle="color:#9ca3af;font-size:14px;"
        value={props.value}
        onInput={(event) => props.onChange(event.detail.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}
