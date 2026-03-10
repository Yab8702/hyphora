import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FileHandler } from '../../src/channel/file-handler.js';
import { Sandbox } from '../../src/security/sandbox.js';
import { mkdir, rm, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('FileHandler', () => {
  let testDir: string;
  let uploadDir: string;
  let projectDir: string;
  let sandbox: Sandbox;
  let handler: FileHandler;

  beforeEach(async () => {
    testDir = join(tmpdir(), `hyphora-file-test-${Date.now()}`);
    uploadDir = join(testDir, 'uploads');
    projectDir = testDir;
    await mkdir(testDir, { recursive: true });
    sandbox = new Sandbox(testDir);
    handler = new FileHandler(uploadDir, projectDir, sandbox);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('saves text files to upload directory', async () => {
    const content = Buffer.from('console.log("hello");');
    const result = await handler.handleUpload(content, 'test.ts');
    expect(result.success).toBe(true);
    expect(result.filePath).toContain('test.ts');
    const saved = await readFile(result.filePath!, 'utf-8');
    expect(saved).toBe('console.log("hello");');
  });

  it('saves markdown files', async () => {
    const content = Buffer.from('# README');
    const result = await handler.handleUpload(content, 'README.md');
    expect(result.success).toBe(true);
  });

  it('saves unknown extensions to uploads dir', async () => {
    const content = Buffer.from('binary data');
    const result = await handler.handleUpload(content, 'image.png');
    expect(result.success).toBe(true);
    expect(result.filePath).toContain('image.png');
  });

  it('rejects files exceeding size limit', async () => {
    const smallHandler = new FileHandler(uploadDir, projectDir, sandbox, 0.001); // ~1KB
    const content = Buffer.alloc(2000); // 2KB
    const result = await smallHandler.handleUpload(content, 'big.txt');
    expect(result.success).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('handles zip files when adm-zip is available', async () => {
    // Try dynamic import of adm-zip to check if available
    try {
      await import('adm-zip');
    } catch {
      // adm-zip not installed, skip test
      return;
    }

    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip();
    zip.addFile('hello.txt', Buffer.from('Hello World'));
    zip.addFile('src/index.ts', Buffer.from('export default 42;'));
    const zipBuffer = zip.toBuffer();

    const result = await handler.handleUpload(zipBuffer, 'project.zip');
    expect(result.success).toBe(true);
    expect(result.fileCount).toBe(2);
    expect(result.extractedDir).toBeTruthy();
  });

  it('creates upload directory if not exists', async () => {
    const newUploadDir = join(testDir, 'new-uploads');
    const h = new FileHandler(newUploadDir, projectDir, sandbox);
    const result = await h.handleUpload(Buffer.from('data'), 'test.txt');
    expect(result.success).toBe(true);
    expect(existsSync(newUploadDir)).toBe(true);
  });
});
