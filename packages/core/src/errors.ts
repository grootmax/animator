export class AnimatorError extends Error {
  code: string;
  path?: string | undefined;
  hint?: string | undefined;

  constructor(
    message: string,
    options?: { code?: string; path?: string; hint?: string },
  ) {
    super(message);
    this.name = "AnimatorError";
    this.code = options?.code ?? "INVALID_OP";
    if (options?.path !== undefined) {
      this.path = options.path;
    }
    if (options?.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}
