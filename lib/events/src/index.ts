// lib/events/src/index.ts
import type { EventId, ModuleId, OrganizationContext, OrganizationId } from '@orkobi/contracts';

export interface DomainEvent<Payload = unknown> {
  readonly id: EventId;
  readonly name: `${string}.${string}`;
  readonly version: number;
  readonly organizationId: OrganizationId;
  readonly source: ModuleId;
  /** Date ISO 8601 UTC fournie par le producteur. */
  readonly occurredAt: string;
  readonly payload: Payload;
  readonly correlationId?: string;
}

export interface EventPublisher {
  publish(context: OrganizationContext, event: DomainEvent): Promise<void>;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

export interface EventSubscription {
  unsubscribe(): Promise<void>;
}

export interface EventSubscriber {
  subscribe(
    context: OrganizationContext,
    name: DomainEvent['name'],
    handler: EventHandler,
  ): Promise<EventSubscription>;
}
