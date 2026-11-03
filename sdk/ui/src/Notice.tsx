import type { ReactNode } from 'react';

export type NoticeTone = 'error' | 'success' | 'info';

export interface NoticeProps {
  readonly tone?: NoticeTone;
  readonly className?: string;
  readonly children: ReactNode;
}

export function Notice({ tone = 'info', className, children }: NoticeProps) {
  const classes = [
    tone === 'error' ? 'form-error' : tone === 'success' ? 'form-success' : '',
    className ?? '',
  ]
    .filter((value) => value.length > 0)
    .join(' ');
  return (
    <div className={classes} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
