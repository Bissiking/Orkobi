import { useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';

export interface FieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'defaultValue' | 'value'
> {
  readonly label: string;
  readonly name: string;
  /** Valeur initiale d'un champ non contrôlé. */
  readonly value?: string;
  readonly help?: ReactNode;
  readonly error?: string;
}
/** Aucune règle métier implicite : longueur et autocomplete appartiennent au formulaire. */
export function Field({
  label,
  name,
  type = 'text',
  value,
  help,
  error,
  required = true,
  readOnly = false,
  ...input
}: FieldProps) {
  const generated = useId(),
    id = input.id ?? generated;
  const description =
    [input['aria-describedby'], help ? `${id}-help` : null, error ? `${id}-error` : null]
      .filter(Boolean)
      .join(' ') || undefined;
  return (
    <label className="platform-field" htmlFor={id}>
      <span>{label}</span>
      <input
        {...input}
        id={id}
        name={name}
        type={type}
        defaultValue={value}
        required={required}
        readOnly={readOnly}
        aria-describedby={description}
        aria-invalid={error ? true : input['aria-invalid']}
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
