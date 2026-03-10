import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { HistoryLogger } from '../../src/persistence/history.js';
import type { HistoryEntry } from '../../src/persistence/types.js';

const TEST_DIR = join(process.cwd(), '.test-history');

function makeEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    id: 'test-1',
    source: 'telegram',
    prompt: 'Fix the bug',
    result: 'Bug fixed',
    success: true,
    sessionId: 'sess-1',
    costUsd: 0.5,
    durationMs: 5000,
    numTurns: 3,
    timestamp: '2026-02-21T12:00:00.000Z',
    ...overrides,
  };
}

beforeEach(async () => {
  await mkdir(TEST_DIR, { recursive: true });
});

afterEach(async () => {
  await rm(TEST_DIR, { recursive: true, force: true });
});

describe('HistoryLogger', () => {
  it('appends and reads back entries', async () => {
    const logger = new HistoryLogger(TEST_DIR);
    await logger.append(makeEntry({ id: 'e1', costUsd: 0.25 }));
    await logger.append(makeEntry({ id: 'e2', costUsd: 0.75 }));

    const recent = await logger.getRecent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0].id).toBe('e1');
    expect(recent[1].id).toBe('e2');
  });

  it('getRecent returns only last N entries', async () => {
    const logger = new HistoryLogger(TEST_DIR);
    for (let i = 0; i < 10; i++) {
      await logger.append(makeEntry({ id: `e${i}` }));
    }

    const recent = await logger.getRecent(3);
    expect(recent).toHaveLength(3);
    expect(recent[0].id).toBe('e7');
    expect(recent[1].id).toBe('e8');
    expect(recent[2].id).toBe('e9');
  });

  it('getTotalCost sums all entries', async () => {
    const logger = new HistoryLogger(TEST_DIR);
    await logger.append(makeEntry({ costUsd: 0.25 }));
    await logger.append(makeEntry({ costUsd: 0.50 }));
    await logger.append(makeEntry({ costUsd: 1.00 }));

    const total = await logger.getTotalCost();
    expect(total).toBeCloseTo(1.75);
  });

  it('getCount returns total entries', async () => {
    const logger = new HistoryLogger(TEST_DIR);
    await logger.append(makeEntry());
    await logger.append(makeEntry());

    const count = await logger.getCount();
    expect(count).toBe(2);
  });

  it('returns empty results when file does not exist', async () => {
    const logger = new HistoryLogger(join(TEST_DIR, 'nonexistent'));
    expect(await logger.getRecent(5)).toEqual([]);
    expect(await logger.getTotalCost()).toBe(0);
    expect(await logger.getCount()).toBe(0);
  });

  it('creates directory if it does not exist', async () => {
    const nestedDir = join(TEST_DIR, 'nested', 'deep');
    const logger = new HistoryLogger(nestedDir);
    await logger.append(makeEntry());

    const recent = await logger.getRecent(1);
    expect(recent).toHaveLength(1);
  });

  it('preserves error field in entries', async () => {
    const logger = new HistoryLogger(TEST_DIR);
    await logger.append(
      makeEntry({ success: false, error: 'Rate limit exceeded' }),
    );

    const recent = await logger.getRecent(1);
    expect(recent[0].success).toBe(false);
    expect(recent[0].error).toBe('Rate limit exceeded');
  });
});
