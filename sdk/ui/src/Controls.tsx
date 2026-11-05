import { useId } from 'react';
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';

type ControlDescription = { label: string; help?: ReactNode; error?: string };
export function Select({
  label,
  help,
  error,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & ControlDescription) {
  const generated = useId(),
    id = props.id ?? generated;
  const description =
    [props['aria-describedby'], help && `${id}-help`, error && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <label className="platform-field" htmlFor={id}>
      <span>{label}</span>
      <select
        {...props}
        id={id}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description}
      >
        {children}
      </select>
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <small id={`${id}-error`} role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
export function CheckField({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  const generated = useId(),
    id = props.id ?? generated;
  return (
    <label className="checkbox-label" htmlFor={id}>
      <input {...props} id={id} type="checkbox" />
      {label}
    </label>
  );
}
export function TextArea({
  label,
  help,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & ControlDescription) {
  const generated = useId(),
    id = props.id ?? generated;
  const description =
    [props['aria-describedby'], help && `${id}-help`, error && `${id}-error`]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <label className="platform-field" htmlFor={id}>
      <span>{label}</span>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description}
      />
      {help && <small id={`${id}-help`}>{help}</small>}
      {error && (
        <small id={`${id}-error`} role="alert">
          {error}
        </small>
      )}
    </label>
  );
}
