import { createHash } from 'node:crypto';

export type Hasher = (bytes: Buffer) => string;

export const sha256: Hasher = (bytes) => createHash('sha256').update(bytes).digest('hex');
