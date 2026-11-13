import { Image, Input, Text, View } from '@tarojs/components';

/** 证书 / 知识点搜索。本流用 flow-search 画成胶囊；其它调用方不传 className 时保持原样。 */
export function PackSearch(props: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: string;
  className?: string;
}) {
  const bare = !props.icon;
  const className = ['pack-search', props.className, bare ? 'pack-search-bare' : '']
    .filter(Boolean)
    .join(' ');
  const inputClass = ['pack-search-input', props.value ? 'pack-search-input-on' : '']
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
        className={inputClass}
        placeholder={props.placeholder}
        placeholderStyle="color:rgba(87,83,78,0.2);font-size:14px;"
        value={props.value}
        onInput={(event) => props.onChange(event.detail.value)}
      />
    </View>
  );
}
