export interface AnimatorErrorOptions {
  code: string;
  path?: string | undefined;
  hint?: string | undefined;
}

export class AnimatorError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly hint?: string | undefined;

  constructor(message: string, options: AnimatorErrorOptions) {
    super(message);
    this.name = "AnimatorError";
    this.code = options.code;
    if (options.path !== undefined) {
      this.path = options.path;
    }
    if (options.hint !== undefined) {
      this.hint = options.hint;
    }
  }
}
