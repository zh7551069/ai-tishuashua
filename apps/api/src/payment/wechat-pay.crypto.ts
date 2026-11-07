import {
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
  createPublicKey,
  X509Certificate,
  type KeyObject,
} from 'node:crypto';

const PAY_SIGNATURE_MAX_SKEW_SECONDS = 5 * 60;

export interface PlatformVerifier {
  serial: string;
  key: KeyObject;
}

/** 平台证书 PEM，或仅公钥 PEM。证书会带序列号。私钥不会从这里读出。 */
export function loadPlatformVerifier(pem: string): PlatformVerifier | null {
  const text = pem.trim();
  if (!text) {
    return null;
  }
  try {
    if (text.includes('BEGIN CERTIFICATE')) {
      const cert = new X509Certificate(text);
      return {
        serial: cert.serialNumber.replace(/:/g, '').toUpperCase(),
        key: cert.publicKey,
      };
    }
    if (text.includes('BEGIN PUBLIC KEY')) {
      return { serial: '', key: createPublicKey(text) };
    }
  } catch {
    return null;
  }
  return null;
}

export function verifyPaySignature(input: {
  verifier: PlatformVerifier;
  timestamp: string;
  nonce: string;
  signature: string;
  serial: string;
  rawBody: string;
  now?: Date;
}): boolean {
  if (!input.rawBody || !input.signature || !input.timestamp || !input.nonce || !input.serial) {
    return false;
  }
  if (input.nonce.length > 64 || input.timestamp.length > 20 || input.signature.length > 2048) {
    return false;
  }
  const stamp = Number(input.timestamp);
  if (!Number.isFinite(stamp)) {
    return false;
  }
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSeconds - stamp) > PAY_SIGNATURE_MAX_SKEW_SECONDS) {
    return false;
  }
  if (
    input.verifier.serial &&
    input.verifier.serial !== input.serial.replace(/:/g, '').toUpperCase()
  ) {
    return false;
  }
  const message = `${input.timestamp}\n${input.nonce}\n${input.rawBody}\n`;
  const verifier = createVerify('RSA-SHA256');
  verifier.update(message);
  verifier.end();
  try {
    return verifier.verify(input.verifier.key, input.signature, 'base64');
  } catch {
    return false;
  }
}

export function signPayMessage(privateKeyPem: string, message: string): string {
  const signer = createSign('RSA-SHA256');
  signer.update(message);
  signer.end();
  return signer.sign(privateKeyPem, 'base64');
}

export function decryptNotifyResource(
  apiV3Key: string,
  resource: { ciphertext: string; nonce: string; associatedData: string },
): string {
  const key = Buffer.from(apiV3Key, 'utf8');
  if (key.length !== 32) {
    throw new Error('APIv3 密钥长度不正确');
  }
  const nonce = Buffer.from(resource.nonce, 'utf8');
  const buf = Buffer.from(resource.ciphertext, 'base64');
  if (buf.length <= 16 || nonce.length < 12) {
    throw new Error('回调密文不正确');
  }
  const data = buf.subarray(0, buf.length - 16);
  const tag = buf.subarray(buf.length - 16);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  if (resource.associatedData) {
    decipher.setAAD(Buffer.from(resource.associatedData, 'utf8'));
  }
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** 测试构造回调密文。nonce 必须是至少 12 字节的明文。 */
export function encryptNotifyResource(
  apiV3Key: string,
  plaintext: string,
  nonce: string,
  associatedData = 'transaction',
): { ciphertext: string; nonce: string; associatedData: string } {
  const key = Buffer.from(apiV3Key, 'utf8');
  if (key.length !== 32) {
    throw new Error('APIv3 密钥长度不正确');
  }
  const nonceBuf = Buffer.from(nonce, 'utf8');
  const cipher = createCipheriv('aes-256-gcm', key, nonceBuf);
  if (associatedData) {
    cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  }
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: Buffer.concat([encrypted, tag]).toString('base64'),
    nonce,
    associatedData,
  };
}
