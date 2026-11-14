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
const { isRiskyCharge } = await import('../src/game/levers.ts');
const { disableDevMode } = await import('../src/game/devmode.ts');
const { noEffects } = await import('../src/game/items.ts');
const { grantAchievement, obtainedAchievements } = await import('../src/game/progress.ts');
const { skullShareOf } = await import('../src/game/skullShare.ts');

/** Снимок забега для проверок: всё выключено, доля черепов базовая. */
function state(overrides = {}) {
  return {
    charge: 0, // замах рычага: 0 — тихая прокрутка, >= 0.7 — «риск»
    effects: noEffects(),
    amulets: [],
    amuletCounts: {},
    shelf: [],
    tickets: 0,
    earned: 0,
    multiplier: 1,
    skullShare: skullShareOf(1, 0, { machineId: 'classic', amulets: [], effects: noEffects(), charge: 0.5 }),
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

test('«Я пролью много крови» — только переход счётчика сверху вниз до двух', () => {
  assert.equal(isBloodSpill(5, 2, ['greed']), true, '5 → 2 с «жадностью»');
  assert.equal(isBloodSpill(1, 2, ['greed']), false, 'подъём 1 → 2 (сигарета) — не ачивка');
  assert.equal(isBloodSpill(5, 2, []), false, 'без «жадности» — не ачивка');
  assert.equal(isBloodSpill(3, 2, ['greed']), true, '3 → 2 тоже переход вниз');
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

test('доля черепов от замаха: 18% в середине, сильный замах опаснее, слабый тише', () => {
  const share = (round, amulets, charge) => skullShareOf(round, 0, { machineId: 'classic', amulets, effects: noEffects(), charge });
  assert.ok(Math.abs(share(1, [], 0.5) - 0.18) < 0.005, '1-й раунд, середина шкалы — 18%');
  assert.ok(share(13, ['skullPocket', 'skullPocket'], 1) > 0.4, '×2 и полный замах в 13-м — около 44%');
  assert.ok(share(13, [], 0) < share(13, [], 1), 'слабый замах в 13-м безопаснее сильного');
  assert.ok(share(1, [], 0) < share(1, [], 1), 'заряд двигает черепа вверх');
});

test('«риск» — это высокий заряд: порог 0,7', () => {
  assert.equal(isRiskyCharge(0.69), false, 'чуть ниже порога — не риск');
  assert.equal(isRiskyCharge(0.7), true, 'ровно порог — риск');
  assert.equal(isRiskyCharge(1), true, 'полный замах — риск');
  assert.ok(earnedAchievements(state({ charge: 0.8, amulets: ['skullPocket'] })).includes('wrongGame'), 'заряд 0,8 + skullPocket — «Я играю не туда»');
  assert.ok(!earnedAchievements(state({ charge: 0.2, amulets: ['skullPocket'] })).includes('wrongGame'), 'заряд 0,2 — тихая прокрутка, ачивки нет');
});
