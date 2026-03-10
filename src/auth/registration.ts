import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export interface RegisteredUser {
  channelType: string;
  userId: string;
  channelId: string;
  registeredAt: string;
  isOwner: boolean;
}

/**
 * Manages user registration for auto-registration flow.
 * First user to /start becomes the owner.
 * Persists to data/registered-users.json.
 */
export class RegistrationManager {
  private users: RegisteredUser[] = [];
  private loaded = false;

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const data = await readFile(this.filePath, 'utf-8');
      this.users = JSON.parse(data);
    } catch {
      this.users = [];
    }
    this.loaded = true;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(this.users, null, 2), 'utf-8');
  }

  /**
   * Register a user. First user becomes owner.
   * Returns { registered, isOwner, alreadyRegistered }
   */
  async register(
    channelType: string,
    userId: string,
    channelId: string,
  ): Promise<{ registered: boolean; isOwner: boolean; alreadyRegistered: boolean }> {
    if (!this.loaded) await this.load();

    const existing = this.users.find(
      (u) => u.channelType === channelType && u.userId === userId,
    );
    if (existing) {
      return { registered: true, isOwner: existing.isOwner, alreadyRegistered: true };
    }

    const isOwner = this.users.length === 0;
    const user: RegisteredUser = {
      channelType,
      userId,
      channelId,
      registeredAt: new Date().toISOString(),
      isOwner,
    };
    this.users.push(user);
    await this.save();

    return { registered: true, isOwner, alreadyRegistered: false };
  }

  /**
   * Check if a user is registered.
   */
  isRegistered(channelType: string, userId: string): boolean {
    return this.users.some(
      (u) => u.channelType === channelType && u.userId === userId,
    );
  }

  /**
   * Check if a user is the owner.
   */
  isOwner(channelType: string, userId: string): boolean {
    return this.users.some(
      (u) => u.channelType === channelType && u.userId === userId && u.isOwner,
    );
  }

  /**
   * Get the list of registered users.
   */
  getUsers(): readonly RegisteredUser[] {
    return this.users;
  }

  /**
   * Get count of registered users.
   */
  get userCount(): number {
    return this.users.length;
  }
}
