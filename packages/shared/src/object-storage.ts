import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export interface StorageEnv {
  mode: 's3' | 'local';
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  forcePathStyle: boolean;
  localDir: string;
}

/**
 * 四项都有才走 S3 兼容存储（MinIO、COS、OSS 均可）。
 * 缺任何一项就写本地目录，不访问云厂商。密钥只来自环境变量。
 */
export function readStorageEnv(source: NodeJS.ProcessEnv = process.env): StorageEnv {
  const endpoint = (source.OSS_ENDPOINT ?? '').trim();
  const bucket = (source.OSS_BUCKET ?? '').trim();
  const accessKeyId = (source.OSS_ACCESS_KEY_ID ?? '').trim();
  const accessKeySecret = (source.OSS_ACCESS_KEY_SECRET ?? '').trim();
  const region = (source.OSS_REGION ?? '').trim() || 'us-east-1';
  const forceRaw = (source.OSS_FORCE_PATH_STYLE ?? '').trim().toLowerCase();
  const forcePathStyle = forceRaw === '' ? true : forceRaw === 'true' || forceRaw === '1';
  const configured = Boolean(endpoint && bucket && accessKeyId && accessKeySecret);
  const override = (source.OSS_LOCAL_DIR ?? '').trim();
  const localDir = override
    ? path.resolve(override)
    : path.resolve(__dirname, '../../../data/courseware');
  return {
    mode: configured ? 's3' : 'local',
    endpoint,
    bucket,
    accessKeyId,
    accessKeySecret,
    region,
    forcePathStyle,
    localDir,
  };
}

export function createObjectStorage(env: StorageEnv = readStorageEnv()): ObjectStorage {
  if (env.mode === 'local') {
    return localStorage(env.localDir);
  }
  return s3Storage(env);
}

function localStorage(root: string): ObjectStorage {
  return {
    async put(key, body) {
      const full = resolveKey(root, key);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    },
    async get(key) {
      return readFile(resolveKey(root, key));
    },
    async delete(key) {
      await rm(resolveKey(root, key), { force: true });
    },
  };
}

function resolveKey(root: string, key: string): string {
  const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized || parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('对象键不合法');
  }
  const full = path.resolve(root, ...parts);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (full !== root && !full.startsWith(prefix)) {
    throw new Error('对象键不合法');
  }
  return full;
}

function s3Storage(env: StorageEnv): ObjectStorage {
  return {
    async put(key, body, contentType) {
      await s3Send(env, 'PUT', key, body, contentType);
    },
    async get(key) {
      return s3Send(env, 'GET', key);
    },
    async delete(key) {
      await s3Send(env, 'DELETE', key);
    },
  };
}

async function s3Send(
  env: StorageEnv,
  method: 'GET' | 'PUT' | 'DELETE',
  key: string,
  body?: Buffer,
  contentType?: string,
): Promise<Buffer> {
  const url = buildUrl(env, key);
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256(method === 'GET' || method === 'DELETE' ? Buffer.alloc(0) : payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType && method === 'PUT') {
    headers['content-type'] = contentType;
  }
  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]?.trim() ?? ''}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalUri = encodePath(url.pathname);
  const canonical = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );
  const scope = `${dateStamp}/${env.region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const signature = createHmac('sha256', signingKey(env.accessKeySecret, dateStamp, env.region))
    .update(stringToSign)
    .digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${env.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const response = await fetch(url, {
    method,
    headers: { ...headers, authorization },
    body: method === 'PUT' ? payload : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 180);
    throw new Error(`对象存储返回 ${response.status}${detail ? ` ${detail}` : ''}`);
  }
  if (method === 'GET') {
    return Buffer.from(await response.arrayBuffer());
  }
  return Buffer.alloc(0);
}

function buildUrl(env: StorageEnv, key: string): URL {
  const encodedKey = key
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const endpoint = new URL(env.endpoint);
  if (env.forcePathStyle) {
    const base = env.endpoint.replace(/\/$/, '');
    return new URL(`${base}/${encodeURIComponent(env.bucket)}/${encodedKey}`);
  }
  endpoint.hostname = `${env.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `/${encodedKey}`;
  return endpoint;
}

function encodePath(pathname: string): string {
  return pathname
    .split('/')
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join('/');
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

function signingKey(secret: string, dateStamp: string, region: string): Buffer {
  const dateKey = createHmac('sha256', `AWS4${secret}`).update(dateStamp).digest();
  const regionKey = createHmac('sha256', dateKey).update(region).digest();
  const serviceKey = createHmac('sha256', regionKey).update('s3').digest();
  return createHmac('sha256', serviceKey).update('aws4_request').digest();
}
