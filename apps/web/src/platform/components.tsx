import { useState, useId } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { PlatformApiError } from './api';
import { usePlatformCopy } from './hooks';

export function PlatformHeading({
  title,
  description,
}: {
  title: string;
  description?: string | undefined;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
export function Field({
  label,
  name,
  type = 'text',
  value,
  help,
  required = true,
  readOnly = false,
}: {
  label: string;
  name: string;
  type?: string;
  value?: string;
  help?: string;
  required?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  return (
    <label className="platform-field">
      <span id={`${id}-label`}>{label}</span>
      <input
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        readOnly={readOnly}
        maxLength={type === 'password' ? 128 : type === 'email' ? 254 : 120}
        minLength={type === 'password' ? 15 : undefined}
        autoComplete={type === 'password' ? 'new-password' : type === 'email' ? 'email' : 'off'}
      />
      {help && <small id={`${id}-help`}>{help}</small>}
    </label>
  );
}
export function TaskForm({
  title,
  children,
  onSave,
  submit,
  reset = false,
}: {
  title?: string;
  children: ReactNode;
  onSave: (data: FormData) => Promise<void | false>;
  submit?: string;
  reset?: boolean;
}) {
  const t = usePlatformCopy();
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [success, setSuccess] = useState(false);
  const handle = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
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
      const key = error instanceof PlatformApiError ? error.code : 'unknown';
      setMessage(key in t ? t[key as keyof typeof t] : t.unknown);
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={(event) => void handle(event)} className="platform-form" aria-busy={pending}>
      {title && <h2>{title}</h2>}
      <fieldset disabled={pending}>{children}</fieldset>
      {message && (
        <p className={success ? 'form-success' : 'form-error'} role={success ? 'status' : 'alert'}>
          {message}
        </p>
      )}
      <div>
        <button className="button primary" type="submit" disabled={pending}>
          {pending ? t.saving : (submit ?? t.save)}
        </button>
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
  if (loading) return <p role="status">{t.loading}</p>;
  return error ? (
    <div className="form-error" role="alert">
      <p>{typeof error === 'string' && error in t ? t[error as keyof typeof t] : t.offline}</p>
      <button className="button secondary" onClick={onRetry}>
        {t.retry}
      </button>
    </div>
  ) : null;
}
