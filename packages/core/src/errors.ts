export class AnimatorError extends Error {
  code: string;
  path?: string;
  hint?: string;

  constructor(
    message: string,
    options?: { code?: string; path?: string; hint?: string },
  ) {
    super(message);
    this.name = "AnimatorError";
    this.code = options?.code ?? "UNKNOWN_ERROR";
    if (options?.path !== undefined) {
      this.path = options.path;
    }
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}
