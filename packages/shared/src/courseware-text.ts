import { inflateRawSync, inflateSync } from 'node:zlib';
import { coursewareExtension } from './courseware';

export class CoursewareTextError extends Error {
  readonly code = 'COURSEWARE_UNREADABLE' as const;

  constructor(message = '没有从课件里读出可用文字') {
    super(message);
    this.name = 'CoursewareTextError';
  }
}

const MAX_ZIP_ENTRIES = 4000;
const MAX_UNCOMPRESSED = 80 * 1024 * 1024;

/** 从 PPT / PPTX / PDF / DOC / DOCX 里抽出纯文本。老格式做字符串提取，不做版式还原。 */
export function extractCoursewareText(fileName: string, bytes: Buffer): string {
  const extension = coursewareExtension(fileName);
  if (!extension) {
    throw new CoursewareTextError('不支持的课件格式');
  }
  if (bytes.length === 0) {
    throw new CoursewareTextError('文件是空的');
  }

  let text = '';
  if (extension === 'pdf') {
    text = extractPdf(bytes);
  } else if (extension === 'docx') {
    text = extractOpenXml(bytes, /<w:t[^>]*>([\s\S]*?)<\/w:t>/gi, 'word/');
  } else if (extension === 'pptx') {
    text = extractOpenXml(bytes, /<a:t[^>]*>([\s\S]*?)<\/a:t>/gi, 'ppt/slides/');
  } else {
    text = scrapeBinaryText(bytes);
  }

  const cleaned = cleanup(text);
  if (cleaned.length < 2) {
    throw new CoursewareTextError('没有从课件里读出可用文字');
  }
  return cleaned;
}

function extractOpenXml(bytes: Buffer, pattern: RegExp, prefix: string): string {
  const files = readZip(bytes).filter(
    (file) => file.name.startsWith(prefix) && file.name.endsWith('.xml'),
  );
  const parts: string[] = [];
  for (const file of files) {
    const xml = file.data.toString('utf8');
    const matches = xml.matchAll(pattern);
    const lines: string[] = [];
    for (const match of matches) {
      const value = decodeXml(match[1] ?? '').trim();
      if (value) {
        lines.push(value);
      }
    }
    if (lines.length > 0) {
      parts.push(lines.join('\n'));
    }
  }
  return parts.join('\n');
}

function extractPdf(bytes: Buffer): string {
  const chunks: string[] = [];
  const streamToken = Buffer.from('stream');
  const endToken = Buffer.from('endstream');
  let offset = 0;
  while (offset < bytes.length) {
    const start = bytes.indexOf(streamToken, offset);
    if (start < 0) {
      break;
    }
    let dataStart = start + streamToken.length;
    if (bytes[dataStart] === 13 && bytes[dataStart + 1] === 10) {
      dataStart += 2;
    } else if (bytes[dataStart] === 10) {
      dataStart += 1;
    }
    const end = bytes.indexOf(endToken, dataStart);
    if (end < 0) {
      break;
    }
    let dataEnd = end;
    if (dataEnd > dataStart && bytes[dataEnd - 1] === 10) {
      dataEnd -= 1;
      if (dataEnd > dataStart && bytes[dataEnd - 1] === 13) {
        dataEnd -= 1;
      }
    }
    const dict = bytes.subarray(Math.max(0, start - 400), start).toString('latin1');
    let data = bytes.subarray(dataStart, dataEnd);
    if (dict.includes('FlateDecode')) {
      data = inflatePdf(data);
    }
    chunks.push(extractPdfStrings(data.toString('latin1')));
    offset = end + endToken.length;
  }
  const joined = chunks.join('\n');
  if (cleanup(joined).length < 2) {
    return extractPdfStrings(bytes.toString('latin1'));
  }
  return joined;
}

function inflatePdf(data: Buffer): Buffer {
  try {
    return inflateRawSync(data);
  } catch {
    try {
      return inflateSync(data);
    } catch {
      return Buffer.alloc(0);
    }
  }
}

function extractPdfStrings(content: string): string {
  const parts: string[] = [];
  for (const match of content.matchAll(/\((?:\\.|[^\\)])*\)/g)) {
    const raw = match[0].slice(1, -1);
    const text = unescapePdf(raw).trim();
    if (text) {
      parts.push(text);
    }
  }
  for (const match of content.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)) {
    const text = decodePdfHex(match[1] ?? '').trim();
    if (text) {
      parts.push(text);
    }
  }
  return parts.join('\n');
}

