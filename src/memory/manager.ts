import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { MEMORY_DIR } from '../utils/constants.js';
import type { MemoryProvider } from '../agent/prompt-builder.js';

export class MemoryManager implements MemoryProvider {
  private readonly memoryDir: string;

  constructor(dataDir: string) {
    this.memoryDir = join(dataDir, MEMORY_DIR);
  }

  async ensureDir(): Promise<void> {
    if (!existsSync(this.memoryDir)) {
      await mkdir(this.memoryDir, { recursive: true });
    }
  }

  async read(name: string): Promise<string> {
    try {
      return await readFile(join(this.memoryDir, name), 'utf-8');
    } catch {
      return '';
    }
  }

  async append(name: string, content: string): Promise<void> {
    await this.ensureDir();
    const entry = `\n\n## ${new Date().toISOString()}\n${content}`;
    await appendFile(join(this.memoryDir, name), entry, 'utf-8');
  }

  async write(name: string, content: string): Promise<void> {
    await this.ensureDir();
    await writeFile(join(this.memoryDir, name), content, 'utf-8');
  }

  async listFiles(): Promise<string[]> {
    if (!existsSync(this.memoryDir)) {
      return [];
    }
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(this.memoryDir);
    return entries.filter((e) => e.endsWith('.md'));
  }

  /**
   * Synchronous read for prompt building.
   * Reads all configured memory files up to maxChars total.
   */
  getAllMemory(maxChars: number, files?: string[]): string {
    const fileList = files ?? ['general.md', 'decisions.md', 'learnings.md'];
    const parts: string[] = [];
    let totalChars = 0;

    for (const file of fileList) {
      try {
        const fullPath = join(this.memoryDir, file);
        if (!existsSync(fullPath)) continue;
        const content = readFileSync(fullPath, 'utf-8').trim();
        if (!content) continue;

        if (totalChars + content.length > maxChars) {
          const remaining = maxChars - totalChars;
          if (remaining > 50) {
            parts.push(
              `### ${file}\n${content.slice(0, remaining)}...(truncated)`,
            );
          }
          break;
        }
        parts.push(`### ${file}\n${content}`);
        totalChars += content.length;
      } catch {
        continue;
      }
    }

    return parts.join('\n\n');
  }
}
