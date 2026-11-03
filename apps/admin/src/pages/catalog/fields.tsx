import type { PublishStatus } from '@tishuashua/shared';

export function Field(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label>
      {props.label}
      <input
        value={props.value}
        required={props.required}
        onChange={(event) => props.onChange(event.target.value)}
      />
    </label>
  );
}

export function AreaField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      {props.label}
      <textarea value={props.value} onChange={(event) => props.onChange(event.target.value)} />
    </label>
  );
}

export function StatusField(props: {
  value: PublishStatus;
  onChange: (value: PublishStatus) => void;
}) {
  return (
    <label>
      状态
      <select
        value={props.value}
        onChange={(event) =>
          props.onChange(event.target.value === 'offline' ? 'offline' : 'online')
        }
      >
        <option value="online">上架</option>
        <option value="offline">下架</option>
      </select>
    </label>
  );
}