function unescapePdf(raw: string): string {
  let result = '';
  for (let i = 0; i < raw.length; i += 1) {
    if (raw[i] !== '\\') {
      result += raw[i];
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      break;
    }
    if (next === 'n' || next === 'r') {
      result += '\n';
      i += 1;
      continue;
    }
    if (next === 't') {
      result += '\t';
      i += 1;
      continue;
    }
    if (next === '(' || next === ')' || next === '\\') {
      result += next;
      i += 1;
      continue;
    }
    if (next >= '0' && next <= '7') {
      let octal = next;
      let consumed = 1;
      while (consumed < 3) {
        const digit = raw[i + 1 + consumed];
        if (!digit || digit < '0' || digit > '7') {
          break;
        }
        octal += digit;
        consumed += 1;
      }
      result += String.fromCharCode(Number.parseInt(octal, 8));
      i += consumed;
      continue;
    }
    result += next;
    i += 1;
  }
  return result;
}

function decodePdfHex(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length < 4 || clean.length % 2 !== 0) {
    return '';
  }
  const buf = Buffer.from(clean, 'hex');
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return utf16beToString(buf.subarray(2));
  }
  return buf.toString('latin1');
}

function utf16beToString(buf: Buffer): string {
  const swapped = Buffer.alloc(buf.length - (buf.length % 2));
  for (let i = 0; i + 1 < buf.length; i += 2) {
    swapped[i] = buf[i + 1] ?? 0;
    swapped[i + 1] = buf[i] ?? 0;
  }
  return swapped.toString('utf16le');
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

function readZip(bytes: Buffer): ZipEntry[] {
  const eocd = findEocd(bytes);
  if (eocd < 0) {
    return [];
  }
  const total = bytes.readUInt16LE(eocd + 10);
  const cdOffset = bytes.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  let uncompressedTotal = 0;
  let cursor = cdOffset;
  const count = Math.min(total, MAX_ZIP_ENTRIES);
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > bytes.length || bytes.readUInt32LE(cursor) !== 0x02014b50) {
      break;
    }
    const method = bytes.readUInt16LE(cursor + 10);
    const compSize = bytes.readUInt32LE(cursor + 20);
    const uncompSize = bytes.readUInt32LE(cursor + 24);
    const nameLen = bytes.readUInt16LE(cursor + 28);
    const extraLen = bytes.readUInt16LE(cursor + 30);
    const commentLen = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const name = bytes.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;
    uncompressedTotal += uncompSize;
    if (uncompressedTotal > MAX_UNCOMPRESSED) {
      break;
    }
    if (localOffset + 30 > bytes.length || bytes.readUInt32LE(localOffset) !== 0x04034b50) {
      continue;
    }
    const localNameLen = bytes.readUInt16LE(localOffset + 26);
    const localExtraLen = bytes.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = bytes.subarray(dataStart, dataStart + compSize);
    if (method === 0) {
      entries.push({ name, data: compressed });
      continue;
    }
    if (method === 8) {
      try {
        entries.push({ name, data: inflateRawSync(compressed) });
      } catch {
        continue;
      }
    }
  }
  return entries;
}

function findEocd(bytes: Buffer): number {
  const min = Math.max(0, bytes.length - 22 - 65535);
  for (let i = bytes.length - 22; i >= min; i -= 1) {
    if (bytes.readUInt32LE(i) === 0x06054b50) {
      return i;
    }
  }
  return -1;
}

function scrapeBinaryText(bytes: Buffer): string {
  const aligned = utf16Runs(bytes, 0);
  const shifted = utf16Runs(bytes, 1);
  const utf16 = cjkCount(aligned) >= cjkCount(shifted) ? aligned : shifted;
  const ascii = asciiRuns(bytes);
  if (cjkCount(utf16) > 0 && utf16.length >= ascii.length / 2) {
    return utf16;
  }
  return ascii.length > utf16.length ? ascii : utf16;
}

function utf16Runs(bytes: Buffer, offset: number): string {
  const parts: string[] = [];
  let current = '';
  for (let i = offset; i + 1 < bytes.length; i += 2) {
    const code = bytes[i]! + (bytes[i + 1]! << 8);
    if (isUseful(code)) {
      current += String.fromCharCode(code);
      continue;
    }
    if (current.length >= 2) {
      parts.push(current);
    }
    current = '';
  }
  if (current.length >= 2) {
    parts.push(current);
  }
  return parts.join('\n');
}

function asciiRuns(bytes: Buffer): string {
  const parts: string[] = [];
  let current = '';
  for (const byte of bytes) {
    if (byte >= 32 && byte <= 126) {
      current += String.fromCharCode(byte);
      continue;
    }
    if (current.length >= 4) {
      parts.push(current);
    }
    current = '';
  }
  if (current.length >= 4) {
    parts.push(current);
  }
  return parts.join('\n');
}

function isUseful(code: number): boolean {
  if (code >= 32 && code <= 126) {
    return true;
  }
  if (code >= 0x4e00 && code <= 0x9fff) {
    return true;
  }
  if (code >= 0x3000 && code <= 0x303f) {
    return true;
  }
  return code >= 0xff00 && code <= 0xffef;
}

function cjkCount(text: string): number {
  return text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function cleanup(text: string): string {
  return text
    .replaceAll('\u0000', '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
