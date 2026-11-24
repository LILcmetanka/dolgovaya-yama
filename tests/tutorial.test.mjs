// Тесты обучения текстами (партия 1): тексты дорожек, сетки интро и порядок битов; в конце — прогресс обучения
// (чтение сохранения, слияние вкладок, шаги дорожек). Сетки считаем настоящим evaluateGrid: обучающий «долг»
// обязан покрывать первый долг, иначе он бесполезен.
// Без Phaser и DOM. Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const TUT = await import('../src/game/tutorial.ts');
const P = await import('../src/game/patterns.ts');
const RULES = await import('../src/game/rules.ts');
const LANG = await import('../src/game/lang.ts');

// ---------- Вспомогательное ----------

/** Все клетки сетки одним списком. */
const cellsOf = (grid) => grid.flat();

/** Символы 1-го раунда: в обучении новичок видит только их. */
const ROUND_ONE = new Set(RULES.SYMBOLS.filter((symbol) => symbol.unlockRound === 1).map((symbol) => symbol.id));

/** Есть ли на сетке символ с таким id. */
const has = (grid, id) => cellsOf(grid).some((symbol) => symbol.id === id);

/** Сетка нужного размера 3×5. */
const assertShape = (grid, name) => {
  assert.equal(grid.length, RULES.GRID_ROWS, `${name}: рядов ${RULES.GRID_ROWS}`);
  for (const row of grid) assert.equal(row.length, RULES.GRID_COLUMNS, `${name}: в ряду ${RULES.GRID_COLUMNS} клеток`);
};

// ---------- Тексты ----------

test('дорожки текстов непустые, интро непустое, у каждого бита есть id и wait', () => {
  const steps = TUT.introSteps(2);
  assert.ok(steps.length > 0, 'биты интро есть');
  for (const step of steps) {
    assert.equal(typeof step.id, 'string', 'у бита есть id');
    assert.ok(step.id.length > 0, 'id не пустой');
    assert.ok(['spin', 'take', 'none'].includes(step.wait), `бит ${step.id}: wait из известных`);
    assert.ok(Array.isArray(step.lines), `бит ${step.id}: строки — массив`);
    assert.ok(step.lines.length > 0, `бит ${step.id}: строки есть`);
  }
  for (const [name, track] of [['DEATH_LINES', TUT.DEATH_LINES], ['RESCUE_WIN_LINES', TUT.RESCUE_WIN_LINES], ['DEATH_SCREEN_LINES', TUT.DEATH_SCREEN_LINES], ['ACTIONS_LINES', TUT.ACTIONS_LINES]]) {
    assert.ok(Array.isArray(track) && track.length > 0, `${name} непустой`);
    for (const key of track) assert.equal(typeof key, 'string', `${name}: ключ — строка`);
  }
});

test('все ключи обучения есть в lang: t() знает каждую надпись', () => {
  const keys = [
    ...TUT.introSteps(2).flatMap((step) => step.lines.map((line) => line.key)),
    ...TUT.DEATH_LINES,
    ...TUT.RESCUE_WIN_LINES,
    ...TUT.DEATH_SCREEN_LINES,
    ...TUT.ACTIONS_LINES,
  ];
  assert.ok(keys.length > 0, 'ключи есть');
  for (const key of keys) {
    const text = LANG.t(key);
    assert.equal(typeof text, 'string', `ключ ${key} есть в lang`);
    assert.ok(text.length > 0, `надпись ${key} не пустая`);
  }
});

test('дорожка смерти: семь строк в порядке сценария автора', () => {
  assert.deepEqual(TUT.DEATH_SCREEN_LINES, [
    'tutDeathWhat',
    'tutDeathSurprised',
    'tutDeathAlive',
    'tutDeathPick',
    'tutDeathSomeday',
    'tutDeathGoal',
    'tutDeathLuck',
  ]);
});

