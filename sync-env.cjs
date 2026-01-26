#!/usr/bin/env node
/**
 * Sync REACT_APP_* environment variables from backend/.env to frontend/.env
 *
 * The frontend/.env file is auto-generated and should not be manually edited.
 */

const fs = require('fs');
const path = require('path');

const rootEnvPath = path.join(__dirname, '.env');
const frontendEnvPath = path.join(__dirname, '../frontend/.env');

const header =
  '# Auto-generated from root .env - DO NOT EDIT MANUALLY\n' +
  '# This file is automatically synced from the root .env file (or CI environment variables)\n' +
  '# All environment variables should be defined in the root .env file (local) or platform env vars (CI)\n\n';

try {
  let reactVars = [];

  if (fs.existsSync(rootEnvPath)) {
    const rootEnvContent = fs.readFileSync(rootEnvPath, 'utf8');
    const lines = rootEnvContent.split('\n');

    // Filter only REACT_APP_* variables
    reactVars = lines.filter(line => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('#') && trimmed.startsWith('REACT_APP_');
    });
  } else {
    // CI / cloud builds usually don't have a root .env file (it's gitignored).
    // Fall back to actual process env vars supplied by the platform.
    const envKeys = Object.keys(process.env || {}).filter(k => k.startsWith('REACT_APP_'));
    reactVars = envKeys
      .sort()
      .map(k => `${k}=${process.env[k]}`);
  }

  // Required Firebase variables
  const requiredVars = [
    'REACT_APP_FIREBASE_API_KEY',
    'REACT_APP_FIREBASE_AUTH_DOMAIN',
    'REACT_APP_FIREBASE_PROJECT_ID',
    'REACT_APP_FIREBASE_STORAGE_BUCKET',
    'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
    'REACT_APP_FIREBASE_APP_ID'
  ];

  // Check if all required variables are present
  const presentVars = reactVars.map(line => line.split('=')[0].trim());
  const missingVars = requiredVars.filter(v => !presentVars.includes(v));

  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(v => console.error(`   - ${v}`));
    console.error('\n⚠️  Frontend build will FAIL without these variables.');
    process.exit(1);
  }

  if (reactVars.length > 0) {
    const frontendEnvContent = header + reactVars.join('\n') + '\n';
    fs.writeFileSync(frontendEnvPath, frontendEnvContent);
    console.log(`✓ Synced ${reactVars.length} REACT_APP_* variables from backend/.env to frontend/.env`);
  } else {
    console.error('❌ No REACT_APP_* variables found in root .env');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ Error syncing environment variables:', error.message);
  process.exit(1);
}

