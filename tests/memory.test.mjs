// Тесты памяти амулетов (шаг 26; переделана шагом 38, DONTLIKE п.2): на старте нового забега — выбор одного
// амулета из прошлого забега, бесплатно; цены в билетах больше нет. Без Phaser и DOM: localStorage подменяем
// до импорта progress.ts. Запуск: npm run test:achievements (загрузчик — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ---------- localStorage-заглушка: прогресс читает его при импорте ----------
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => void store.set(key, String(value)),
  removeItem: (key) => void store.delete(key),
  clear: () => store.clear(),
};

const PROGRESS_KEY = 'dolgovaya-yama-progress';
// Старое сохранение до шага 38: память хранилась одним полем memoryAmulet. Оно должно читаться как список из одного.
store.set(PROGRESS_KEY, JSON.stringify({ tutorialDone: true, patterns: [], achievements: [], memoryAmulet: 'bell', runs: 3 }));

const MEMORY = await import('../src/game/memory.ts');
const PROGRESS = await import('../src/game/progress.ts');
const AMULETS = await import('../src/game/amulets.ts');

test('цены у памяти больше нет: ни memoryPrice, ни таблицы цен', () => {
  assert.equal(MEMORY.memoryPrice, undefined, 'memoryPrice удалён вместе со старой витриной за билеты');
  assert.equal(MEMORY.MEMORY_PRICES, undefined, 'таблицы цен по редкости тоже нет');
});

test('список памяти: только уникальные амулеты, по одному варианту на амулет', () => {
  const options = MEMORY.memoryOptions(['bell', 'bell', 'boost', 'greed', 'greed']);
  assert.deepEqual(options.map((option) => option.amulet.id), ['bell', 'boost', 'greed'], 'по одному варианту на амулет');
  assert.ok(options.every((option) => Object.keys(option).length === 1), 'у варианта только сам амулет — цены нет');
});

test('список памяти: пустой забег и чужие id не дают вариантов', () => {
  assert.deepEqual(MEMORY.memoryOptions([]), [], 'амулетов не было — выбора нет');
  assert.deepEqual(MEMORY.memoryOptions(['nope', 'no-such-amulet']), [], 'чужие id отбрасываются');
  assert.equal(MEMORY.memoryOptions(['bell', 'nope']).length, 1, 'настоящий амулет рядом с мусором остаётся');
});

test('список памяти: порядок — как в AMULETS, а не как купили', () => {
  const options = MEMORY.memoryOptions(['greed', 'cut', 'bell']);
  const order = AMULETS.AMULETS.map((amulet) => amulet.id);
  const positions = options.map((option) => order.indexOf(option.amulet.id));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'варианты идут в порядке AMULETS');
});

test('сколько амулетов дают на старте: один — правило игры, сделка даёт свой', () => {
  assert.equal(MEMORY.MEMORY_PICKS_BASE, 1, 'бесплатно берут один');
  assert.equal(MEMORY.MEMORY_PICKS_PACT, 1, 'сделка №34 добавляет ещё один');
});

test('старая память (одно поле memoryAmulet) читается как список из одного амулета', () => {
  assert.deepEqual(PROGRESS.nextRunMemory(), { amulets: ['bell'], picks: 1 }, 'игрок не теряет выбор после обновления игры');
});

test('амулеты забега пишутся в прогресс и переживают повторное чтение', () => {
  PROGRESS.setNextRunMemory(['bell', 'boost'], 2);
  assert.deepEqual(PROGRESS.nextRunMemory(), { amulets: ['bell', 'boost'], picks: 2 }, 'память помнит амулеты прошлого забега');
  const saved = JSON.parse(store.get(PROGRESS_KEY));
  assert.deepEqual(saved.runAmulets, ['bell', 'boost'], 'список ушёл в localStorage');
  assert.equal(saved.runAmuletPicks, 2, 'и число выборов');
  assert.equal(saved.tutorialDone, true, 'остальной прогресс не потерян');
  assert.equal(saved.runs, 3, 'номер забега не сброшен');
});

test('чужое id и мусор в выборах не пишутся', () => {
  PROGRESS.setNextRunMemory(['no-such-amulet', 'bell'], 0);
  assert.deepEqual(PROGRESS.nextRunMemory(), { amulets: ['bell'], picks: 1 }, 'чужое id отброшено, мусор в выборах — один');
  PROGRESS.setNextRunMemory([], 5);
  assert.deepEqual(PROGRESS.nextRunMemory(), { amulets: [], picks: 5 }, 'пустой забег — пустой список');
});
