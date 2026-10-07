export type ValidationResult<T> = { success: true; data: T } | { success: false; error: string };

export interface Schema<T = any> {
  validate(data: any): ValidationResult<T>;
}

export const z = {
  string: (): Schema<string> => ({
    validate: (data) => typeof data === 'string' ? { success: true, data } : { success: false, error: 'Expected string' }
  }),
  number: (): Schema<number> => ({
    validate: (data) => typeof data === 'number' ? { success: true, data } : { success: false, error: 'Expected number' }
  }),
  boolean: (): Schema<boolean> => ({
    validate: (data) => typeof data === 'boolean' ? { success: true, data } : { success: false, error: 'Expected boolean' }
  }),
  object: <T extends Record<string, Schema<any>>>(shape: T): Schema<{ [K in keyof T]: T[K] extends Schema<infer U> ? U : never }> => ({
    validate: (data) => {
      if (typeof data !== 'object' || data === null) return { success: false, error: 'Expected object' };
      const result: any = {};
      for (const key in shape) {
        const valResult = shape[key].validate(data[key]);
        if (!valResult.success) return { success: false, error: `Invalid field ${key}: ${valResult.error}` };
        result[key] = valResult.data;
      }
      return { success: true, data: result };
    }
  }),
  array: <T>(itemSchema: Schema<T>): Schema<T[]> => ({
    validate: (data) => {
      if (!Array.isArray(data)) return { success: false, error: 'Expected array' };
      for (let i = 0; i < data.length; i++) {
        const valResult = itemSchema.validate(data[i]);
        if (!valResult.success) return { success: false, error: `Invalid item at index ${i}: ${valResult.error}` };
      }
      return { success: true, data };
    }
  }),
  record: <T>(itemSchema: Schema<T>): Schema<Record<string, T>> => ({
    validate: (data) => {
      if (typeof data !== 'object' || data === null) return { success: false, error: 'Expected record object' };
      for (const key in data) {
        const valResult = itemSchema.validate(data[key]);
        if (!valResult.success) return { success: false, error: `Invalid property ${key}: ${valResult.error}` };
      }
      return { success: true, data };
    }
  }),
  optional: <T>(schema: Schema<T>): Schema<T | undefined> => ({
    validate: (data) => data === undefined ? { success: true, data } : schema.validate(data)
  }),
  nullable: <T>(schema: Schema<T>): Schema<T | null> => ({
    validate: (data) => data === null ? { success: true, data } : schema.validate(data)
  }),
  any: (): Schema<any> => ({
    validate: (data) => ({ success: true, data })
  }),
  jsonString: <T>(schema: Schema<T>): Schema<string> => ({
    validate: (data) => {
      if (typeof data !== 'string') return { success: false, error: 'Expected string' };
      try {
        const parsed = JSON.parse(data);
        const valResult = schema.validate(parsed);
        if (!valResult.success) return { success: false, error: valResult.error };
        return { success: true, data };
      } catch (e) {
        return { success: false, error: 'Invalid JSON string' };
      }
    }
  })
};
