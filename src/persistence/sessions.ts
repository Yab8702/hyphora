import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

interface SessionData {
  [chatId: string]: {
    sessionId: string;
    timestamp: number;
  };
}

/**
 * Persists session IDs to disk so they survive daemon restarts.
 * Claude Code can resume sessions using --resume <sessionId>.
 */
export class SessionStore {
  private readonly filePath: string;
  private data: SessionData = {};

  constructor(dataDir: string) {
    this.filePath = join(dataDir, 'sessions.json');
  }

  async load(): Promise<void> {
    try {
      if (existsSync(this.filePath)) {
        const raw = await readFile(this.filePath, 'utf-8');
        this.data = JSON.parse(raw);
      }
    } catch {
      this.data = {};
    }
  }

  get(chatId: number): { sessionId: string; timestamp: number } | undefined {
    return this.data[String(chatId)];
  }

  async set(chatId: number, sessionId: string): Promise<void> {
    this.data[String(chatId)] = {
      sessionId,
      timestamp: Date.now(),
    };
    await this.save();
  }

  async clear(chatId: number): Promise<void> {
    delete this.data[String(chatId)];
    await this.save();
  }

  private async save(): Promise<void> {
    const dir = dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }
}
