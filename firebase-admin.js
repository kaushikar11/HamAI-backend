import admin from 'firebase-admin';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '.env');
dotenv.config({ path: envPath });

/**
 * dotenv does NOT support multi-line env values like:
 * FIREBASE_SERVICE_ACCOUNT_KEY={
 *   "type": "service_account",
 *   ...
 * }
 *
 * It will read only the first line ("{"), causing JSON.parse to fail.
 * This helper reads the raw .env file and extracts the full JSON object.
 */
function readMultilineJsonEnvValue(keyName, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const prefix = `${keyName}=`;
    const startIdx = lines.findIndex((l) => l.startsWith(prefix));
    if (startIdx === -1) return null;

    const firstRemainder = lines[startIdx].slice(prefix.length);
    if (!firstRemainder.trim().startsWith('{')) return null;

    let jsonText = '';
    let braceCount = 0;
    let inString = false;
    let escape = false;
    let started = false;

    const scan = (str) => {
      for (const ch of str) {
        if (escape) {
          escape = false;
          continue;
        }
        if (inString && ch === '\\') {
          escape = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (ch === '{') {
          braceCount += 1;
          started = true;
        } else if (ch === '}') {
          braceCount -= 1;
        }
      }
    };

    for (let i = startIdx; i < lines.length; i += 1) {
      const part = i === startIdx ? firstRemainder : lines[i];
      jsonText += (i === startIdx ? '' : '\n') + part;
      scan(part);
      if (started && braceCount === 0) break;
    }

    const trimmed = jsonText.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function parseServiceAccountFromEnv() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  const trimmed = raw.trim();
  // 1) direct JSON (single-line)
  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  // 2) base64-encoded JSON
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    // continue
  }

  // 3) multi-line JSON stored in .env file
  const fromFile = readMultilineJsonEnvValue('FIREBASE_SERVICE_ACCOUNT_KEY', envPath);
  if (fromFile) return fromFile;

  // 4) last resort: try removing newlines and parsing
  const cleaned = trimmed.replace(/\n/g, '').replace(/\s+/g, ' ').trim();
  return JSON.parse(cleaned);
}

if (!admin.apps.length) {
  try {
    // Option 1: Initialize with service account JSON (recommended for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = parseServiceAccountFromEnv();
      if (!serviceAccount) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY is set but could not be parsed as JSON');
      }
      
      // Handle private key newlines
      if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
      }
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id
      });
      console.log('✓ Firebase Admin initialized with service account');
    }
    // Option 2: Initialize with individual service account fields
    else if (
      process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
    ) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      console.log('✓ Firebase Admin initialized with individual credentials');
    }
    // Option 3: Initialize with project ID only (for emulator or default credentials)
    else if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID
      });
      console.log('✓ Firebase Admin initialized with project ID (using default credentials)');
    } else {
      throw new Error(
        'Firebase Admin not configured. Set one of the following:\n' +
        '1. FIREBASE_SERVICE_ACCOUNT_KEY (JSON string)\n' +
        '2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY\n' +
        '3. FIREBASE_PROJECT_ID (for emulator/default credentials)'
      );
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error.message);
    throw error;
  }
}

// Initialize Firestore
export const db = admin.firestore();
console.log('✓ Firestore initialized');

export default admin;
