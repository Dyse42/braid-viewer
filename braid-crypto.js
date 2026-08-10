/**
 * Braid Crypto — browser-side decryption for braid-encrypted-v1 files
 * ======================================================================
 * Pairs with encrypt_braid.py. Uses only the Web Crypto API (SubtleCrypto),
 * built into every modern browser — no libraries, no build step, consistent
 * with the rest of this project's single-file/no-dependency approach.
 *
 * SECURITY NOTE: protects against someone stumbling onto the public URL.
 * Does NOT protect against a motivated attacker who downloads the ciphertext
 * and brute-forces it offline. A real passphrase is the entire security model.
 */

function b64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function deriveKey(passphrase, saltBytes, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt', 'encrypt']
  );
}

async function decryptBraid(blob, passphrase) {
  if (blob.format !== 'braid-encrypted-v1') {
    throw new Error('Unrecognized format: ' + blob.format);
  }
  const salt = b64ToBytes(blob.salt);
  const iv = b64ToBytes(blob.iv);
  const ciphertext = b64ToBytes(blob.ciphertext);

  const key = await deriveKey(passphrase, salt, blob.iterations);

  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    ciphertext
  );

  const plaintextStr = new TextDecoder().decode(plaintextBuf);
  return JSON.parse(plaintextStr);
}

async function encryptBraid(dataObject, passphrase, iterations = 600000) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);

  const enc = new TextEncoder();
  const plaintext = enc.encode(JSON.stringify(dataObject));

  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    plaintext
  );

  return {
    format: 'braid-encrypted-v1',
    kdf: 'PBKDF2-HMAC-SHA256',
    iterations: iterations,
    cipher: 'AES-256-GCM',
    salt: bytesToB64(salt),
    iv: bytesToB64(iv),
    ciphertext: bytesToB64(new Uint8Array(ciphertextBuf)),
  };
}
