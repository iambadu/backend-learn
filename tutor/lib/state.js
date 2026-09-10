// Local progress tracker — separate from PROGRESS.md (which stays the
// human-readable, canonical record) so the CLI never has to parse or
// risk corrupting that file. Use `/sync` in the tutor to write a summary
// of this state into PROGRESS.md when you want it reflected there.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const STATE_FILENAME = '.tutor-state.json';

function statePath(rootDir) {
  return path.join(rootDir, STATE_FILENAME);
}

export function loadState(rootDir) {
  const p = statePath(rootDir);
  if (!existsSync(p)) {
    return {
      currentLessonIndex: 0, // index into listLessons() order
      mastery: {}, // lessonId -> { level: 1-7, ratedAt: ISO string }
      misconceptions: [], // { lessonId, note, loggedAt }
    };
  }
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    // Corrupt state file — don't crash the tutor, just start fresh.
    return { currentLessonIndex: 0, mastery: {}, misconceptions: [] };
  }
}

export function saveState(rootDir, state) {
  writeFileSync(statePath(rootDir), JSON.stringify(state, null, 2));
}
