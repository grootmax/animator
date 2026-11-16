import type { z } from "zod";

export interface AnimatorErrorOptions {
  code: string;
  path?: string | undefined;
  hint?: string | undefined;
  cause?: unknown;
}

/**
 * Formats a path array into a readable JSON path string like `layers[3].presets[1]`.
 */
export function formatErrorPath(path: readonly (string | number)[]): string {
  if (path.length === 0) return "";
  return path.reduce<string>((acc, segment, index) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    if (index === 0) {
      return String(segment);
    }
    return `${acc}.${segment}`;
  }, "");
}

/**
 * Custom error class for Animator errors containing code, path, and actionable fix hints.
 */
export class AnimatorError extends Error {
  readonly code: string;
  readonly path?: string | undefined;
  readonly hint?: string | undefined;

  constructor(
    messageOrOptions:
      | string
      | {
          message: string;
          code: string;
          path?: string | undefined;
          hint?: string | undefined;
          cause?: unknown;
        },
    optionsOrCode?: AnimatorErrorOptions | string,
    path?: string | undefined,
    hint?: string | undefined,
  ) {
    if (typeof messageOrOptions === "object") {
      super(messageOrOptions.message);
      this.code = messageOrOptions.code;
      if (messageOrOptions.path !== undefined) {
        this.path = messageOrOptions.path;
      }
      if (messageOrOptions.hint !== undefined) {
        this.hint = messageOrOptions.hint;
      }
      if (messageOrOptions.cause !== undefined) {
        this.cause = messageOrOptions.cause;
      }
    } else if (typeof optionsOrCode === "object") {
      super(messageOrOptions);
      this.code = optionsOrCode.code;
      if (optionsOrCode.path !== undefined) {
        this.path = optionsOrCode.path;
      }
      if (optionsOrCode.hint !== undefined) {
        this.hint = optionsOrCode.hint;
      }
      if (optionsOrCode.cause !== undefined) {
        this.cause = optionsOrCode.cause;
      }
    } else {
      super(messageOrOptions);
      this.code = optionsOrCode ?? "ERR_ANIMATOR";
      if (path !== undefined) {
        this.path = path;
      }
      if (hint !== undefined) {
        this.hint = hint;
      }
    }

    this.name = "AnimatorError";
    Object.setPrototypeOf(this, AnimatorError.prototype);
  }

  /**
   * Converts a ZodError into an AnimatorError with exact JSON path and actionable hint.
   */
  static fromZodError(error: z.ZodError): AnimatorError {
    const issue = error.issues[0];
    if (!issue) {
      return new AnimatorError("Validation failed", { code: "ERR_VALIDATION" });
    }

    let code = "ERR_VALIDATION";
    const pathSegments = issue.path.filter(
      (p): p is string | number =>
        typeof p === "string" || typeof p === "number",
    );
    let formattedPath = formatErrorPath(pathSegments);
    let hint = "Check the document schema specification.";

    if (issue.code === "unrecognized_keys") {
      code = "ERR_UNKNOWN_FIELD";
      const keys = (issue as { keys?: string[] }).keys || [];
      const keyName = keys[0] || "unknown";
      formattedPath = formattedPath ? `${formattedPath}.${keyName}` : keyName;
      hint = `Remove unrecognized property "${keyName}".`;
      return new AnimatorError(
        `Unrecognized property "${keyName}" at ${formattedPath || "root"}`,
        {
          code,
          path: formattedPath,
          hint,
          cause: error,
        },
      );
    }

    if (issue.code === "invalid_type") {
      code = "ERR_INVALID_TYPE";
      const expected = (issue as unknown as { expected?: unknown }).expected;
      const received = (issue as unknown as { received?: unknown }).received;
      if (expected !== undefined) {
        hint =
          received !== undefined
            ? `Expected ${expected}, received ${received}.`
            : `Expected ${expected}.`;
      }
    }

    const message =
      issue.message && issue.message !== "Invalid input"
        ? `${issue.message} at ${formattedPath || "root"}`
        : `Validation error at ${formattedPath || "root"}`;

    return new AnimatorError(message, {
      code,
      path: formattedPath,
      hint,
      cause: error,
    });
  }
}
