// Тесты чистой логики ачивок (node --test). Phaser и DOM не нужны: только правила и прогресс.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// localStorage подкладываем ДО импорта модулей: progress.ts и devmode.ts читают его на загрузке.
// Режим разработчика включаем сразу — на нём проверяется запрет записи ачивок.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
};
store.set('dolgovaya-yama-devmode', '1');

const { achievementsOf, earnedAchievements, isBloodSpill } = await import('../src/game/achievements.ts');
const { disableDevMode } = await import('../src/game/devmode.ts');
const { noEffects } = await import('../src/game/items.ts');
const { grantAchievement, obtainedAchievements } = await import('../src/game/progress.ts');
const { skullShareOf } = await import('../src/game/skullShare.ts');

/** Снимок забега для проверок: всё выключено, доля черепов базовая. */
function state(overrides = {}) {
  return {
    effects: noEffects(),
    amulets: [],
    amuletCounts: {},
    shelf: [],
    tickets: 0,
    earned: 0,
    multiplier: 1,
    skullShare: skullShareOf(1, 0, { machineId: 'classic', amulets: [], effects: noEffects() }),
    isFree: false,
    isWin: false,
    ...overrides,
  };
}

test('«ЗАНЯТО!» считает гнёзда, а не копии: 3 амулета × 2 копии не дают ачивку', () => {
  const few = state({ amulets: ['cherryPit', 'bell', 'piggy'], amuletCounts: { cherryPit: 2, bell: 2, piggy: 2 } });
  assert.ok(!earnedAchievements(few).includes('occupied'), 'три гнезда — не «ЗАНЯТО!»');
  const six = state({
    amulets: ['cherryPit', 'bell', 'piggy', 'insurance', 'boost', 'vest'],
    amuletCounts: { cherryPit: 1, bell: 1, piggy: 1, insurance: 1, boost: 1, vest: 1 },
  });
  assert.ok(earnedAchievements(six).includes('occupied'), 'шесть гнёзд — «ЗАНЯТО!»');
});

test('«Дубликат» — ровно с двух копий одного амулета', () => {
  assert.ok(!earnedAchievements(state({ amulets: ['cherryPit'], amuletCounts: { cherryPit: 1 } })).includes('duplicate'));
  assert.ok(earnedAchievements(state({ amulets: ['cherryPit'], amuletCounts: { cherryPit: 2 } })).includes('duplicate'));
});

test('«Я пролью много крови» — только когда в начале раунда всего две прокрутки (DONTLIKE п.12)', () => {
  assert.equal(isBloodSpill(2, ['greed']), true, 'на старте две прокрутки с «жадностью» — ачивка');
  assert.equal(isBloodSpill(1, ['greed']), true, 'одна прокрутка — тоже «настолько много жадности»');
  assert.equal(isBloodSpill(2, []), false, 'без «жадности» — не ачивка');
  assert.equal(isBloodSpill(3, ['greed']), false, 'три прокрутки на старте — ещё не та жадность');
  assert.equal(isBloodSpill(12, ['greed']), false, 'обычный раунд с «жадностью» — не ачивка');
  // Остаток к концу раунда больше не считается: две прокрутки посередине — это не «в начале».
  assert.equal(isBloodSpill(0, ['greed']), false, 'ноль прокруток — конец раунда, не старт');
  assert.equal(isBloodSpill(Number.NaN, ['greed']), false, 'мусор — не ачивка');
});

test('«50 на 50» — выигрыш при доле ≥50% и только на платной прокрутке', () => {
  const win = state({ isWin: true, skullShare: 0.5 });
  assert.ok(earnedAchievements(win).includes('fiftyFifty'), 'доля 50% и выигрыш');
  assert.ok(!earnedAchievements({ ...win, skullShare: 0.49 }).includes('fiftyFifty'), 'доля 49% — нет');
  assert.ok(!earnedAchievements({ ...win, isFree: true }).includes('fiftyFifty'), 'бесплатная прокрутка — нет');
  assert.ok(!earnedAchievements({ ...win, isWin: false }).includes('fiftyFifty'), 'без выигранного паттерна — нет');
});

test('achievementsOf отбрасывает чужие id, мусор и повторы', () => {
  assert.deepEqual(achievementsOf(['noSmoke', 'noSmoke', 'чужое', 42, null, 'jackpot']), ['noSmoke']);
  assert.deepEqual(achievementsOf('нет'), []);
  assert.deepEqual(achievementsOf(undefined), []);
});

test('grantAchievement не пишет в режиме разработчика, а после выхода — пишет один раз', () => {
  assert.equal(grantAchievement('noSmoke'), false, 'dev-режим: выдачи нет');
  assert.deepEqual(obtainedAchievements(), [], 'dev-режим: прогресс пуст');
  assert.equal(store.get('dolgovaya-yama-progress'), undefined, 'dev-режим: в localStorage ничего не записано');

  disableDevMode(); // «ВЫЙТИ» из режима разработчика
  assert.equal(grantAchievement('noSmoke'), true, 'обычный режим: ачивка выдана');
  assert.deepEqual(obtainedAchievements(), ['noSmoke']);
  assert.equal(grantAchievement('noSmoke'), false, 'повторно не выдаётся');
  assert.deepEqual(JSON.parse(store.get('dolgovaya-yama-progress')).achievements, ['noSmoke'], 'записано в localStorage');
});

test('доля черепов: растёт от раунда и амулетов, а не от рычага', () => {
  const share = (round, amulets) => skullShareOf(round, 0, { machineId: 'classic', amulets, effects: noEffects() });
  assert.ok(Math.abs(share(1, []) - 0.18) < 0.005, '1-й раунд — 18%');
  assert.ok(share(13, ['skullPocket', 'skullPocket']) > 0.4, '×2 «черепа в кармане» в 13-м — около 44%');
  assert.ok(share(13, []) > share(1, []), '13-й раунд опаснее первого');
});

test('«риск» — это включённый предмет «Риск»: три ачивки на нём и ни одной без него', () => {
  const risky = (extra = {}) => ({ ...noEffects(), risk: true, ...extra });
  const pocket = { amulets: ['skullPocket'], amuletCounts: { skullPocket: 1 } };

  assert.ok(earnedAchievements(state({ ...pocket, effects: risky() })).includes('wrongGame'), 'риск + «череп в кармане» — «Я играю не туда»');
  assert.ok(!earnedAchievements(state(pocket)).includes('wrongGame'), 'без риска — «Я играю не туда» нет');

  // «Неа» теперь выдаёт сцена при отказе (conflictsWith), а не earnedAchievements: риск+фарт через неё не идёт.
  assert.ok(!earnedAchievements(state({ effects: risky({ luckSpin: true }) })).includes('nope'), 'риск и фарт одновременно — «Неа» не через earnedAchievements');
  assert.ok(!earnedAchievements(state({ effects: { ...noEffects(), luckSpin: true } })).includes('nope'), 'фарт без риска — не «Неа»');

  const luckyOne = { ...pocket, effects: risky({ tripleTakes: 1 }), isWin: true };
  assert.ok(earnedAchievements(state(luckyOne)).includes('luckyOne'), 'риск + череп в кармане + тройное «забрать» + выигрыш — «Везунчик»');
  assert.ok(!earnedAchievements(state({ ...luckyOne, effects: { ...noEffects(), tripleTakes: 1 } })).includes('luckyOne'), 'без риска — не «Везунчик»');
  assert.ok(!earnedAchievements(state({ ...luckyOne, isWin: false })).includes('luckyOne'), 'без выигранного паттерна — не «Везунчик»');
});
