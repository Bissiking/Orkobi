import type { SVGProps } from 'react';
import { papicons } from './papicons.js';
export type AppIconName =
  'contacts' | 'invoices' | 'projects' | 'stocks' | 'members' | 'documents' | 'notes';
export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  readonly name: AppIconName;
  readonly size?: number;
  readonly label?: string;
}
const names = {
  contacts: 'user',
  invoices: 'card',
  projects: 'tasks',
  stocks: 'archive',
  members: 'heart',
  documents: 'folder',
  notes: 'paper',
} as const;
/** Icônes Papicons des applications. Décorative sans label, accessible avec label. */
export function AppIcon({ name, size = 24, label, ...props }: AppIconProps) {
  const icon = papicons[names[name]];
  return (
    <svg
      {...props}
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="currentColor"
      focusable="false"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {icon.paths.map((path, index) => (
        <path key={index} {...path} />
      ))}
    </svg>
  );
}
