import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync, crc32 } from 'node:zlib';
import { describe, test } from 'node:test';
import { COURSEWARE_MAX_BYTES, ApiErrorCode, validateCoursewareFile } from '@tishuashua/shared';
import {
  EXTRACT_FAIL_MARKER,
  createObjectStorage,
  extractCoursewareText,
  mockExtractKnowledgePoints,
  parseExtractedKnowledgePoints,
  readStorageEnv,
} from '@tishuashua/shared/courseware';
import { LlmCallError } from '@tishuashua/shared/generation';
import type { Request } from 'express';
import { Readable } from 'node:stream';
import { readCoursewareMultipart } from './multipart';

describe('courseware parsers', () => {
  test('校验扩展名和 50MB 上限', () => {
    for (const name of ['a.ppt', 'a.pptx', 'a.pdf', 'a.doc', 'a.DOCX']) {
      const ok = validateCoursewareFile({ fileName: name, byteSize: 128 });
      assert.equal(ok.ok, true, name);
    }
    const huge = validateCoursewareFile({
      fileName: 'a.pdf',
      byteSize: COURSEWARE_MAX_BYTES + 1,
    });
    assert.equal(huge.ok, false);
    if (!huge.ok) {
      assert.equal(huge.code, ApiErrorCode.COURSEWARE_TOO_LARGE);
    }
    const exact = validateCoursewareFile({
      fileName: 'a.pdf',
      byteSize: COURSEWARE_MAX_BYTES,
    });
    assert.equal(exact.ok, true);
    const other = validateCoursewareFile({ fileName: 'a.txt', byteSize: 12 });
    assert.equal(other.ok, false);
    if (!other.ok) {
      assert.equal(other.code, ApiErrorCode.COURSEWARE_UNSUPPORTED);
    }
    const empty = validateCoursewareFile({ fileName: 'a.pdf', byteSize: 0 });
    assert.equal(empty.ok, false);
    const sneaky = validateCoursewareFile({ fileName: '../../secret.pdf', byteSize: 4 });
    assert.equal(sneaky.ok, true);
    if (sneaky.ok) {
      assert.equal(sneaky.safeName.includes('..'), false);
      assert.equal(sneaky.safeName, 'secret.pdf');
    }
  });

  test('抽出 pdf、pptx、docx、doc 里的文字', () => {
    assert.match(
      extractCoursewareText('note.pdf', pdfStream('BT (Photosynthesis) Tj ET')),
      /Photosynthesis/,
    );
    const chinese = extractCoursewareText('note.pdf', pdfStream(`BT ${utf16Hex('叶绿体')} Tj ET`));
    assert.match(chinese, /叶绿体/);

    const raw = Buffer.from('BT (Chloroplast) Tj ET');
    const compressed = deflateRawSync(raw);
    const flate = pdfStream(`BT (ignored) Tj ET`, compressed);
    assert.match(extractCoursewareText('flate.pdf', flate), /Chloroplast/);

    const docx = zipStore([
      {
        name: 'word/document.xml',
        data: Buffer.from('<w:document><w:p><w:r><w:t>光合作用</w:t></w:r></w:p></w:document>'),
      },
    ]);
    assert.match(extractCoursewareText('book.docx', docx), /光合作用/);

    const slide = Buffer.from('<p:sld><a:t>牛顿第一定律</a:t></p:sld>');
    const pptx = zipStore([{ name: 'ppt/slides/slide1.xml', data: slide }], true);
    assert.match(extractCoursewareText('deck.pptx', pptx), /牛顿第一定律/);

    const legacy = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
      Buffer.from('细胞呼吸', 'utf16le'),
      Buffer.from([0, 0]),
    ]);
    assert.match(extractCoursewareText('old.doc', legacy), /细胞呼吸/);
    assert.match(extractCoursewareText('old.ppt', legacy), /细胞呼吸/);
  });

  test('mock 成功和失败标记', () => {
    const drafts = mockExtractKnowledgePoints('光合作用\n细胞呼吸');
    assert.deepEqual(
      drafts.map((item) => item.name),
      ['光合作用', '细胞呼吸'],
    );
    assert.throws(
      () => mockExtractKnowledgePoints(`说明\n${EXTRACT_FAIL_MARKER}`),
      (error: unknown) => error instanceof LlmCallError && error.code === 'LLM_INVALID_OUTPUT',
    );
    const parsed = parseExtractedKnowledgePoints({
      knowledgePoints: [{ name: '叶绿体', promptHint: '考结构', excerpt: '叶绿体' }],
    });
    assert.equal(parsed[0]?.name, '叶绿体');
    assert.throws(() => parseExtractedKnowledgePoints({ knowledgePoints: [] }), LlmCallError);
  });

  test('本地对象存储可读写，拒绝路径穿越', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'courseware-store-'));
    const previous = {
      endpoint: process.env.OSS_ENDPOINT,
      bucket: process.env.OSS_BUCKET,
      id: process.env.OSS_ACCESS_KEY_ID,
      secret: process.env.OSS_ACCESS_KEY_SECRET,
      local: process.env.OSS_LOCAL_DIR,
    };
    process.env.OSS_ENDPOINT = '';
    process.env.OSS_BUCKET = '';
    process.env.OSS_ACCESS_KEY_ID = '';
    process.env.OSS_ACCESS_KEY_SECRET = '';
    process.env.OSS_LOCAL_DIR = dir;
    try {
      const storage = createObjectStorage(readStorageEnv());
      await storage.put('courseware/user/file.pdf', Buffer.from('pdf-bytes'), 'application/pdf');
      assert.equal((await storage.get('courseware/user/file.pdf')).toString(), 'pdf-bytes');
      await storage.delete('courseware/user/file.pdf');
      await assert.rejects(() => storage.get('courseware/../secret'));
    } finally {
      restoreEnv('OSS_ENDPOINT', previous.endpoint);
      restoreEnv('OSS_BUCKET', previous.bucket);
      restoreEnv('OSS_ACCESS_KEY_ID', previous.id);
      restoreEnv('OSS_ACCESS_KEY_SECRET', previous.secret);
      restoreEnv('OSS_LOCAL_DIR', previous.local);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('multipart 读出证书、文件名和内容', async () => {
    const form = new FormData();
    form.set('certificateId', '11111111-1111-4111-8111-111111111201');
    form.set('fileName', '光合作用.docx');
    form.set('file', new Blob([Buffer.from('hello-docx')]), 'ignored.docx');
    const request = new Request('http://127.0.0.1/api/courseware/uploads', {
      method: 'POST',
      body: form,
    });
    const contentType = request.headers.get('content-type') ?? '';
    const raw = Buffer.from(await request.arrayBuffer());
    const parsed = await readCoursewareMultipart(fakeRequest(raw, contentType));
    assert.equal(parsed.certificateId, '11111111-1111-4111-8111-111111111201');
    assert.equal(parsed.fileName, '光合作用.docx');
    assert.equal(parsed.bytes.toString(), 'hello-docx');
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

function fakeRequest(body: Buffer, contentType: string): Request {
  const stream = Readable.from([body]);
  return Object.assign(stream, { headers: { 'content-type': contentType } }) as unknown as Request;
}

function pdfStream(contents: string, compressed?: Buffer): Buffer {
  const stream = compressed ?? Buffer.from(contents);
  const filter = compressed ? '/Filter /FlateDecode ' : '';
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >> endobj\n',
    `4 0 obj << /Length ${stream.length} ${filter}>> stream\n`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const streamStart = Buffer.byteLength(body);
  const prefix = Buffer.from(body);
  const suffix = Buffer.from('\nendstream endobj\n');
  const xrefAt = prefix.length + stream.length + suffix.length;
  let xref = `xref\n0 5\n0000000000 65535 f \n`;
  for (let index = 1; index <= 4; index += 1) {
    const at = index === 4 ? streamStart - Buffer.byteLength(objects[3]!) : offsets[index]!;
    xref += `${String(at).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer << /Size 5 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return Buffer.concat([prefix, stream, suffix, Buffer.from(xref + trailer)]);
}

function utf16Hex(text: string): string {
  const le = Buffer.from(text, 'utf16le');
  const be = Buffer.alloc(2 + le.length);
  be[0] = 0xfe;
  be[1] = 0xff;
  for (let i = 0; i + 1 < le.length; i += 2) {
    be[2 + i] = le[i + 1]!;
    be[2 + i + 1] = le[i]!;
  }
  return `<${be.toString('hex')}>`;
}

function zipStore(files: { name: string; data: Buffer }[], deflate = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const stored = deflate ? deflateRawSync(file.data) : file.data;
    const method = deflate ? 8 : 0;
    const checksum = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum >>> 0, 14);
    local.writeUInt32LE(stored.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, stored]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum >>> 0, 16);
    central.writeUInt32LE(stored.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localFull);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}
