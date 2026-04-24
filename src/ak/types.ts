export const AK_RECOMMENDED_ENVS = [
  'bzy-pre',
  'bzy-prod',
  'op-pre',
  'op-prod',
  'gitee',
  'github',
  'gitlab'
] as const;

export const AK_ENVS = AK_RECOMMENDED_ENVS;

export type AkEnv = string;

export const AK_QUERY_FIELDS = [
  'userId',
  'userName',
  'email',
  'phone',
  'key'
] as const;

export type AkQueryField = (typeof AK_QUERY_FIELDS)[number];

export interface AkRecord {
  id: string;
  env: AkEnv;
  userId: string | null;
  userName: string | null;
  email: string | null;
  phone: string | null;
  keyCiphertext: string;
  keySearchPrefix: string;
  createdAt: string;
  updatedAt: string;
}
