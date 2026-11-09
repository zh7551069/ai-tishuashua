import { Image, Input, Text, View } from '@tarojs/components';

/** 证书 / 知识点搜索。对齐 Bridge 页内 searchfield 与骨架 2:40：#f3f4f6、圆角 12、高 42。 */
export function PackSearch(props: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: string;
}) {
  const bare = !props.icon;
  const className = ['pack-search', bare ? 'pack-search-bare' : ''].filter(Boolean).join(' ');
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
      />
    </View>
  );
}
