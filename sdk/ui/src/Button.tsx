import type { ButtonHTMLAttributes, MouseEventHandler } from 'react';
import { Link } from 'react-router';
import type { LinkProps } from 'react-router';

export type ButtonVariant = 'plain' | 'primary' | 'secondary' | 'text' | 'icon';
type Shared = {
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly onClick?: MouseEventHandler<HTMLElement>;
};
export type ButtonProps = Shared &
  (
    | ({ readonly to: string } & Omit<LinkProps, 'to' | 'onClick'>)
    | ({ readonly to?: undefined } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'>)
  );
function buttonClass(variant: ButtonVariant, link: boolean, extra?: string) {
  const base =
    variant === 'text'
      ? link
        ? 'text-link'
        : 'text-button'
      : variant === 'icon'
        ? 'icon-button'
        : variant === 'plain'
          ? 'button'
          : `button ${variant}`;
  return extra ? `${base} ${extra}` : base;
}
export function Button(props: ButtonProps) {
  if (props.to !== undefined) {
    const { to, variant = 'plain', disabled, onClick, className, ...rest } = props;
    return (
      <Link
        {...rest}
        to={to}
        className={buttonClass(variant, true, className)}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : rest.tabIndex}
        onClick={(event) => {
          if (disabled) {
            event.preventDefault();
            return;
          }
          onClick?.(event);
        }}
      >
        {props.children}
      </Link>
    );
  }
  const { variant = 'plain', disabled, onClick, className, type = 'button', ...rest } = props;
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={buttonClass(variant, false, className)}
    />
  );
}
