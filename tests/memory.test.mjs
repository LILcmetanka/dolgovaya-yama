// Тесты памяти амулетов после смерти (шаг 26): цена переноса по редкости, какие амулеты предлагать и когда слота
// нет, обратная совместимость сохранения прогресса. Без Phaser и DOM: localStorage подменяем до импорта progress.ts.
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

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
// Старый ключ без поля памяти: так игра сохраняла прогресс до шага 26.
store.set(PROGRESS_KEY, JSON.stringify({ tutorialDone: true, patterns: [], achievements: [] }));

const MEMORY = await import('../src/game/memory.ts');
const PROGRESS = await import('../src/game/progress.ts');
const AMULETS = await import('../src/game/amulets.ts');

test('цена переноса по редкости: 2 за обычный и проклятый, 3 за редкий и легендарный', () => {
  assert.equal(MEMORY.memoryPrice('common'), 2, 'обычный — 2 билета');
  assert.equal(MEMORY.memoryPrice('rare'), 3, 'редкий — 3 билета');
  assert.equal(MEMORY.memoryPrice('legendary'), 3, 'легендарный — реже обычного, тоже 3');
  assert.equal(MEMORY.memoryPrice('cursed'), 2, 'проклятый в магазине стоит как обычный — и перенос тоже 2');
  assert.deepEqual(MEMORY.MEMORY_PRICES, { common: 2, rare: 3, legendary: 3, cursed: 2 }, 'таблица цен — одним числом на редкость');
});

test('неизвестная редкость стоит как обычный амулет, а не NaN', () => {
  assert.equal(MEMORY.memoryPrice('cosmic'), 2, 'чужой редкости нет в таблице — цена 2, а не undefined');
  const price = MEMORY.memoryPrice('cosmic');
  assert.ok(Number.isFinite(price), 'цена — число: с undefined в билетах был бы NaN');
});

test('витрина: только уникальные амулеты забега, копии не предлагаются', () => {
  const options = MEMORY.memoryOptions(['bell', 'bell', 'boost', 'greed', 'greed'], 6);
  assert.deepEqual(options.map((option) => option.amulet.id), ['bell', 'boost', 'greed'], 'по одному варианту на амулет');
  assert.deepEqual(options.map((option) => option.price), [2, 3, 2], 'цены — по редкости: 🔔 обычный, ⚡ редкий, 🩸 проклятый');
});

test('витрина: чужие id и пустой забег не дают вариантов', () => {
  assert.deepEqual(MEMORY.memoryOptions([], 10), [], 'амулетов не было — слота нет');
  assert.deepEqual(MEMORY.memoryOptions(['nope', 'no-such-amulet'], 10), [], 'чужие id отбрасываются');
});

test('витрина: не хватает билетов — вариант не предлагается, а если не хватает на все — слота нет', () => {
  assert.deepEqual(MEMORY.memoryOptions(['bell'], 1), [], '1 билет при цене 2 — переносить нечего');
  assert.deepEqual(MEMORY.memoryOptions(['boost'], 2), [], '2 билета при цене 3 — редкий не предлагается');
  assert.deepEqual(
    MEMORY.memoryOptions(['bell', 'boost'], 2).map((option) => option.amulet.id),
    ['bell'],
    'на обычный хватает, на редкий нет — предлагается только обычный',
  );
  assert.deepEqual(
    MEMORY.memoryOptions(['bell', 'boost'], 3).map((option) => option.amulet.id),
    ['bell', 'boost'],
    '3 билета хватает на оба',
  );
});

test('витрина: билеты округляются вниз, мусор считается нулём', () => {
  assert.deepEqual(MEMORY.memoryOptions(['boost'], 3.9).map((option) => option.amulet.id), ['boost'], '3,9 билета — это 3 целых');
  for (const tickets of [Number.NaN, Number.POSITIVE_INFINITY, -5, '3']) {
    assert.deepEqual(MEMORY.memoryOptions(['bell'], tickets), [], `мусор в билетах (${String(tickets)}) — слота нет`);
  }
});

test('витрина: порядок — как в AMULETS, а не как купили', () => {
  const options = MEMORY.memoryOptions(['greed', 'cut', 'bell'], 3);
  const order = AMULETS.AMULETS.map((amulet) => amulet.id);
  const positions = options.map((option) => order.indexOf(option.amulet.id));
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b), 'варианты идут в порядке AMULETS');
});

test('сохранение без поля памяти (старый ключ) читается как «памяти нет»', () => {
  assert.equal(PROGRESS.rememberedAmulet(), null, 'старый прогресс шага 25 памяти не знал');
});

test('выбор пишется в прогресс и переживает повторное чтение поля', () => {
  PROGRESS.setRememberedAmulet('bell');
  assert.equal(PROGRESS.rememberedAmulet(), 'bell', 'память помнит выбранный амулет');
  const saved = JSON.parse(store.get(PROGRESS_KEY));
  assert.equal(saved.memoryAmulet, 'bell', 'поле ушло в localStorage');
  assert.equal(saved.tutorialDone, true, 'остальной прогресс не потерян');
});

test('чужое id и null стирают память, а не пишут мусор', () => {
  PROGRESS.setRememberedAmulet('no-such-amulet');
  assert.equal(PROGRESS.rememberedAmulet(), null, 'чужое id память гасит');
  PROGRESS.setRememberedAmulet('boost');
  PROGRESS.setRememberedAmulet(null);
  assert.equal(PROGRESS.rememberedAmulet(), null, 'null стирает память');
  assert.equal(JSON.parse(store.get(PROGRESS_KEY)).memoryAmulet, null, 'в сохранении тоже null');
});
