import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RegistrationManager } from '../../src/auth/registration.js';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('RegistrationManager', () => {
  let testDir: string;
  let filePath: string;
  let manager: RegistrationManager;

  beforeEach(async () => {
    testDir = join(tmpdir(), `hyphora-reg-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    filePath = join(testDir, 'registered-users.json');
    manager = new RegistrationManager(filePath);
  });

  afterEach(async () => {
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  });

  it('registers first user as owner', async () => {
    const result = await manager.register('telegram', '123', '456');
    expect(result.registered).toBe(true);
    expect(result.isOwner).toBe(true);
    expect(result.alreadyRegistered).toBe(false);
  });

  it('registers second user as non-owner', async () => {
    await manager.register('telegram', '111', '111');
    const result = await manager.register('telegram', '222', '222');
    expect(result.registered).toBe(true);
    expect(result.isOwner).toBe(false);
    expect(result.alreadyRegistered).toBe(false);
  });

  it('detects already registered user', async () => {
    await manager.register('telegram', '123', '456');
    const result = await manager.register('telegram', '123', '456');
    expect(result.alreadyRegistered).toBe(true);
    expect(result.isOwner).toBe(true);
  });

  it('checks if user is registered', async () => {
    await manager.register('telegram', '123', '456');
    expect(manager.isRegistered('telegram', '123')).toBe(true);
    expect(manager.isRegistered('telegram', '999')).toBe(false);
  });

  it('checks if user is owner', async () => {
    await manager.register('telegram', '123', '456');
    await manager.register('telegram', '789', '789');
    expect(manager.isOwner('telegram', '123')).toBe(true);
    expect(manager.isOwner('telegram', '789')).toBe(false);
  });

  it('returns user count', async () => {
    expect(manager.userCount).toBe(0);
    await manager.register('telegram', '123', '456');
    expect(manager.userCount).toBe(1);
    await manager.register('discord', '789', '789');
    expect(manager.userCount).toBe(2);
  });

  it('persists and reloads data', async () => {
    await manager.register('telegram', '123', '456');
    await manager.register('telegram', '789', '789');

    // Create a new manager pointing to the same file
    const manager2 = new RegistrationManager(filePath);
    await manager2.load();

    expect(manager2.userCount).toBe(2);
    expect(manager2.isOwner('telegram', '123')).toBe(true);
    expect(manager2.isRegistered('telegram', '789')).toBe(true);
  });

  it('handles missing file gracefully', async () => {
    const mgr = new RegistrationManager(join(testDir, 'nonexistent.json'));
    await mgr.load();
    expect(mgr.userCount).toBe(0);
  });

  it('separates users by channel type', async () => {
    await manager.register('telegram', '123', '456');
    expect(manager.isRegistered('telegram', '123')).toBe(true);
    expect(manager.isRegistered('discord', '123')).toBe(false);
  });

  it('returns user list', async () => {
    await manager.register('telegram', '123', '456');
    const users = manager.getUsers();
    expect(users).toHaveLength(1);
    expect(users[0].channelType).toBe('telegram');
    expect(users[0].userId).toBe('123');
    expect(users[0].registeredAt).toBeTruthy();
  });
});
