import type { ReactNode } from 'react';

export function Drawer(props: {
  open: boolean;
  title: string;
  scrim?: 'soft' | 'strong';
  onClose: () => void;
  children: ReactNode;
}) {
  if (!props.open) {
    return null;
  }
  return (
    <div
      className={props.scrim === 'strong' ? 'scrim strong' : 'scrim'}
      onMouseDown={props.onClose}
    >
      <div
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <h2>{props.title}</h2>
          <button type="button" className="link" onClick={props.onClose}>
            关闭
          </button>
        </div>
        {props.children}
      </div>
    </div>
  );
}

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  body: string;
  note?: string;
  confirmLabel: string;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) {
    return null;
  }
  return (
    <div className="modal-scrim" onMouseDown={props.onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2>{props.title}</h2>
        <p className="modal-body">{props.body}</p>
        {props.note ? <p className="note">{props.note}</p> : null}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={props.onCancel} disabled={props.pending}>
            取消
          </button>
          <button type="button" className="danger" onClick={props.onConfirm} disabled={props.pending}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
