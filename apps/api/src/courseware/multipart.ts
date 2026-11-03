import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, COURSEWARE_MAX_BYTES } from '@tishuashua/shared';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception';

const OVERHEAD = 256 * 1024;

export interface MultipartUpload {
  certificateId: string;
  fileName: string;
  mimeType: string;
  bytes: Buffer;
}

/** 直传登记。小程序 uploadFile 和 curl -F 都走这一条，不依赖预签名。 */
export async function readCoursewareMultipart(req: Request): Promise<MultipartUpload> {
  const header = headerValue(req.headers['content-type']);
  if (!header?.toLowerCase().includes('multipart/form-data')) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.VALIDATION_ERROR,
      '请用 multipart/form-data 上传课件',
    );
  }
  const boundary = readBoundary(header);
  if (!boundary) {
    throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '缺少上传边界');
  }
  const body = await readLimited(req, COURSEWARE_MAX_BYTES + OVERHEAD);
  const parts = splitParts(body, boundary);
  let certificateId = '';
  let fileNameField = '';
  let fileName = '';
  let mimeType = 'application/octet-stream';
  let bytes: Buffer | null = null;

  for (const part of parts) {
    const splitAt = part.indexOf('\r\n\r\n');
    if (splitAt < 0) {
      continue;
    }
    const headers = part.subarray(0, splitAt).toString('utf8');
    const data = part.subarray(splitAt + 4);
    const disposition = readDisposition(headers);
    if (disposition.name === 'certificateId') {
      certificateId = data.toString('utf8').trim();
      continue;
    }
    if (disposition.name === 'fileName') {
      fileNameField = data.toString('utf8').trim();
      continue;
    }
    if (disposition.filename && !bytes) {
      fileName = disposition.filename;
      mimeType = readContentType(headers);
      bytes = data;
    }
  }

  if (!bytes) {
    throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '请选择课件文件');
  }
  if (bytes.length > COURSEWARE_MAX_BYTES) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.COURSEWARE_TOO_LARGE,
      '单个文件不能超过 50MB',
    );
  }
  return {
    certificateId,
    fileName: fileNameField || fileName || 'upload.bin',
    mimeType,
    bytes,
  };
}

function readBoundary(header: string): string | null {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(header);
  const boundary = (match?.[1] ?? match?.[2] ?? '').trim();
  return boundary || null;
}

function readContentType(headers: string): string {
  const match = /content-type:\s*([^\r\n]+)/i.exec(headers);
  return match?.[1]?.trim() || 'application/octet-stream';
}

function readDisposition(headers: string): { name: string; filename?: string } {
  const block = headers
    .split('\r\n')
    .find((line) => line.toLowerCase().startsWith('content-disposition'));
  if (!block) {
    return { name: '' };
  }
  const name = /(?:^|;)\s*name="([^"]*)"/i.exec(block)?.[1] ?? '';
  const encoded = /filename\*=UTF-8''([^;\s]+)/i.exec(block)?.[1];
  if (encoded) {
    try {
      return { name, filename: decodeURIComponent(encoded) };
    } catch {
      return { name, filename: encoded };
    }
  }
  const quoted = /filename="([^"]*)"/i.exec(block)?.[1];
  return { name, filename: quoted };
}

function splitParts(body: Buffer, boundary: string): Buffer[] {
  const token = Buffer.from(`--${boundary}`);
  const separator = Buffer.from(`\r\n--${boundary}`);
  const parts: Buffer[] = [];
  let offset = body.indexOf(token);
  if (offset < 0) {
    return parts;
  }
  offset += token.length;
  while (offset < body.length) {
    if (body[offset] === 45 && body[offset + 1] === 45) {
      break;
    }
    if (body[offset] === 13 && body[offset + 1] === 10) {
      offset += 2;
    }
    const next = body.indexOf(separator, offset);
    if (next < 0) {
      break;
    }
    parts.push(body.subarray(offset, next));
    offset = next + separator.length;
  }
  return parts;
}

function readLimited(req: Request, max: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    req.on('data', (chunk: Buffer | string) => {
      if (settled) {
        return;
      }
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > max) {
        req.destroy();
        fail(
          new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.COURSEWARE_TOO_LARGE,
            '单个文件不能超过 50MB',
          ),
        );
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', () => {
      fail(new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '上传中断'));
    });
  });
}

function headerValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}
