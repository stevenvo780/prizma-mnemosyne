/**
 * OutboxService — provides in-memory event persistence with retry logic
 * for failed CRM synchronizations to Soft-IA.
 *
 * In production, this should be backed by a persistent data store (DB/Redis).
 * This implementation uses a Map with automatic retry on initialization.
 */

import { EventEmitter } from 'events';

export enum OutboxEventStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  DEAD_LETTER = 'DEAD_LETTER'
}

export interface OutboxEvent {
  id: string;
  type: 'lead_sync' | 'purchase_sync' | 'delivery_update' | 'feedback_record' | 'support_ticket';
  payload: any;
  status: OutboxEventStatus;
  attempts: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  nextRetryAt?: Date | undefined;
  error?: string | undefined;
  lastErrorDetails?: string | undefined;
}

interface RetryConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  maxRetries: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  initialDelayMs: 1000,        // 1 second
  maxDelayMs: 60000,            // 1 minute
  backoffMultiplier: 2,
  maxRetries: 3
};

export class OutboxService extends EventEmitter {
  private store: Map<string, OutboxEvent> = new Map();
  private retryConfig: RetryConfig;
  private retrySchedules: Map<string, NodeJS.Timeout> = new Map();

  constructor(retryConfig: Partial<RetryConfig> = {}) {
    super();
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Persists an outbox event for later processing
   */
  async addEvent(
    type: OutboxEvent['type'],
    payload: any,
    idempotencyKey?: string | undefined
  ): Promise<OutboxEvent> {
    const id = idempotencyKey || `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Check if event with this idempotency key already exists
    const existing = this.store.get(id);
    if (existing) {
      return existing;
    }

    const event: OutboxEvent = {
      id,
      type,
      payload,
      status: OutboxEventStatus.PENDING,
      attempts: 0,
      maxRetries: this.retryConfig.maxRetries,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.store.set(id, event);
    this.emit('event_added', event);

    return event;
  }

  /**
   * Gets an event by ID
   */
  async getEvent(id: string): Promise<OutboxEvent | null> {
    return this.store.get(id) || null;
  }

  /**
   * Marks an event as in progress
   */
  async markInProgress(id: string): Promise<OutboxEvent | null> {
    const event = this.store.get(id);
    if (!event) return null;

    event.status = OutboxEventStatus.IN_PROGRESS;
    event.updatedAt = new Date();
    this.store.set(id, event);
    return event;
  }

  /**
   * Marks an event as completed
   */
  async markCompleted(id: string): Promise<OutboxEvent | null> {
    const event = this.store.get(id);
    if (!event) return null;

    event.status = OutboxEventStatus.COMPLETED;
    event.updatedAt = new Date();

    // Clear any scheduled retries
    this.cancelRetry(id);

    this.store.set(id, event);
    this.emit('event_completed', event);
    return event;
  }

  /**
   * Marks an event as failed and schedules retry
   */
  async markFailed(id: string, error: Error | string, details?: string): Promise<OutboxEvent | null> {
    const event = this.store.get(id);
    if (!event) return null;

    event.attempts += 1;
    event.error = typeof error === 'string' ? error : error.message;
    event.lastErrorDetails = details;
    event.updatedAt = new Date();

    if (event.attempts >= event.maxRetries) {
      event.status = OutboxEventStatus.DEAD_LETTER;
      this.emit('event_dead_letter', event);
      console.error(`[outbox] Event ${id} moved to dead letter after ${event.attempts} attempts`);
    } else {
      event.status = OutboxEventStatus.PENDING;

      // Calculate next retry delay with exponential backoff
      const delayMs = Math.min(
        this.retryConfig.initialDelayMs * Math.pow(this.retryConfig.backoffMultiplier, event.attempts - 1),
        this.retryConfig.maxDelayMs
      );

      event.nextRetryAt = new Date(Date.now() + delayMs);
      this.scheduleRetry(id, delayMs);

      console.warn(`[outbox] Event ${id} failed (attempt ${event.attempts}/${event.maxRetries}), next retry in ${delayMs}ms: ${event.error}`);
    }

    this.store.set(id, event);
    this.emit('event_failed', event);
    return event;
  }

  /**
   * Gets all pending events (ready for retry)
   */
  async getPendingEvents(): Promise<OutboxEvent[]> {
    const now = new Date();
    const pending: OutboxEvent[] = [];

    for (const event of this.store.values()) {
      if (
        event.status === OutboxEventStatus.PENDING &&
        (!event.nextRetryAt || event.nextRetryAt <= now)
      ) {
        pending.push(event);
      }
    }

    return pending;
  }

  /**
   * Gets events in dead letter queue
   */
  async getDeadLetterEvents(): Promise<OutboxEvent[]> {
    const deadLetter: OutboxEvent[] = [];

    for (const event of this.store.values()) {
      if (event.status === OutboxEventStatus.DEAD_LETTER) {
        deadLetter.push(event);
      }
    }

    return deadLetter;
  }

  /**
   * Gets statistics about outbox state
   */
  getStats() {
    const stats = {
      total: this.store.size,
      pending: 0,
      inProgress: 0,
      completed: 0,
      failed: 0,
      deadLetter: 0
    };

    for (const event of this.store.values()) {
      stats[event.status.toLowerCase() as keyof typeof stats]++;
    }

    return stats;
  }

  /**
   * Schedules a retry for an event
   */
  private scheduleRetry(id: string, delayMs: number): void {
    // Cancel any existing schedule for this event
    this.cancelRetry(id);

    const timeout = setTimeout(() => {
      this.retrySchedules.delete(id);
      this.emit('retry_ready', id);
    }, delayMs);

    this.retrySchedules.set(id, timeout);
  }

  /**
   * Cancels a scheduled retry
   */
  private cancelRetry(id: string): void {
    const timeout = this.retrySchedules.get(id);
    if (timeout) {
      clearTimeout(timeout);
      this.retrySchedules.delete(id);
    }
  }

  /**
   * Clears all data (use with caution — mainly for testing)
   */
  clear(): void {
    this.retrySchedules.forEach(timeout => clearTimeout(timeout));
    this.store.clear();
    this.retrySchedules.clear();
  }

  /**
   * Gets the current store size
   */
  size(): number {
    return this.store.size;
  }
}

export const outboxService = new OutboxService();
