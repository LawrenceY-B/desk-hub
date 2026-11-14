export class RateLimitError extends Error {
  readonly retryAt: Date;

  constructor(message: string, retryAt: Date) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAt = retryAt;
  }
}
