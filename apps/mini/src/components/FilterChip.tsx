import { Text } from '@tarojs/components';

export function FilterChip(props: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  onLongPress?: () => void;
}) {
  const className = [
    'yg-chip',
    props.active ? 'yg-chip-on' : '',
    props.disabled ? 'yg-chip-off' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Text className={className} onClick={props.onClick} onLongPress={props.onLongPress}>
      {props.label}
    </Text>
  );
}
