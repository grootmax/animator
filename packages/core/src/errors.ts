export interface AnimatorErrorOptions {
  code?: string;
  path?: string;
  hint?: string;
  metadata?: Record<string, unknown>;
  cause?: unknown;
}

export class AnimatorError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly hint?: string;
  readonly metadata?: Record<string, unknown>;

  constructor(message: string, options?: AnimatorErrorOptions) {
    super(
      message,
      options?.cause !== undefined ? { cause: options.cause } : undefined,
    );
    this.name = "AnimatorError";
    this.code = options?.code ?? "ANIMATOR_ERROR";
    if (options?.path !== undefined) {
      this.path = options.path;
    }
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
    if (options?.metadata !== undefined) {
      this.metadata = options.metadata;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
