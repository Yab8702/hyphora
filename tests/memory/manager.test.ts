import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MemoryManager } from '../../src/memory/manager.js';

const TEST_DIR = join(process.cwd(), '.test-memory');
const MEMORY_SUBDIR = join(TEST_DIR, 'memory');

beforeEach(async () => {
  await mkdir(MEMORY_SUBDIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('MemoryManager', () => {
  it('reads a file that exists', async () => {
    await writeFile(join(MEMORY_SUBDIR, 'general.md'), 'Test content', 'utf-8');
    const mgr = new MemoryManager(TEST_DIR);
    const content = await mgr.read('general.md');
    expect(content).toBe('Test content');
  });

  it('returns empty string for non-existent file', async () => {
    const mgr = new MemoryManager(TEST_DIR);
    const content = await mgr.read('nonexistent.md');
    expect(content).toBe('');
  });

  it('appends content with timestamp', async () => {
    const mgr = new MemoryManager(TEST_DIR);
    await mgr.append('general.md', 'First note');
    await mgr.append('general.md', 'Second note');

    const content = await mgr.read('general.md');
    expect(content).toContain('First note');
    expect(content).toContain('Second note');
    expect(content).toContain('##'); // timestamp headers
  });

  it('writes (overwrites) content', async () => {
    const mgr = new MemoryManager(TEST_DIR);
    await mgr.write('test.md', 'Original');
    await mgr.write('test.md', 'Replaced');

    const content = await mgr.read('test.md');
    expect(content).toBe('Replaced');
  });

  it('creates directory if it does not exist', async () => {
    const nestedDir = join(TEST_DIR, 'nested');
    const mgr = new MemoryManager(nestedDir);
    await mgr.append('test.md', 'Content');

    const content = await mgr.read('test.md');
    expect(content).toContain('Content');
  });

  it('lists markdown files', async () => {
    await writeFile(join(MEMORY_SUBDIR, 'a.md'), 'A', 'utf-8');
    await writeFile(join(MEMORY_SUBDIR, 'b.md'), 'B', 'utf-8');
    await writeFile(join(MEMORY_SUBDIR, 'c.txt'), 'C', 'utf-8');

    const mgr = new MemoryManager(TEST_DIR);
    const files = await mgr.listFiles();
    expect(files).toContain('a.md');
    expect(files).toContain('b.md');
    expect(files).not.toContain('c.txt');
  });

  it('returns empty list when directory does not exist', async () => {
    const mgr = new MemoryManager(join(TEST_DIR, 'nonexistent'));
    const files = await mgr.listFiles();
    expect(files).toEqual([]);
  });

  describe('getAllMemory', () => {
    it('reads and concatenates configured files', async () => {
      await writeFile(join(MEMORY_SUBDIR, 'general.md'), 'General notes', 'utf-8');
      await writeFile(join(MEMORY_SUBDIR, 'decisions.md'), 'Decision log', 'utf-8');

      const mgr = new MemoryManager(TEST_DIR);
      const result = mgr.getAllMemory(10000, ['general.md', 'decisions.md']);
      expect(result).toContain('### general.md');
      expect(result).toContain('General notes');
      expect(result).toContain('### decisions.md');
      expect(result).toContain('Decision log');
    });

    it('truncates when exceeding maxChars', async () => {
      await writeFile(
        join(MEMORY_SUBDIR, 'general.md'),
        'A'.repeat(500),
        'utf-8',
      );
      await writeFile(
        join(MEMORY_SUBDIR, 'decisions.md'),
        'B'.repeat(500),
        'utf-8',
      );

      const mgr = new MemoryManager(TEST_DIR);
      const result = mgr.getAllMemory(600, ['general.md', 'decisions.md']);
      expect(result).toContain('truncated');
      expect(result.length).toBeLessThan(800); // headers + truncation
    });

    it('skips files that do not exist', async () => {
      await writeFile(join(MEMORY_SUBDIR, 'general.md'), 'Notes', 'utf-8');

      const mgr = new MemoryManager(TEST_DIR);
      const result = mgr.getAllMemory(10000, [
        'general.md',
        'nonexistent.md',
      ]);
      expect(result).toContain('Notes');
      expect(result).not.toContain('nonexistent');
    });

    it('returns empty string when no files exist', async () => {
      const mgr = new MemoryManager(join(TEST_DIR, 'empty'));
      const result = mgr.getAllMemory(10000);
      expect(result).toBe('');
    });

    it('skips empty files', async () => {
      await writeFile(join(MEMORY_SUBDIR, 'general.md'), '', 'utf-8');
      await writeFile(join(MEMORY_SUBDIR, 'decisions.md'), 'Content', 'utf-8');

      const mgr = new MemoryManager(TEST_DIR);
      const result = mgr.getAllMemory(10000, ['general.md', 'decisions.md']);
      expect(result).not.toContain('### general.md');
      expect(result).toContain('### decisions.md');
    });
  });
});
