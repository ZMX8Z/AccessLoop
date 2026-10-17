import { AppError } from '../../../server/http/errors';
export function deadlineError(): AppError {
  return new AppError(
    504,
    'PROVIDER_TIMEOUT',
    'The route took too long to complete. Please try again.',
  );
}
/** A waiter timing out must not abort another session's shared provider request. */
export async function beforeDeadline<T>(
  pending: Promise<T>,
  deadlineAt: number,
  now: () => number,
): Promise<T> {
  const remaining = deadlineAt - now();
  if (remaining <= 0) throw deadlineError();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(deadlineError()), remaining);
  });
  try {
    const result = await Promise.race([pending, timeout]);
    if (now() > deadlineAt) throw deadlineError();
    return result;
  } finally {
    clearTimeout(timer);
  }
}
