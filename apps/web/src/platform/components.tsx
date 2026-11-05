import { useState, useEffect } from 'react';
import type { ReactNode, FormEvent, FormEventHandler, Ref } from 'react';
import { errorCode, errorMessage } from '../errors';
import { Button } from '@orkobi/sdk-ui';
import { Field as UiField } from '@orkobi/sdk-ui';
import type { FieldProps } from '@orkobi/sdk-ui';
import { Notice } from '@orkobi/sdk-ui';
import { usePlatformCopy } from './hooks';

/** Règles des formulaires plateforme ; le SDK UI reste indépendant du métier. */
export function Field(props: FieldProps) {
  return (
    <UiField
      maxLength={props.type === 'password' ? 128 : props.type === 'email' ? 254 : 120}
      minLength={props.type === 'password' ? 15 : undefined}
      autoComplete={
        props.type === 'password' ? 'new-password' : props.type === 'email' ? 'email' : 'off'
      }
      {...props}
    />
  );
}

export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description?: string | undefined;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function TaskForm({
  title,
  children,
  onSave,
  submit,
  reset = false,
  disabled = false,
  actions,
  formRef,
  onChange,
  submitVariant = 'primary',
  busy = false,
}: {
  title?: string;
  children: ReactNode;
  onSave: (data: FormData) => Promise<void | false>;
  submit?: string;
  reset?: boolean;
  disabled?: boolean;
  actions?: ReactNode;
  formRef?: Ref<HTMLFormElement>;
  onChange?: FormEventHandler<HTMLFormElement>;
  submitVariant?: 'primary' | 'secondary';
  busy?: boolean;
}) {
  const t = usePlatformCopy();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!message || !success) return;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [message, success]);
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || disabled || busy) return;
    const form = event.currentTarget,
      data = new FormData(form);
    setPending(true);
    setMessage('');
    try {
      if ((await onSave(data)) === false) return;
      setMessage(t.saved);
      setSuccess(true);
      if (reset) form.reset();
    } catch (error) {
      setSuccess(false);
      setMessage(errorMessage(errorCode(error), t, 'unknown'));
    } finally {
      setPending(false);
    }
  };
  return (
    <form
      ref={formRef}
      onChange={onChange}
      onSubmit={(event) => void handle(event)}
      className="platform-form"
      aria-busy={pending || busy}
    >
      {title && <h2>{title}</h2>}
      <fieldset disabled={pending || busy}>{children}</fieldset>
      {message && <Notice tone={success ? 'success' : 'error'}>{message}</Notice>}
      <div className="task-form-actions">
        <Button variant={submitVariant} type="submit" disabled={pending || disabled || busy}>
          {pending ? t.saving : (submit ?? t.save)}
        </Button>
        {actions}
      </div>
    </form>
  );
}
export function ResourceNotice({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error: boolean | string;
  onRetry: () => void;
}) {
  const t = usePlatformCopy();
  if (loading) return <Skeleton status={t.loading} />;
  return error ? (
    <Notice tone="error">
      <p>{typeof error === 'string' ? errorMessage(error, t, 'offline') : t.offline}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t.retry}
      </Button>
    </Notice>
  ) : null;
}
/** Squelette de chargement ; le texte reste annoncé aux lecteurs d’écran. */
export function Skeleton({ status, lines = 3 }: { status: string; lines?: number }) {
  return (
    <div className="skeleton" role="status" aria-busy="true">
      <span className="sr-only">{status}</span>
      {Array.from({ length: lines }, (_, index) => (
        <span className="skeleton-line" key={index} aria-hidden="true" />
      ))}
    </div>
  );
}
