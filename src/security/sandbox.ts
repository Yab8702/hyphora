import { resolve, normalize, sep } from 'node:path';
import { SecurityError } from '../utils/errors.js';

/**
 * Directory sandbox — validates that paths stay within allowed directories.
 * Prevents path traversal attacks (../../etc/passwd).
 */
export class Sandbox {
  private readonly allowedDirs: string[];

  constructor(agentCwd: string, allowedDirectories: string[] = []) {
    // If no explicit allowlist, only allow the agent cwd
    const dirs = allowedDirectories.length > 0 ? allowedDirectories : [agentCwd];
    // Normalize all paths to absolute with trailing separator
    this.allowedDirs = dirs.map((d) => {
      const abs = resolve(d);
      return abs.endsWith(sep) ? abs : abs + sep;
    });
  }

  /**
   * Validates that a path is within the sandbox.
   * Throws SecurityError if the path escapes the sandbox.
   */
  validate(targetPath: string): string {
    const abs = resolve(normalize(targetPath));

    for (const allowed of this.allowedDirs) {
      // Check if the absolute path starts with an allowed directory,
      // or IS the allowed directory (without trailing sep)
      const allowedBase = allowed.endsWith(sep) ? allowed.slice(0, -1) : allowed;
      if (abs === allowedBase || abs.startsWith(allowed)) {
        return abs;
      }
    }

    throw new SecurityError(
      `Path "${targetPath}" is outside allowed directories: ${this.allowedDirs.map((d) => d.slice(0, -1)).join(', ')}`,
    );
  }

  /**
   * Check if a path is within the sandbox without throwing.
   */
  isAllowed(targetPath: string): boolean {
    try {
      this.validate(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}
