import { useState } from 'react';
import type { ReactNode, FormEvent } from 'react';
import { errorCode, errorMessage } from '../errors';
import { Button } from '../ui/Button';
import { Notice } from '../ui/Notice';
import { usePlatformCopy } from './hooks';

export { Field } from '../ui/Field';

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
      setMessage(errorMessage(errorCode(error), t, 'unknown'));
    } finally {
      setPending(false);
    }
  };
  return (
    <form onSubmit={(event) => void handle(event)} className="platform-form" aria-busy={pending}>
      {title && <h2>{title}</h2>}
      <fieldset disabled={pending}>{children}</fieldset>
      {message && <Notice tone={success ? 'success' : 'error'}>{message}</Notice>}
      <div>
        <Button variant="primary" type="submit" disabled={pending}>
          {pending ? t.saving : (submit ?? t.save)}
        </Button>
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
    <Notice tone="error">
      <p>{typeof error === 'string' ? errorMessage(error, t, 'offline') : t.offline}</p>
      <Button variant="secondary" onClick={onRetry}>
        {t.retry}
      </Button>
    </Notice>
  ) : null;
}
