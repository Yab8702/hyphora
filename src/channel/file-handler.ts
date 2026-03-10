import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import type { Sandbox } from '../security/sandbox.js';

export interface FileUploadResult {
  success: boolean;
  filePath?: string;
  extractedDir?: string;
  error?: string;
  fileCount?: number;
}

const ALLOWED_TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.yaml', '.yml', '.toml',
  '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.go',
  '.rs', '.java', '.kt', '.swift', '.c', '.cpp', '.h',
  '.css', '.scss', '.html', '.xml', '.sql', '.sh',
  '.env', '.gitignore', '.dockerfile', '.csv', '.log',
]);

const ALLOWED_ARCHIVE_EXTENSIONS = new Set(['.zip']);

const _MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB default — reserved for future upload validation

/**
 * Handles file uploads from channels.
 * Supports text files (saved directly) and zip archives (extracted).
 */
export class FileHandler {
  constructor(
    private readonly uploadDir: string,
    private readonly projectDir: string,
    private readonly sandbox: Sandbox,
    private readonly maxSizeMb: number = 50,
  ) {}

  /**
   * Process an uploaded file.
   */
  async handleUpload(
    fileBuffer: Buffer,
    fileName: string,
  ): Promise<FileUploadResult> {
    const ext = extname(fileName).toLowerCase();
    const maxSize = this.maxSizeMb * 1024 * 1024;

    if (fileBuffer.length > maxSize) {
      return {
        success: false,
        error: `File too large: ${(fileBuffer.length / 1024 / 1024).toFixed(1)}MB exceeds ${this.maxSizeMb}MB limit`,
      };
    }

    if (ALLOWED_ARCHIVE_EXTENSIONS.has(ext)) {
      return this.handleArchive(fileBuffer, fileName);
    }

    if (ALLOWED_TEXT_EXTENSIONS.has(ext)) {
      return this.handleTextFile(fileBuffer, fileName);
    }

    // Unknown extension — save as-is to uploads dir
    return this.saveToUploads(fileBuffer, fileName);
  }

  private async handleTextFile(
    buffer: Buffer,
    fileName: string,
  ): Promise<FileUploadResult> {
    const targetPath = join(this.uploadDir, fileName);

    try {
      await mkdir(this.uploadDir, { recursive: true });
      await writeFile(targetPath, buffer);
      return { success: true, filePath: targetPath };
    } catch (err) {
      return {
        success: false,
        error: `Failed to save file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async handleArchive(
    buffer: Buffer,
    fileName: string,
  ): Promise<FileUploadResult> {
    try {
      // Dynamic import so adm-zip is optional
      const AdmZip = (await import('adm-zip')).default;
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries();

      // Validate all paths before extracting
      const extractDir = join(this.projectDir, 'uploads', basename(fileName, extname(fileName)));

      for (const entry of entries) {
        const targetPath = join(extractDir, entry.entryName);
        // Validate against sandbox
        if (!this.sandbox.isAllowed(targetPath)) {
          return {
            success: false,
            error: `Archive contains path traversal: ${entry.entryName}`,
          };
        }
      }

      await mkdir(extractDir, { recursive: true });
      zip.extractAllTo(extractDir, true);

      return {
        success: true,
        extractedDir: extractDir,
        fileCount: entries.filter((e: { isDirectory: boolean }) => !e.isDirectory).length,
      };
    } catch (err) {
      if (
        err instanceof Error &&
        (err.message.includes('Cannot find module') ||
          err.message.includes('adm-zip'))
      ) {
        return {
          success: false,
          error: 'Zip support requires adm-zip package. Install with: pnpm add adm-zip',
        };
      }
      return {
        success: false,
        error: `Failed to extract archive: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  private async saveToUploads(
    buffer: Buffer,
    fileName: string,
  ): Promise<FileUploadResult> {
    const targetPath = join(this.uploadDir, fileName);
    try {
      await mkdir(this.uploadDir, { recursive: true });
      await writeFile(targetPath, buffer);
      return { success: true, filePath: targetPath };
    } catch (err) {
      return {
        success: false,
        error: `Failed to save file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
