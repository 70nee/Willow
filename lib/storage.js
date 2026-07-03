import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const SNAPSHOT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'snapshot.json');

export function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot) {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
}

export function clearSnapshot() {
  if (existsSync(SNAPSHOT_PATH)) {
    unlinkSync(SNAPSHOT_PATH);
  }
}
