import { z } from 'zod';

import { AK_ENVS, AK_QUERY_FIELDS, type AkQueryField } from './types.js';

const akEnvSchema = z.enum(AK_ENVS);

export function normalizeAkKey(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error('API key cannot be empty.');
  }

  return normalized;
}

export function maskKey(value: string): string {
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }

  if (value.length <= 8) {
    return `${value.slice(0, 2)}${'*'.repeat(value.length - 4)}${value.slice(-2)}`;
  }

  return `${value.slice(0, 4)}${'*'.repeat(value.length - 8)}${value.slice(-4)}`;
}

const nullableTextField = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => value ?? undefined);

export const addAkRecordInputSchema = z.object({
  email: nullableTextField,
  env: akEnvSchema,
  key: z.string().transform(normalizeAkKey),
  phone: nullableTextField,
  userId: nullableTextField,
  userName: nullableTextField
});

export const listAkRecordsInputSchema = z.object({
  env: akEnvSchema.optional(),
  field: z.string().trim().optional(),
  limit: z.number().int().positive().max(100).default(50),
  query: z.string().trim().min(1).optional()
});

export function parseAkQueryFields(value: string | undefined): AkQueryField[] {
  if (!value) {
    return [...AK_QUERY_FIELDS];
  }

  return value.split(',').map((field) => {
    const normalized = field.trim();

    if (!AK_QUERY_FIELDS.includes(normalized as AkQueryField)) {
      throw new Error(`Unsupported query field: ${normalized}.`);
    }

    return normalized as AkQueryField;
  });
}

export { AK_QUERY_FIELDS };
