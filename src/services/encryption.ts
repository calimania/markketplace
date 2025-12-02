/**
 * Encryption service for sensitive extension credentials
 *
 * Architecture:
 * - Uses AES-256-CBC encryption with crypto package (Node.js built-in)
 * - Stores encrypted data in extension.credentials JSON field
 * - Plain searchable fields in extension.config
 * - Encryption key stored in environment variable
 *
 * Usage:
 * - Encrypt API keys, passwords, tokens in credentials
 * - Leave URLs, usernames, IDs in config (searchable)
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Get encryption key from environment
 * Must be 32 bytes (64 hex characters) for AES-256
 */
function getEncryptionKey(): Buffer | null {
  const key = process.env.MIDDLEWARE_ENCRYPTION_KEY;

  if (!key) {
    console.warn('[ENCRYPTION] MIDDLEWARE_ENCRYPTION_KEY not set - encryption disabled');
    return null;
  }

  if (key.length !== 64) {
    console.error('[ENCRYPTION] ENCRYPTION_KEY must be 64 hex characters (32 bytes)');
    return null;
  }

  return Buffer.from(key, 'hex');
}

/**
 * Check if a value is already encrypted
 * Encrypted values follow the format: IV:encrypted_data (hex:hex)
 */
export function isEncrypted(text: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // Encrypted format: 32-char-hex-IV:encrypted-data-hex
  const parts = text.split(':');
  if (parts.length !== 2) return false;

  const hexRegex = /^[0-9a-f]+$/i;
  return parts[0].length === 32 && hexRegex.test(parts[0]) && hexRegex.test(parts[1]);
}

/**
 * Encrypt a string value
 * Returns: IV:encrypted_data (hex format)
 * Skips encryption if already encrypted (prevents double-encryption)
 */
export function encrypt(text: string): string {
  if (!text || isEncrypted(text)) return text;

  try {
    const key = getEncryptionKey();
    if (!key) {
      console.warn('[ENCRYPTION] xXx Skipping encryption - key not present');
      return text;
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Return IV and encrypted data joined by colon
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('[ENCRYPTION] Encryption failed:', error.message);
    throw error;
  }
}

/**
 * Decrypt a string value
 * Expects: IV:encrypted_data (hex format)
 */
export function decrypt(text: string): string {
  if (!text) return text;

  try {
    const key = getEncryptionKey();
    if (!key) {
      console.warn('[ENCRYPTION] xXx Cannot decrypt - key not configured');
      return text; // Return as-is if no key
    }

    const parts = text.split(':');

    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format. Expected IV:data');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const encryptedText = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('[ENCRYPTION] Decryption failed:', error.message);
    throw error;
  }
}

/**
 * Encrypt sensitive fields in credentials object
 *
 * Strategy:
 * - api_key, password, secret, token → encrypted
 * - url, username, database, use_default → plain (searchable)
 *
 * Smart behavior:
 * - Skips already encrypted values (prevents double-encryption)
 * - Admins can update by writing new plain text values
 * - Or leave encrypted values as-is when updating other fields
 */
export function encryptCredentials(credentials: any): any {
  if (!credentials || typeof credentials !== 'object') {
    return credentials;
  }

  const encrypted = { ...credentials };
  const sensitiveFields = ['api_key', 'password', 'secret', 'token', 'access_token', 'refresh_token'];

  for (const field of sensitiveFields) {
    if (encrypted[field] && typeof encrypted[field] === 'string') {
      if (!isEncrypted(encrypted[field])) {  // ✅ Only encrypt plain text
        encrypted[field] = encrypt(encrypted[field]);
      }
    }
  }

  return encrypted;
}

/**
 * Decrypt sensitive fields in credentials object
 */
export function decryptCredentials(credentials: any): any {
  if (!credentials || typeof credentials !== 'object') {
    return credentials;
  }

  const decrypted = { ...credentials };
  const sensitiveFields = ['api_key', 'password', 'secret', 'token', 'access_token', 'refresh_token'];

  for (const field of sensitiveFields) {
    if (decrypted[field] && typeof decrypted[field] === 'string') {
      try {
        decrypted[field] = decrypt(decrypted[field]);
      } catch (error) {
        console.warn(`[ENCRYPTION] Failed to decrypt field: ${field}`);
        // Keep original value if decryption fails (might be unencrypted)
      }
    }
  }

  return decrypted;
}

/**
 * Generate a random encryption key (64 hex characters = 32 bytes)
 * Run this once to generate your ENCRYPTION_KEY for .env
 *
 * Usage: node -e "require('./dist/services/encryption').generateKey()"
 */
export function generateKey(): string {
  const key = crypto.randomBytes(32).toString('hex');
  console.log('\n=== ENCRYPTION KEY ===');
  console.log('Add this to your .env file:');
  console.log(`ENCRYPTION_KEY=${key}`);
  console.log('======================\n');
  return key;
}
