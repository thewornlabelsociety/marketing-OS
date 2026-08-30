import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import { db } from '../../db/database';

const ALGORITHM = 'aes-256-gcm';

function deriveKey(): Buffer {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY ?? process.env.META_APP_SECRET ?? 'local-dev-credential-key-not-for-production';
  return createHash('sha256').update(secret).digest();
}

interface CredentialRow {
  id: string;
  workspace_id: string;
  connection_id: string;
  credential_type: string;
  encrypted_value: string;
}

function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, deriveKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(':');
  const decipher = createDecipheriv(ALGORITHM, deriveKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export class CredentialVault {
  store(workspaceId: string, connectionId: string, credentialType: string, value: string): string {
    const ref = `cred_${randomUUID()}`;
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO provider_credentials (id, workspace_id, connection_id, credential_type, encrypted_value, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ref, workspaceId, connectionId, credentialType, encrypt(value), now, now);
    return ref;
  }

  update(ref: string, workspaceId: string, value: string): boolean {
    const row = db.prepare('SELECT id FROM provider_credentials WHERE id = ? AND workspace_id = ?').get(ref, workspaceId);
    if (!row) return false;
    db.prepare('UPDATE provider_credentials SET encrypted_value = ?, updated_at = ? WHERE id = ?')
      .run(encrypt(value), new Date().toISOString(), ref);
    return true;
  }

  read(ref: string, workspaceId: string): string | null {
    const row = db.prepare('SELECT encrypted_value FROM provider_credentials WHERE id = ? AND workspace_id = ?')
      .get(ref, workspaceId) as { encrypted_value: string } | undefined;
    if (!row) return null;
    return decrypt(row.encrypted_value);
  }

  deleteForConnection(connectionId: string, workspaceId: string): void {
    db.prepare('DELETE FROM provider_credentials WHERE connection_id = ? AND workspace_id = ?').run(connectionId, workspaceId);
  }

  /** Test helper — never expose via API. */
  clearAll(): void {
    db.prepare('DELETE FROM provider_credentials').run();
  }
}

export const credentialVault = new CredentialVault();
