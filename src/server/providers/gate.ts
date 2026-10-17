import { AppError } from '../http/errors';
import type {
  RoutingRepository,
  ServiceName,
} from '../../features/routing/server/repository';
import { ProviderError } from './provider-error';

type Options = { now?: () => number; sleep?: (ms: number) => Promise<void> };
export class ProviderGate {
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  constructor(
    private readonly repository: RoutingRepository,
    options: Options = {},
  ) {
    this.now = options.now ?? Date.now;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }
  async run<T>(input: {
    service: ServiceName;
    keyFingerprint: string;
    policy: { minuteLimit: number; dayLimit: number };
    operation: () => Promise<T>;
    /** Count a fulfilled result as an error while returning it unchanged, without retrying. */
    isErrorResult?: (value: T) => boolean;
    deadlineAt?: number;
    maxAttemptMs?: number;
  }): Promise<T> {
    const { service, keyFingerprint, policy, operation } = input;
    const deadlineAt = input.deadlineAt ?? this.now() + 15000;
    const maxAttemptMs = input.maxAttemptMs ?? 6000;
    const timeout = () =>
      new ProviderError(
        504,
        'PROVIDER_TIMEOUT',
        'The service took too long to respond.',
        { retryable: false },
      );
    const checkWindow = () => {
      if (
        !Number.isFinite(deadlineAt) ||
        !Number.isFinite(maxAttemptMs) ||
        maxAttemptMs <= 0 ||
        this.now() + maxAttemptMs > deadlineAt
      )
        throw timeout();
    };
    if (
      ![policy.minuteLimit, policy.dayLimit].every(
        (x) => Number.isSafeInteger(x) && x > 0,
      )
    )
      throw new AppError(
        503,
        'PROVIDER_UNAVAILABLE',
        'The service budget is not configured.',
      );
    for (let attempt = 0; attempt < 2; attempt++) {
      checkWindow();
      const reservation = await this.repository.reserveBudget({
        service,
        keyFingerprint,
        now: new Date(this.now()).toISOString(),
        ...policy,
      });
      if (!reservation.allowed) {
        await this.repository.recordUsage({
          service,
          event: 'wait',
          at: new Date(this.now()).toISOString(),
        });
        if (reservation.reason === 'quota')
          throw new AppError(
            503,
            'QUOTA_EXHAUSTED',
            'The service quota has been reached.',
            reservation.resetAt ? { resetAt: reservation.resetAt } : undefined,
          );
        throw new AppError(
          429,
          'RATE_LIMITED',
          'Please wait before trying again.',
          { retryAfterSec: Math.max(1, Math.ceil(reservation.retryAfterSec)) },
        );
      }
      // Reservation is durable. No awaited work between this check and the actual attempt.
      checkWindow();
      const attemptedAt = this.now();
      let pending: Promise<T>;
      try {
        pending = operation();
      } catch (error) {
        pending = Promise.reject(error);
      }
      // Attach both handlers before awaiting telemetry, so a quick failure is never unhandled.
      const settled = Promise.resolve(pending).then(
        (value) => ({ ok: true as const, value, completedAt: this.now() }),
        (error) => ({ ok: false as const, error }),
      );
      await this.repository.recordUsage({
        service,
        event: 'call',
        at: new Date(attemptedAt).toISOString(),
      });
      const outcome = await settled;
      let error: unknown;
      if (outcome.ok) {
        if (outcome.completedAt > deadlineAt) error = timeout();
        else {
          if (input.isErrorResult?.(outcome.value))
            await this.repository.recordUsage({
              service,
              event: 'error',
              at: new Date(this.now()).toISOString(),
              category: 'INVALID_PROVIDER_RESULT',
            });
          // Telemetry latency is not an upstream failure; the overall request may still time out.
          if (this.now() > deadlineAt)
            throw new AppError(
              504,
              'PROVIDER_TIMEOUT',
              'The request took too long to complete.',
            );
          return outcome.value;
        }
      } else error = outcome.error;
      await this.repository.recordUsage({
        service,
        event: 'error',
        at: new Date(this.now()).toISOString(),
        category: error instanceof AppError ? error.code : 'NETWORK_ERROR',
      });
      if (
        error instanceof ProviderError &&
        (error.code === 'RATE_LIMITED' || error.code === 'QUOTA_EXHAUSTED')
      ) {
        const until =
          error.quotaResetAt ??
          new Date(
            this.now() +
              (error.retryAfterSec ??
                (error.code === 'RATE_LIMITED' ? 60 : 86400)) *
                1000,
          ).toISOString();
        await this.repository.blockBudget({
          service,
          keyFingerprint,
          until,
          reason: error.code === 'RATE_LIMITED' ? 'rate' : 'quota',
        });
      }
      if (
        !(error instanceof ProviderError) ||
        !error.retryable ||
        attempt === 1
      )
        throw error;
      const delay =
        error.retryAfterSec !== undefined
          ? error.retryAfterSec * 1000
          : 150 + Math.floor(Math.random() * 150);
      if (delay < 0 || this.now() + delay + maxAttemptMs > deadlineAt)
        throw error;
      await this.sleep(delay);
    }
    throw new AppError(
      503,
      'PROVIDER_UNAVAILABLE',
      'The service is unavailable.',
    );
  }
}
