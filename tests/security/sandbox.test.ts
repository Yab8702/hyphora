import { describe, it, expect } from 'vitest';
import { Sandbox } from '../../src/security/sandbox.js';
import { SecurityError } from '../../src/utils/errors.js';
import { resolve } from 'node:path';

describe('Sandbox', () => {
  it('allows paths within agent cwd', () => {
    const sandbox = new Sandbox('/projects/myapp');
    const result = sandbox.validate('/projects/myapp/src/index.ts');
    expect(result).toBe(resolve('/projects/myapp/src/index.ts'));
  });

  it('allows the cwd directory itself', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(() => sandbox.validate('/projects/myapp')).not.toThrow();
  });

  it('blocks paths outside cwd', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(() => sandbox.validate('/etc/passwd')).toThrow(SecurityError);
  });

  it('blocks path traversal attacks', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(() =>
      sandbox.validate('/projects/myapp/../../etc/passwd'),
    ).toThrow(SecurityError);
  });

  it('blocks relative path traversal', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(() => sandbox.validate('../../../etc/shadow')).toThrow(SecurityError);
  });

  it('allows explicit allowedDirectories', () => {
    const sandbox = new Sandbox('/projects/myapp', [
      '/projects/myapp',
      '/projects/shared-libs',
    ]);
    expect(() =>
      sandbox.validate('/projects/shared-libs/utils.ts'),
    ).not.toThrow();
  });

  it('blocks paths not in allowedDirectories', () => {
    const sandbox = new Sandbox('/projects/myapp', ['/projects/myapp']);
    expect(() => sandbox.validate('/tmp/malicious')).toThrow(SecurityError);
  });

  it('isAllowed returns boolean', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(sandbox.isAllowed('/projects/myapp/src/index.ts')).toBe(true);
    expect(sandbox.isAllowed('/etc/passwd')).toBe(false);
  });

  it('handles deeply nested paths', () => {
    const sandbox = new Sandbox('/projects/myapp');
    expect(
      sandbox.isAllowed('/projects/myapp/a/b/c/d/e/f/g.ts'),
    ).toBe(true);
  });

  it('security error has correct code', () => {
    const sandbox = new Sandbox('/projects/myapp');
    try {
      sandbox.validate('/etc/passwd');
    } catch (err) {
      expect(err).toBeInstanceOf(SecurityError);
      expect((err as SecurityError).code).toBe('SECURITY_ERROR');
    }
  });
});
