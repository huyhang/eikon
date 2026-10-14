import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/** Holds the session-signing secret. */
export interface SecretStore {
  current(): string;
  /** Replaces the secret with a fresh one and returns it. */
  rotate(): string;
}

export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Keeps the secret in a file (mode 0600), creating it on first use. */
export class FileSecretStore implements SecretStore {
  constructor(private readonly file: string) {}

  current(): string {
    if (existsSync(this.file)) return readFileSync(this.file, 'utf8').trim();
    return this.rotate();
  }

  rotate(): string {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const secret = newSecret();
    writeFileSync(this.file, secret, { mode: 0o600 });
    return secret;
  }
}

/** In-memory store for tests and tools. */
export class MemorySecretStore implements SecretStore {
  constructor(private secret = 'test-secret') {}

  current(): string {
    return this.secret;
  }

  rotate(): string {
    this.secret = newSecret();
    return this.secret;
  }
}
