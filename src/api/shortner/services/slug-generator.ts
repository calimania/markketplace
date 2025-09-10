import * as crypto from 'crypto';

// Base62 character set: 0-9, a-z, A-Z
const BASE62_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Generates a cryptographically secure random string using Node.js crypto
 * @param length - The length of the string to generate
 * @returns A random Base62 string
 */
function generateCryptoRandomString(length: number): string {
  const bytes = crypto.randomBytes(length * 2); // Generate extra bytes to account for filtering
  let result = '';

  for (let i = 0; i < bytes.length && result.length < length; i++) {
    const byte = bytes[i];
    if (byte < 248) { // 248 = 62 * 4, ensures uniform distribution
      result += BASE62_CHARS[byte % 62];
    }
  }

  // If we didn't get enough characters, pad with simple random
  while (result.length < length) {
    result += BASE62_CHARS[Math.floor(Math.random() * 62)];
  }

  return result.slice(0, length);
}

/**
 * Generates a minimal-length, cryptographically random unique slug.
 * @returns A unique Base62 encoded slug of length 7.
 */
export function generateRandomSlug(): string {
  return generateCryptoRandomString(7);
}

/**
 * Generates a slug from an ID with fallback to random
 * @param id - The document ID to base the slug on
 * @returns A unique slug
 */
export function generateSlugFromId(id: string | number): string {
  // For very short, readable slugs based on ID
  // Convert ID to Base62 for compactness
  const numId = typeof id === 'string' ? parseInt(id, 10) : id;

  if (isNaN(numId)) {
    return generateRandomSlug();
  }

  // Convert to base62
  let result = '';
  let num = numId;

  if (num === 0) return BASE62_CHARS[0];

  while (num > 0) {
    result = BASE62_CHARS[num % 62] + result;
    num = Math.floor(num / 62);
  }

  // Ensure minimum length for consistency
  return result.padStart(4, BASE62_CHARS[0]);
}

/**
 * Validates if a slug is in the correct format
 * @param slug - The slug to validate
 * @returns boolean
 */
export function isValidSlug(slug: string): boolean {
  return /^[0-9a-zA-Z]{3,10}$/.test(slug);
}