test('биты интро: 13 штук, id без повторов, черепа на debt, 9 прокруток из 12', () => {
  const steps = TUT.introSteps(2);
  assert.equal(steps.length, 13, 'битов 13');
  assert.equal(new Set(steps.map((step) => step.id)).size, 13, 'id не повторяются');
  const amulets = steps.find((step) => step.id === 'amulets');
  assert.ok(amulets, 'бит amulets есть');
  assert.deepEqual(amulets.lines[0].args, [2, 'гнезда'], 'tutSlots получает число гнёзд и форму слова под него («2 гнезда»)');
  assert.equal(amulets.lastSpin, true, 'последний бит помечен lastSpin');
  assert.equal(amulets.spin, 'debt', 'последняя прокрутка показывает сетку-долг');
  assert.equal(steps.find((step) => step.id === 'pay'), undefined, 'пустого бита pay больше нет');
  const debt = steps.find((step) => step.id === 'debt');
  assert.ok(debt, 'бит debt есть');
  assert.equal(debt.spin, 'skull', 'черепа падают на бите debt, после «отдай его до конца раунда»');
  assert.deepEqual(debt.lines.map((line) => line.key), ['tutDebt', 'tutPayByRound'], 'черепа — сразу после двух строк про долг');
  const spins = steps.filter((step) => step.wait === 'spin');
  assert.equal(spins.length, 9, 'прокруток в интро ровно 9');
  assert.ok(spins.length <= RULES.SPINS_PER_ROUND, `прокрутки интро ${spins.length} укладываются в раунд ${RULES.SPINS_PER_ROUND}`);
  const idle = steps.filter((step) => step.wait === 'none');
  assert.equal(idle.length, 3, 'три бита идут без нажатия (телевизор, не миллион, места под предметы)');
});

test('записка с долгом открывается на бите debt, а не на «Забери кон», и полка — на places', () => {
  const steps = TUT.introSteps(2);
  // Сцена больше не хранит номера битов числом: она ищет их в данных — openNote, clearDark и id 'places'.
  // Тест проверяет те же признаки, а не копии чисел: поменяли порядок битов — сцена и тест читают одно место.
  const noteSteps = steps.filter((step) => step.openNote).map((step) => step.id);
  assert.deepEqual(noteSteps, ['debt'], 'openNote ровно у одного бита — «Это твой долг»');
  const darkOffSteps = steps.filter((step) => step.clearDark).map((step) => step.id);
  assert.deepEqual(darkOffSteps, ['tv'], 'тьма гаснет ровно на одном бите — «Телевизор»');
  const take = steps.find((step) => step.id === 'take');
  assert.ok(take && !take.openNote, 'на «Забери кон из автомата» записки ещё нет');
  assert.equal(steps.filter((step) => step.id === 'places').length, 1, 'бит «места под предметы» один — по его id сцена открывает полку');
});

// ---------- Сетки ----------

test('сетки 3×5 и только из символов 1-го раунда', () => {
  for (const kind of ['empty', 'pattern', 'skull', 'debt']) {
    const grid = TUT.tutorialGrid(kind);
    assertShape(grid, kind);
    for (const symbol of cellsOf(grid)) {
      assert.ok(ROUND_ONE.has(symbol.id), `${kind}: символ ${symbol.id} есть в 1-м раунде`);
    }
  }
});

test('пустая сетка ничего не платит и не содержит особых символов', () => {
  const grid = TUT.tutorialGrid('empty');
  const result = P.evaluateGrid(grid);
  assert.equal(result.kind, 'nothing', 'паттернов нет');
  assert.equal(result.win, 0, 'выигрыш 0');
  assert.equal(result.hits.length, 0, 'попаданий нет');
  for (const id of ['skull', 'dice', 'ticket', 'lock', 'clover', 'crown']) {
    assert.ok(!has(grid, id), `в пустой сетке нет ${id}`);
  }
});

test('сетка pattern: паттерн из трёх вишен платит', () => {
  const grid = TUT.tutorialGrid('pattern');
  const result = P.evaluateGrid(grid);
  assert.equal(result.kind, 'win', 'паттерн засчитан');
  assert.ok(result.win > 0, `выигрыш больше нуля: ${result.win}`);
});

test('сетка skull: черепа на месте и кон сгорает', () => {
  const grid = TUT.tutorialGrid('skull');
  const skulls = cellsOf(grid).filter((symbol) => RULES.isSkull(symbol));
  assert.ok(skulls.length >= 3, 'черепов не меньше трёх');
  const result = P.evaluateGrid(grid);
  assert.equal(result.kind, 'skull', 'паттерн из черепов сжигает кон');
  assert.equal(result.win, 0, 'при черепах выигрыша нет');
});

test('сетка debt: покрывает первый долг даже при множителе ×1', () => {
  const grid = TUT.tutorialGrid('debt');
  const result = P.evaluateGrid(grid);
  assert.equal(result.kind, 'win', 'сетка выигрышная, а не пустая');
  const debt = RULES.startDebt();
  assert.ok(result.win >= debt, `выигрыш ${result.win} не меньше первого долга ${debt}`);
});

// ---------- Прогресс обучения ----------

/**
 * progress.ts читает localStorage при импорте, а состояние держит в модуле. Поэтому каждое сохранение
 * проверяется своей копией модуля (`?case=N`): так видно ровно то, что увидит игрок после обновления игры.
 */
