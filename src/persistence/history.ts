import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import type { HistoryEntry } from './types.js';
import { HISTORY_FILE } from '../utils/constants.js';

export class HistoryLogger {
  private readonly filePath: string;

  constructor(dataDir: string) {
    this.filePath = join(dataDir, HISTORY_FILE);
  }

  async append(entry: HistoryEntry): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.filePath, line, 'utf-8');
  }

  async getRecent(count: number): Promise<HistoryEntry[]> {
    const lines = await this.readLines();
    return lines.slice(-count).map((line) => JSON.parse(line) as HistoryEntry);
  }

  async getTotalCost(): Promise<number> {
    const lines = await this.readLines();
    return lines.reduce((sum, line) => {
      try {
        const entry = JSON.parse(line) as HistoryEntry;
        return sum + (entry.costUsd ?? 0);
      } catch {
        return sum;
      }
    }, 0);
  }

  async getCount(): Promise<number> {
    const lines = await this.readLines();
    return lines.length;
  }

  private async readLines(): Promise<string[]> {
    try {
      const content = await readFile(this.filePath, 'utf-8');
      return content.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
}
