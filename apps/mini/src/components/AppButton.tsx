import { Button } from '@tarojs/components';

/** 主按钮高 50、全圆。次按钮走描边。 */
export function AppButton(props: {
  label: string;
  disabled?: boolean;
  tone?: 'primary' | 'ghost' | 'danger';
  onClick?: () => void;
}) {
  const tone = props.tone ?? 'primary';
  const className = [
    'yg-btn',
    tone === 'ghost' ? 'u-btn-ghost' : tone === 'danger' ? 'u-btn-solid-danger' : 'u-btn',
    props.disabled ? 'u-btn-off' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Button className={className} onClick={props.onClick}>
      {props.label}
    </Button>
  );
}
