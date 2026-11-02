import type { MouseEventHandler, ReactNode } from 'react';
import { Link } from 'react-router';

export type ButtonVariant = 'plain' | 'primary' | 'secondary' | 'text' | 'icon';

export interface ButtonProps {
  readonly variant?: ButtonVariant;
  readonly to?: string;
  readonly type?: 'button' | 'submit' | 'reset';
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLElement>;
  readonly className?: string;
  readonly title?: string;
  readonly children?: ReactNode;
  readonly 'aria-label'?: string;
  readonly 'aria-expanded'?: boolean;
  readonly 'aria-pressed'?: boolean;
  readonly 'aria-describedby'?: string;
}

function buttonClass(variant: ButtonVariant, to: string | undefined, extra?: string): string {
  const base =
    variant === 'text'
      ? to === undefined
        ? 'text-button'
        : 'text-link'
      : variant === 'icon'
        ? 'icon-button'
        : variant === 'plain'
          ? 'button'
          : `button ${variant}`;
  return extra === undefined || extra.length === 0 ? base : `${base} ${extra}`;
}

export function Button({
  variant = 'plain',
  to,
  type,
  disabled,
  onClick,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = buttonClass(variant, to, className);
  if (to !== undefined) {
    return (
      <Link to={to} className={classes} onClick={onClick} {...rest}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} disabled={disabled} className={classes} onClick={onClick} {...rest}>
      {children}
    </button>
  );
}
