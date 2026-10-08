import { Ajv } from "ajv";
import lottieSchema from "./schema/lottie-schema.json" with { type: "json" };

const ajv = new Ajv({
  allErrors: true,
  strict: false,
});

const validateFn = ajv.compile(lottieSchema);

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateLottieSchema(
  lottieJson: string | object,
): ValidationResult {
  let parsed: unknown;
  if (typeof lottieJson === "string") {
    try {
      parsed = JSON.parse(lottieJson);
    } catch (err) {
      return {
        valid: false,
        errors: [`Invalid JSON string: ${(err as Error).message}`],
      };
    }
  } else {
    parsed = lottieJson;
  }

  const valid = validateFn(parsed);
  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validateFn.errors || []).map(
    (err: { instancePath?: string; message?: string; keyword: string }) => {
      const instancePath = err.instancePath ? ` at ${err.instancePath}` : "";
      return `${err.message || "Unknown error"}${instancePath} (keyword: ${err.keyword})`;
    },
  );

  return { valid: false, errors };
}
