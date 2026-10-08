export class AnimatorError extends Error {
  readonly code: string;
  readonly path?: string;
  readonly hint?: string;

  constructor(
    message: string,
    code: string,
    options?: { path?: string; hint?: string },
  ) {
    super(message);
    this.name = "AnimatorError";
    this.code = code;
    if (options?.path !== undefined) {
      this.path = options.path;
    }
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
    Object.setPrototypeOf(this, AnimatorError.prototype);
  }
}
