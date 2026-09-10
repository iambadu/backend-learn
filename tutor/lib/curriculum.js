// Reads the curriculum's own directory structure directly, so the tutor
// stays in sync with backend-learn/ automatically — no separate manifest
// to maintain or let drift out of date.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

export const MODULE_DIRS = [
  '01-networking',
  '02-backend-fundamentals',
  '03-databases',
  '04-data-access',
  '05-caching',
  '06-messaging',
  '07-distributed-systems',
  '08-architecture',
  '09-infrastructure',
  '10-reliability',
  '11-security',
  '12-performance',
  '13-system-design',
];

export function getRootDir() {
  // tutor/lib/curriculum.js -> tutor/lib -> tutor -> project root
  return path.resolve(import.meta.dirname, '..', '..');
}

/** Every lesson file across every module, in curriculum order. */
export function listLessons(rootDir) {
  const lessons = [];
  for (const moduleDir of MODULE_DIRS) {
    const fullDir = path.join(rootDir, moduleDir);
    let files;
    try {
      files = readdirSync(fullDir);
    } catch {
      continue; // module directory doesn't exist yet
    }
    const mdFiles = files.filter((f) => f.endsWith('.md')).sort();
    for (const file of mdFiles) {
      lessons.push({
        module: moduleDir,
        file,
        relPath: path.join(moduleDir, file),
        id: `${moduleDir}/${file}`,
      });
    }
  }
  return lessons;
}

export function readFile(rootDir, relPath) {
  return readFileSync(path.join(rootDir, relPath), 'utf8');
}

export function readModuleExam(rootDir, moduleDir) {
  const examPath = path.join('exams', `${moduleDir}-exam.md`);
  const fullPath = path.join(rootDir, examPath);
  if (!existsSync(fullPath)) return null;
  return readFileSync(fullPath, 'utf8');
}

export function readRoadmap(rootDir) {
  const p = path.join(rootDir, 'ROADMAP.md');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
