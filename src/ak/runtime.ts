import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

export const AK_DB_PATH_ENV_VAR = 'STEPHEN_AK_DB_PATH';
export const LEGACY_AK_DB_PATH_ENV_VAR = 'STEPHEN_CLI_AK_DB_PATH';
export const AK_CONFIG_FILE_NAME = 'config.json';
export const CONFIG_KEYS = ['ak.dbPath'] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface StephenCliPaths {
  cache: string;
  config: string;
  data: string;
  log: string;
  temp: string;
}

export interface AkConfig {
  ak?: {
    dbPath?: string | undefined;
  } | undefined;
}

export interface ResolveAkDatabasePathInput {
  config: AkConfig;
  defaultDataDir: string;
  env: NodeJS.ProcessEnv;
}

export interface ResolvedAkDatabasePath {
  path: string;
  source: 'config' | 'default' | 'env';
}

export interface ConfigEntry {
  configFilePath: string;
  defaultValue: string;
  envValue: string | null;
  fileValue: string | null;
  key: ConfigKey;
  source: ResolvedAkDatabasePath['source'];
  value: string;
}

export class AkConfigError extends Error {
  readonly code = 'CONFIG_ERROR';
  readonly exitCode = 2;

  constructor(message: string) {
    super(message);
    this.name = 'AkConfigError';
  }
}

export class AkStorageInitError extends Error {
  readonly code = 'STORAGE_ERROR';
  readonly exitCode = 6;

  constructor(path: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : 'Unknown storage error.';

    super(
      `Failed to open the ak database at "${path}". Check ${formatAkDbPathEnvVarHelp()}, the local config file, and the parent directory permissions. Details: ${detail}`
    );
    this.name = 'AkStorageInitError';
  }
}

const akConfigSchema = z
  .object({
    ak: z
      .object({
        dbPath: z.string().optional()
      })
      .optional()
  })
  .passthrough();

export function getAkConfigFilePath(configDir: string): string {
  return join(configDir, AK_CONFIG_FILE_NAME);
}

export function loadAkConfig(configDir: string): AkConfig {
  const configFilePath = getAkConfigFilePath(configDir);

  if (!existsSync(configFilePath)) {
    return {};
  }

  return parseAkConfig(readFileSync(configFilePath, 'utf8'), configFilePath);
}

export function saveAkConfig(configDir: string, config: AkConfig): void {
  const configFilePath = getAkConfigFilePath(configDir);
  mkdirSync(dirname(configFilePath), { recursive: true });
  writeFileSync(`${configFilePath}`, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

export function parseAkConfig(contents: string, configFilePath = AK_CONFIG_FILE_NAME): AkConfig {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(contents);
  } catch {
    throw new AkConfigError(
      `Failed to parse the local config file at "${configFilePath}". Fix the JSON or set ${formatAkDbPathEnvVarHelp()} to the full ak.db path on this machine.`
    );
  }

  const parsed = akConfigSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new AkConfigError(
      `Invalid ak config in "${configFilePath}". Expected ak.dbPath to be a string when provided. Fix the config file or set ${formatAkDbPathEnvVarHelp()} to the full ak.db path on this machine.`
    );
  }

  return parsed.data;
}

export function resolveAkDatabasePath(
  input: ResolveAkDatabasePathInput
): ResolvedAkDatabasePath {
  const configPath = normalizeConfiguredPath(input.config.ak?.dbPath, 'ak.dbPath');

  if (configPath) {
    return {
      path: configPath,
      source: 'config'
    };
  }

  const envPath = getConfiguredAkDbPathFromEnv(input.env);

  if (envPath) {
    return {
      path: normalizeConfiguredPath(envPath.value, envPath.source)!,
      source: 'env'
    };
  }

  return {
    path: join(input.defaultDataDir, 'ak.db'),
    source: 'default'
  };
}

export function getConfigEntry(
  key: ConfigKey,
  input: {
    configDir: string;
    dataDir: string;
    env: NodeJS.ProcessEnv;
  }
): ConfigEntry {
  assertSupportedConfigKey(key);

  const config = loadAkConfig(input.configDir);
  const resolved = resolveAkDatabasePath({
    config,
    defaultDataDir: input.dataDir,
    env: input.env
  });
  const envValue = normalizeResolvedValue(getConfiguredAkDbPathFromEnv(input.env)?.value);
  const fileValue = normalizeResolvedValue(config.ak?.dbPath);

  return {
    configFilePath: getAkConfigFilePath(input.configDir),
    defaultValue: join(input.dataDir, 'ak.db'),
    envValue,
    fileValue,
    key,
    source: resolved.source,
    value: resolved.path
  };
}

export function listConfigEntries(input: {
  configDir: string;
  dataDir: string;
  env: NodeJS.ProcessEnv;
}): ConfigEntry[] {
  return CONFIG_KEYS.map((key) => getConfigEntry(key, input));
}

export function setConfigValue(
  key: ConfigKey,
  value: string,
  input: {
    configDir: string;
  }
): AkConfig {
  assertSupportedConfigKey(key);
  const normalizedValue = normalizeConfiguredPath(value, key);
  const config = loadAkConfig(input.configDir);
  const nextConfig: AkConfig = {
    ...config,
    ak: {
      ...(config.ak ?? {}),
      dbPath: normalizedValue
    }
  };

  saveAkConfig(input.configDir, nextConfig);

  return nextConfig;
}

export function assertSupportedConfigKey(key: string): asserts key is ConfigKey {
  if (!CONFIG_KEYS.includes(key as ConfigKey)) {
    throw new AkConfigError(
      `Unsupported config key: ${key}. Supported keys: ${CONFIG_KEYS.join(', ')}.`
    );
  }
}

function normalizeConfiguredPath(value: string | undefined, source: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new AkConfigError(
      `${source} is configured but empty. Set it to the full ak.db path, or remove it to fall back to the next storage path source.`
    );
  }

  return normalized;
}

function normalizeResolvedValue(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }

  return value.trim();
}

function getConfiguredAkDbPathFromEnv(
  env: NodeJS.ProcessEnv
): { source: string; value: string } | undefined {
  const primaryValue = env[AK_DB_PATH_ENV_VAR];

  if (primaryValue !== undefined) {
    return {
      source: AK_DB_PATH_ENV_VAR,
      value: primaryValue
    };
  }

  const legacyValue = env[LEGACY_AK_DB_PATH_ENV_VAR];

  if (legacyValue !== undefined) {
    return {
      source: LEGACY_AK_DB_PATH_ENV_VAR,
      value: legacyValue
    };
  }

  return undefined;
}

function formatAkDbPathEnvVarHelp(): string {
  return `${AK_DB_PATH_ENV_VAR} (preferred) or ${LEGACY_AK_DB_PATH_ENV_VAR} (legacy)`;
}
