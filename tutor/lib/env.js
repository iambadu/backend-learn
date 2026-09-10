// Minimal, dependency-free .env loader — deliberately not using the `dotenv`
// package so this whole CLI runs with zero `npm install` step.
import { readFileSync, existsSync } from 'node:fs';

export function loadEnv(envPath) {
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    // Never override a variable already set in the real environment —
    // lets a shell-exported var take precedence over .env if both exist.
    if (!(key in process.env)) process.env[key] = value;
  }
}
