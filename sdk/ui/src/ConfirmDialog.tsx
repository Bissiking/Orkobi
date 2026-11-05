import { useEffect, useId, useRef } from 'react';
import { Button } from './Button.js';
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}
/** Libellés et callbacks appartiennent à l’hôte ; Échap et le voile annulent. */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null),
    titleId = useId(),
    messageId = useId();
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    else if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {open && (
        <>
          <h2 id={titleId}>{title}</h2>
          <p id={messageId}>{message}</p>
          <div className="confirm-dialog-actions">
            <Button variant="text" onClick={onCancel} autoFocus>
              {cancelLabel}
            </Button>
            <Button variant={danger ? 'secondary' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