const STORE_KEY = 'dolgovaya-yama-progress';
const TRACKS = ['intro', 'death', 'rescueWin', 'actions'];
let progressCopy = 0;

/** Заглушка localStorage (как в memory.test.mjs) с сохранением saved под ключом прогресса; вернёт хранилище. */
function storeWith(saved) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => void store.set(key, String(value)),
    removeItem: (key) => void store.delete(key),
    clear: () => store.clear(),
  };
  if (saved !== undefined) store.set(STORE_KEY, JSON.stringify(saved));
  return store;
}

/** Свежая копия progress.ts, прочитавшая сохранение saved при импорте. */
async function loadProgress(saved) {
  const store = storeWith(saved);
  progressCopy += 1;
  const PROGRESS = await import(`../src/game/progress.ts?case=${progressCopy}`);
  return { PROGRESS, store };
}

/** Что сейчас лежит в хранилище под ключом прогресса. */
const savedProgress = (store) => JSON.parse(store.get(STORE_KEY));

test('старое сохранение {tutorialDone: true}: тьма пройдена, дорожки по нулям', async () => {
  const { PROGRESS } = await loadProgress({ tutorialDone: true });
  assert.equal(PROGRESS.isTutorialDone(), true, 'мастер-флаг читается');
  assert.equal(PROGRESS.isDarknessDone(), true, 'старый мастер-флаг значит и «тьма погашена»');
  assert.deepEqual(TRACKS.map((track) => PROGRESS.tutorialStep(track)), [0, 0, 0, 0], 'дорожки не начаты');
});

test('мусор в tutorial: строки, дроби, минус и чужие ключи отбрасываются', async () => {
  const { PROGRESS, store } = await loadProgress({ tutorial: { intro: '4', death: 2.5, rescueWin: -3, actions: 7, unknown: 9 } });
  assert.deepEqual(TRACKS.map((track) => PROGRESS.tutorialStep(track)), [0, 0, 0, 7], 'из мусора выжило только целое ≥ 1');
  PROGRESS.setTutorialStep('death', 1); // запись после чтения: по ней видно, что попадает в сохранение
  assert.deepEqual(Object.keys(savedProgress(store).tutorial).sort(), [...TRACKS].sort(), 'чужой ключ unknown в сохранение не вернулся');
});

test('две вкладки: шаги обучения — максимум, флаги — «или»', async () => {
  const { PROGRESS, store } = await loadProgress({}); // своя вкладка отстала: шагов нет, флагов нет
  // Другая вкладка ушла вперёд: прошла пятый бит и смерть, мастер-флаг у неё уже стоит.
  store.set(STORE_KEY, JSON.stringify({ tutorial: { intro: 5, death: 1 }, tutorialDone: true, darknessDone: true }));
  PROGRESS.setTutorialStep('intro', 2); // своя вкладка пишет меньшее — назад дорожку не двигает
  const saved = savedProgress(store);
  assert.equal(saved.tutorial.intro, 5, 'по шагам остаётся больший');
  assert.equal(saved.tutorial.death, 1, 'чужая дорожка не потерялась');
  assert.equal(saved.tutorialDone, true, 'мастер-флаг слит через «или»');
  assert.equal(saved.darknessDone, true, 'тьма тоже');
});

test('setTutorialStep: назад не пишет и клампит к целому ≥ 0', async () => {
  const { PROGRESS, store } = await loadProgress({});
  PROGRESS.setTutorialStep('intro', 3);
  PROGRESS.setTutorialStep('intro', 2);
  assert.equal(PROGRESS.tutorialStep('intro'), 3, '3 → 2 не откатывает дорожку');
  PROGRESS.setTutorialStep('intro', 2.9);
  assert.equal(PROGRESS.tutorialStep('intro'), 3, 'дробь меньше текущего шага тоже назад не пишет');
  PROGRESS.setTutorialStep('intro', -5);
  assert.equal(PROGRESS.tutorialStep('intro'), 3, 'минус не откатывает');
  assert.equal(savedProgress(store).tutorial.intro, 3, 'в хранилище то же, что в памяти');
  PROGRESS.setTutorialStep('actions', 2.9);
  assert.equal(PROGRESS.tutorialStep('actions'), 2, 'дробь клампится вниз до целого');
  PROGRESS.setTutorialStep('rescueWin', -5);
  assert.equal(PROGRESS.tutorialStep('rescueWin'), 0, 'минус на пустой дорожке — ноль');
  PROGRESS.setTutorialStep('death', Number.NaN);
  assert.equal(PROGRESS.tutorialStep('death'), 0, 'мусор считается нулём');
});
