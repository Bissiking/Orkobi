import { useId } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button.js';

export type StatusPillTone = 'positive' | 'pending' | 'muted';

/** Étiquette d’état non interactive ; la couleur ne suffit pas, le texte reste présent. */
export function StatusPill({
  tone = 'muted',
  children,
}: {
  tone?: StatusPillTone;
  children: ReactNode;
}) {
  return <span className={`status-pill status-pill-${tone}`}>{children}</span>;
}

/** État vide rédigé : titre, description et action de récupération. */
export function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={className ? `empty-state ${className}` : 'empty-state'}>
      {icon}
      <h2>{title}</h2>
      <p>{description}</p>
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  );
}

/** Champ de recherche bordé, avec icône, libellé accessible et effacement contextuel. */
export function SearchField({
  label,
  value,
  placeholder,
  onChange,
  onClear,
  clearLabel,
  className,
  maxLength = 120,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className={className ? `search-field-host ${className}` : 'search-field-host'}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <circle cx="10.5" cy="10.5" r="7.5" />
        <path d="m16 16 5 5" />
      </svg>
      <input
        id={id}
        type="search"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && onClear && (
        <Button variant="icon" aria-label={clearLabel ?? label} onClick={onClear}>
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </Button>
      )}
    </div>
  );
}

/**
 * Navigation de sections : l’hôte inscrit la sélection dans l’URL.
 * Le bouton courant est marqué `aria-current="page"` plutôt qu’un rôle `tab` artificiel.
 */
export function Tabs<T extends string>({
  label,
  items,
  value,
  onChange,
  className,
}: {
  label: string;
  items: readonly { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <nav className={className ? `platform-tabs ${className}` : 'platform-tabs'} aria-label={label}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={item.key === value ? 'active' : ''}
          aria-current={item.key === value ? 'page' : undefined}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

/** Zone de table nommée et scrollable : le raccourci clavier et l’étiquette viennent d’ici. */
export function DataTable({
  label,
  className,
  tableClassName,
  children,
}: {
  label: string;
  className?: string;
  tableClassName?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={className ? `table-scroll ${className}` : 'table-scroll'}
      role="region"
      aria-label={label}
      tabIndex={0}
    >
      <table className={tableClassName}>{children}</table>
    </div>
  );
}

/** En-tête de colonne : `scope="col"` posé par défaut, jamais oublié. */
export function Th({ children }: { children: ReactNode }) {
  return <th scope="col">{children}</th>;
}
