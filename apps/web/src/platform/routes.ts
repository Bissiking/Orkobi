import { matchPath } from 'react-router';
import type { BusinessDefinition, PlatformSession } from '@orkobi/contracts';
import type { Locale, Messages } from '../i18n';
import type { platformCopy } from './copy';

type PlatformMessages = (typeof platformCopy)[Locale];
type Breadcrumb = { to: string; label: string };
const routes = [
  { path: '/', source: 'shell', key: 'overview' },
  { path: '/organizations', source: 'shell', key: 'organizations' },
  { path: '/modules', source: 'shell', key: 'modules' },
  { path: '/jobs', source: 'shell', key: 'jobs' },
  { path: '/settings', source: 'shell', key: 'settings' },
  { path: '/system', source: 'shell', key: 'system' },
  { path: '/admin', source: 'platform', key: 'administration' },
  { path: '/profile', source: 'platform', key: 'profile' },
  { path: '/setup', source: 'platform', key: 'setup' },
  { path: '/login', source: 'platform', key: 'signIn' },
  { path: '/oidc/callback', source: 'platform', key: 'signIn' },
  { path: '/modules/demo', source: 'platform', key: 'demoTitle' },
] as const satisfies readonly ({ path: string } & (
  { source: 'shell'; key: keyof Messages } | { source: 'platform'; key: keyof PlatformMessages }
))[];

export function routeBreadcrumbs(
  pathname: string,
  locale: Locale,
  t: Messages,
  p: PlatformMessages,
  definitions: readonly BusinessDefinition[],
  session: PlatformSession,
): Breadcrumb[] {
  const root = { to: '/', label: t.workspace };
  const business = matchPath('/business/:module/:entity?/:id?', pathname);
  if (business) {
    const definition = definitions.find((d) => d.key === business.params.module);
    const entity = definition?.entities.find(
      (e) => e.key === (business.params.entity ?? definition.entities[0]?.key),
    );
    const items = [root, { to: '/modules', label: t.modules }];
    if (definition)
      items.push({ to: `/business/${definition.key}`, label: definition.label[locale] });
    if (
      definition &&
      entity &&
      (definition.entities.length > 1 || entity.label[locale] !== definition.label[locale])
    )
      items.push({ to: `/business/${definition.key}/${entity.key}`, label: entity.label[locale] });
    if (business.params.id)
      items.push({ to: pathname, label: business.params.id === 'new' ? p.newRecord : p.record });
    return items;
  }
  const org = matchPath('/organizations/:id', pathname);
  if (org)
    return [
      root,
      { to: '/organizations', label: t.organizations },
      {
        to: pathname,
        label: session.organizations.find((o) => o.id === org.params.id)?.name ?? p.organizations,
      },
    ];
  const route = routes.find((item) => item.path === pathname);
  if (route) {
    const current = { to: pathname, label: route.source === 'shell' ? t[route.key] : p[route.key] };
    return pathname === '/'
      ? [current]
      : pathname === '/modules/demo'
        ? [root, { to: '/modules', label: t.modules }, current]
        : [root, current];
  }
  if (pathname.startsWith('/plugins/'))
    return [root, { to: '/modules', label: t.modules }, { to: pathname, label: p.extension }];
  return [root, { to: pathname, label: t.notFoundTitle }];
}

export const isModulesRoute = (pathname: string) =>
  ['/modules', '/business', '/plugins'].some(
    (base) => pathname === base || pathname.startsWith(`${base}/`),
  );
