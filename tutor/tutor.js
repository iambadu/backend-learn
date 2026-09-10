#!/usr/bin/env node
// Backend University — terminal tutor, powered by an OpenRouter model.
// Run: node tutor/tutor.js   (from anywhere — paths are resolved relative
// to this file, not your current working directory)

import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { loadEnv } from './lib/env.js';
import { chat } from './lib/openrouter.js';
import {
  getRootDir,
  listLessons,
  readFile,
  readModuleExam,
  readRoadmap,
} from './lib/curriculum.js';
import { loadState, saveState } from './lib/state.js';
import { buildSystemPrompt, MASTERY_RATING_PROMPT } from './lib/prompts.js';

const ROOT_DIR = getRootDir();
loadEnv(path.join(import.meta.dirname, '.env'));

const rl = readline.createInterface({ input, output });

function print(text) {
  output.write(text);
}

async function ask(promptText) {
  return (await rl.question(promptText)).trim();
}

async function runChatLoop({ systemPrompt, onNext }) {
  const messages = [{ role: 'system', content: systemPrompt }];
  print('\n(type /next to move on, /menu for the menu, /exit to quit)\n\n');

  // Let the model open the conversation.
  await streamAssistantTurn(messages);

  while (true) {
    const userInput = await ask('\nyou> ');
    if (userInput === '/exit') {
      saveAndExit();
    }
    if (userInput === '/menu') {
      return 'menu';
    }
    if (userInput === '/next') {
      if (onNext) await onNext(messages);
      return 'next';
    }
    if (userInput === '/help') {
      print('\n/next  — move to the next item, logging mastery if applicable\n' +
            '/menu  — back to the mode menu\n' +
            '/exit  — save progress and quit\n');
      continue;
    }
    if (!userInput) continue;

    messages.push({ role: 'user', content: userInput });
    await streamAssistantTurn(messages);
  }
}

async function streamAssistantTurn(messages) {
  print('\ntutor> ');
  let full = '';
  try {
    full = await chat(messages, {
      onToken: (token) => print(token),
    });
  } catch (err) {
    print(`\n[error] ${err.message}\n`);
    return;
  }
  messages.push({ role: 'assistant', content: full });
  print('\n');
}

async function rateMastery(messages, lessonId, state) {
  const ratingMessages = [
    ...messages,
    { role: 'user', content: MASTERY_RATING_PROMPT },
  ];
  let raw = '';
  try {
    raw = await chat(ratingMessages, {});
  } catch {
    return; // rating is a nicety, never block progress on it failing
  }
  const digit = raw.match(/[1-7]/);
  if (digit) {
    state.mastery[lessonId] = { level: Number(digit[0]), ratedAt: new Date().toISOString() };
    print(`\n[logged mastery level ${digit[0]} for ${lessonId}]\n`);
  }
}

function saveAndExit() {
  print('\nProgress saved. See you next time.\n');
  rl.close();
  process.exit(0);
}

async function modeStart(state) {
  const lessons = listLessons(ROOT_DIR);
  if (state.currentLessonIndex >= lessons.length) {
    print('\nEvery lesson file has been visited at least once. Try `Review`,\n' +
          '`Exam` for a module, or `System design` mode for the capstone.\n');
    return;
  }
  const lesson = lessons[state.currentLessonIndex];
  const content = readFile(ROOT_DIR, lesson.relPath);
  print(`\n=== ${lesson.module} / ${lesson.file} ===\n`);

  const systemPrompt = buildSystemPrompt({
    mode: 'start',
    contextContent: content,
    contextLabel: lesson.id,
  });

  const result = await runChatLoop({
    systemPrompt,
    onNext: async (messages) => {
      await rateMastery(messages, lesson.id, state);
      state.currentLessonIndex += 1;
      saveState(ROOT_DIR, state);
    },
  });
  return result;
}

