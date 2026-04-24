import { describe, expect, it } from 'vitest';
import { join } from 'node:path';

import {
  AkStorageInitError,
  AK_CONFIG_FILE_NAME,
  AK_DB_PATH_ENV_VAR,
  LEGACY_AK_DB_PATH_ENV_VAR,
  parseAkConfig,
  resolveAkDatabasePath
} from '../../src/ak/runtime.js';

describe('resolveAkDatabasePath', () => {
  it('prefers the config file path over the environment variable and default path', () => {
    expect(
      resolveAkDatabasePath({
        config: {
          ak: {
            dbPath: 'D:/iDrive/from-config/ak.db'
          }
        },
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {
          [AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-env/ak.db'
        }
      })
    ).toEqual({
      path: 'D:/iDrive/from-config/ak.db',
      source: 'config'
    });
  });

  it('uses the config file path when the environment override is missing', () => {
    expect(
      resolveAkDatabasePath({
        config: {
          ak: {
            dbPath: 'D:/iDrive/from-config/ak.db'
          }
        },
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {}
      })
    ).toEqual({
      path: 'D:/iDrive/from-config/ak.db',
      source: 'config'
    });
  });

  it('falls back to the default data directory when no override is present', () => {
    expect(
      resolveAkDatabasePath({
        config: {},
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {}
      })
    ).toEqual({
      path: join('C:/Users/Stephen/AppData/Local/stephen/data', 'ak.db'),
      source: 'default'
    });
  });

  it('rejects an empty ak db path environment variable', () => {
    expect(() =>
      resolveAkDatabasePath({
        config: {},
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {
          [AK_DB_PATH_ENV_VAR]: '   '
        }
      })
    ).toThrow(/configured but empty/);
  });

  it('uses the new environment variable before the legacy one', () => {
    expect(
      resolveAkDatabasePath({
        config: {},
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {
          [AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-new-env/ak.db',
          [LEGACY_AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-legacy-env/ak.db'
        }
      })
    ).toEqual({
      path: 'E:/iDrive/from-new-env/ak.db',
      source: 'env'
    });
  });

  it('falls back to the legacy environment variable for compatibility', () => {
    expect(
      resolveAkDatabasePath({
        config: {},
        defaultDataDir: 'C:/Users/Stephen/AppData/Local/stephen/data',
        env: {
          [LEGACY_AK_DB_PATH_ENV_VAR]: 'E:/iDrive/from-legacy-env/ak.db'
        }
      })
    ).toEqual({
      path: 'E:/iDrive/from-legacy-env/ak.db',
      source: 'env'
    });
  });
});

describe('parseAkConfig', () => {
  it('parses a config file with ak.dbPath', () => {
    expect(
      parseAkConfig(`{
        "ak": {
          "dbPath": "D:/iDrive/stephen/ak.db"
        }
      }`)
    ).toEqual({
      ak: {
        dbPath: 'D:/iDrive/stephen/ak.db'
      }
    });
  });

  it('includes the config file path in invalid config errors', () => {
    expect(() =>
      parseAkConfig('{not-json}', `C:/Users/Stephen/.config/stephen/${AK_CONFIG_FILE_NAME}`)
    ).toThrow(/config\.json/);
  });

  it('rejects a non-string ak.dbPath value', () => {
    expect(() =>
      parseAkConfig(
        `{
          "ak": {
            "dbPath": 123
          }
        }`,
        `C:/Users/Stephen/.config/stephen/${AK_CONFIG_FILE_NAME}`
      )
    ).toThrow(/Expected ak\.dbPath to be a string/);
  });
});

describe('AkStorageInitError', () => {
  it('falls back to a generic detail when the cause is not an Error', () => {
    expect(new AkStorageInitError('D:/iDrive/stephen/ak.db', 'boom').message).toContain(
      'Unknown storage error.'
    );
  });
});
