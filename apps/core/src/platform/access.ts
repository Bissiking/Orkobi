import { createHash, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { PlatformTransaction, StoredSession } from '@orkobi/database';
import type { PlatformSession, PlatformUser } from '@orkobi/contracts';
import type { PlatformRequest } from './service.js';

export const tokenHash = (value: string) => createHash('sha256').update(value).digest('hex');
export function equal(left: string, right: string) {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max = 120): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    /[\p{Cc}]/u.test(value)
  )
    throw new BadRequestException();
  return value.trim();
}
export function password(value: unknown): string {
  if (typeof value !== 'string' || value.length < 15 || value.length > 128)
    throw new BadRequestException();
  return value;
}
export async function authenticateSession(
  repo: PlatformTransaction,
  request: PlatformRequest,
  write: boolean,
) {
  if (!/^[a-f0-9]{64}$/u.test(request.token)) throw new UnauthorizedException();
  const session = await repo.session(tokenHash(request.token));
  if (!session) throw new UnauthorizedException();
  const user = await repo.user(session.userId);
  if (!user?.active) throw new UnauthorizedException();
  if (write && !equal(request.csrf, session.csrfToken)) throw new ForbiddenException();
  await repo.touchSession(tokenHash(request.token));
  return { user, session };
}
export async function sessionSnapshot(
  repo: PlatformTransaction,
  user: PlatformUser,
  session: StoredSession,
): Promise<PlatformSession> {
  const organizations = await repo.accessibleOrganizations(user.id);
  return {
    user,
    csrfToken: session.csrfToken,
    organizations,
    activeOrganizationId: organizations.some((org) => org.id === session.activeOrganizationId)
      ? session.activeOrganizationId
      : null,
  };
}
