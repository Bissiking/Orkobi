import { useId } from 'react';

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
