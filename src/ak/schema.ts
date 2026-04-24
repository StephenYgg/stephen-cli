import { z } from 'zod';

import {
  AK_QUERY_FIELDS,
  AK_RECOMMENDED_ENVS,
  type AkQueryField
} from './types.js';

const envRecommendationMessage = `Recommended values: ${AK_RECOMMENDED_ENVS.join(', ')}.`;
const akEnvSchema = z.string().transform((value, context) => {
  try {
    return normalizeAkEnv(value);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: (error as Error).message
    });
    return z.NEVER;
  }
});

export function normalizeAkKey(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error('API key cannot be empty.');
  }

  return normalized;
}

export function normalizeAkEnv(value: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new Error(`Environment is required. ${envRecommendationMessage}`);
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)) {
    throw new Error(
      `Environment must use letters, numbers, ".", "_" or "-". ${envRecommendationMessage}`
    );
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

export { AK_QUERY_FIELDS, AK_RECOMMENDED_ENVS };