async function modeByLessonPicker(state, mode) {
  const lessons = listLessons(ROOT_DIR);
  print('\nWhich lesson? (enter a number)\n');
  lessons.forEach((l, i) => print(`  ${i + 1}. ${l.module}/${l.file}\n`));
  const choice = await ask('\n# > ');
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= lessons.length) {
    print('\nNot a valid choice.\n');
    return;
  }
  const lesson = lessons[idx];
  const content = readFile(ROOT_DIR, lesson.relPath);
  const contextContent =
    mode === 'review'
      ? `${content}\n\n--- Logged misconceptions for this learner ---\n${JSON.stringify(
          state.misconceptions.filter((m) => m.lessonId === lesson.id),
          null,
          2,
        )}`
      : content;

  const systemPrompt = buildSystemPrompt({ mode, contextContent, contextLabel: lesson.id });
  await runChatLoop({ systemPrompt });
}

async function modeExam() {
  const moduleDirs = [
    '01-networking', '02-backend-fundamentals', '03-databases', '04-data-access',
    '05-caching', '06-messaging', '07-distributed-systems', '08-architecture',
    '09-infrastructure', '10-reliability', '11-security', '12-performance', '13-system-design',
  ];
  print('\nWhich module\'s exam?\n');
  moduleDirs.forEach((m, i) => print(`  ${i + 1}. ${m}\n`));
  const choice = await ask('\n# > ');
  const idx = Number(choice) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= moduleDirs.length) {
    print('\nNot a valid choice.\n');
    return;
  }
  const exam = readModuleExam(ROOT_DIR, moduleDirs[idx]);
  if (!exam) {
    print('\nNo exam file found for that module yet.\n');
    return;
  }
  const systemPrompt = buildSystemPrompt({
    mode: 'exam',
    contextContent: exam,
    contextLabel: `${moduleDirs[idx]} exam`,
  });
  await runChatLoop({ systemPrompt });
}

async function modeDesign() {
  const framework = readFile(ROOT_DIR, path.join('13-system-design', '01-system-design-framework.md'));
  const scenarios = readFile(ROOT_DIR, path.join('13-system-design', '02-scenario-bank.md'));
  const systemPrompt = buildSystemPrompt({
    mode: 'design',
    contextContent: `${framework}\n\n${scenarios}`,
    contextLabel: 'system design framework + scenario bank',
  });
  await runChatLoop({ systemPrompt });
}

function printProgress(state) {
  const lessons = listLessons(ROOT_DIR);
  print(`\nLesson position: ${state.currentLessonIndex}/${lessons.length}\n`);
  const rated = Object.entries(state.mastery);
  if (rated.length === 0) {
    print('No mastery ratings logged yet.\n');
    return;
  }
  print('Mastery ratings:\n');
  for (const [id, { level, ratedAt }] of rated) {
    print(`  ${id}: level ${level} (${ratedAt.slice(0, 10)})\n`);
  }
}

async function mainMenu() {
  print('\n' + '='.repeat(60) + '\n');
  print('  Backend University — Terminal Tutor\n');
  print('='.repeat(60) + '\n');
  print(`
  1. Start     — continue the curriculum in sequence
  2. Quiz me    — Socratic mode on a specific lesson
  3. Practice   — an exercise from a specific lesson
  4. Review     — targeted review of logged misconceptions
  5. Exam       — a module's cumulative exam
  6. System design — capstone mode (framework + scenario bank)
  7. Progress   — show what's been rated so far
  8. Exit
`);
  return ask('choose> ');
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    print(
      '\n[!] No OPENROUTER_API_KEY found.\n' +
      `    Copy ${path.join('tutor', '.env.example')} to ${path.join('tutor', '.env')} ` +
      'and paste in your key from https://openrouter.ai/keys\n\n',
    );
  }

  const state = loadState(ROOT_DIR);

  while (true) {
    const choice = await mainMenu();
    switch (choice) {
      case '1':
        await modeStart(state);
        break;
      case '2':
        await modeByLessonPicker(state, 'quiz');
        break;
      case '3':
        await modeByLessonPicker(state, 'practice');
        break;
      case '4':
        await modeByLessonPicker(state, 'review');
        break;
      case '5':
        await modeExam();
        break;
      case '6':
        await modeDesign();
        break;
      case '7':
        printProgress(state);
        break;
      case '8':
        saveAndExit();
        break;
      default:
        print('\nType a number 1-8.\n');
    }
    saveState(ROOT_DIR, state);
  }
}

main().catch((err) => {
  print(`\n[fatal] ${err.stack ?? err.message}\n`);
  process.exit(1);
});
