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
const SCREEN_TEXT = await import('../src/game/screenText.ts');

/** Ключи надписей строки: у { key } один, у { parts } — все ключи его кусков. */
const keysOfLine = (line) =>
  'key' in line ? [line.key] : line.parts.filter((part) => 'key' in part).map((part) => part.key);

/** Все ключи надписей набора строк. */
const keysOfLines = (lines) => lines.flatMap(keysOfLine);

/** Куски строки с готовым текстом (для сравнения с t()) — только у { parts }. */
const partsOf = (line) => {
  assert.ok('parts' in line, 'строка — набор кусков');
  return line.parts;
};

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
  const steps = TUT.introSteps();
  assert.ok(steps.length > 0, 'биты интро есть');
  for (const step of steps) {
    assert.equal(typeof step.id, 'string', 'у бита есть id');
    assert.ok(step.id.length > 0, 'id не пустой');
    assert.ok(['spin', 'take', 'none'].includes(step.wait), `бит ${step.id}: wait из известных`);
    assert.ok(Array.isArray(step.lines), `бит ${step.id}: строки — массив`);
    // Последний бит интро молчит: он только показывает сетку-долг и сводит счётчик прокруток.
    if (step.id !== steps[steps.length - 1].id) assert.ok(step.lines.length > 0, `бит ${step.id}: строки есть`);
  }
  assert.equal(steps[steps.length - 1].lines.length, 0, 'последний бит — без строк');
  for (const [name, track] of [['DEATH_LINES', TUT.DEATH_LINES], ['RESCUE_WIN_LINES', TUT.RESCUE_WIN_LINES], ['DEATH_SCREEN_LINES', TUT.DEATH_SCREEN_LINES], ['ACTIONS_LINES', TUT.ACTIONS_LINES]]) {
    assert.ok(Array.isArray(track) && track.length > 0, `${name} непустой`);
    for (const key of track) assert.equal(typeof key, 'string', `${name}: ключ — строка`);
  }
  assert.ok(Array.isArray(TUT.MONEY_LINES) && TUT.MONEY_LINES.length > 0, 'MONEY_LINES непустой');
});

test('все ключи обучения есть в lang: t() знает каждую надпись', () => {
  const keys = [
    ...keysOfLines(TUT.introSteps().flatMap((step) => step.lines)),
    ...keysOfLines(TUT.MONEY_LINES),
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

test('биты интро: 10 штук, id без повторов, черепа на debt, 9 прокруток из 12', () => {
  const steps = TUT.introSteps();
  assert.equal(steps.length, 10, 'битов 10: «Это монитор» и «Бесполезная вещь» — один бит (DONTLIKE, 25.11)');
  assert.deepEqual(steps.map((step) => step.id), ['pull', 'again', 'take', 'lever', 'debt', 'burn', 'tv', 'goal', 'places', 'last'], 'порядок битов — по сценарию');
  assert.equal(new Set(steps.map((step) => step.id)).size, 10, 'id не повторяются');
  const last = steps.find((step) => step.id === 'last');
  assert.ok(last, 'последний бит last есть');
  assert.equal(last.lastSpin, true, 'последний бит помечен lastSpin');
  assert.equal(last.spin, 'debt', 'последняя прокрутка показывает сетку-долг');
  assert.equal(last.lines.length, 0, 'последний бит молчит: он только крутит сетку-долг');
  const debt = steps.find((step) => step.id === 'debt');
  assert.ok(debt, 'бит debt есть');
  assert.equal(debt.spin, 'skull', 'черепа падают на бите debt, после «Ты обязан его ВЕРНУТЬ»');
  assert.equal(debt.lines.length, 2, 'у бита долга две строки');
  const spins = steps.filter((step) => step.wait === 'spin');
  assert.equal(spins.length, 9, 'прокруток в интро ровно 9');
  assert.ok(spins.length <= RULES.SPINS_PER_ROUND, `прокрутки интро ${spins.length} укладываются в раунд ${RULES.SPINS_PER_ROUND}`);
  const idle = steps.filter((step) => step.wait === 'none');
  assert.equal(idle.length, 0, 'битов без нажатия больше нет: «Бесполезная вещь» ждёт рычага');
  const tv = steps.find((step) => step.id === 'tv');
  assert.equal(tv.lines.length, 2, 'tv — один бит с двумя строками: «Это монитор» и «Бесполезная вещь»');
  assert.equal(tv.clearDark, true, 'тьма гаснет на этом же бите');
  const takes = steps.filter((step) => step.wait === 'take');
  assert.equal(takes.length, 1, '«забрать» бит один');
  assert.equal(takes[0].id, 'take', 'и это take');
  // Режим заставки: биты, ждущие рычага или «забрать», оставляют последнюю строку висеть.
  for (const step of steps) {
    assert.equal(TUT.tutorialStepMode(step), step.wait === 'none' ? 'chain' : 'wait', `бит ${step.id}: режим заставки от wait`);
  }
});

test('записка с долгом открывается на take, тьма гаснет на tv, полка — на places', () => {
  const steps = TUT.introSteps();
  // Сцена больше не хранит номера битов числом: она ищет их в данных — openNote, clearDark и id 'places'.
  // Тест проверяет те же признаки, а не копии чисел: поменяли порядок битов — сцена и тест читают одно место.
  const noteSteps = steps.filter((step) => step.openNote).map((step) => step.id);
  assert.deepEqual(noteSteps, ['take'], 'openNote ровно у одного бита — «Забери кон»');
  const pulseSteps = steps.filter((step) => step.pulseTake).map((step) => step.id);
  assert.deepEqual(pulseSteps, ['take'], 'подсветка «забрать» тоже только на take');
  const darkOffSteps = steps.filter((step) => step.clearDark).map((step) => step.id);
  assert.deepEqual(darkOffSteps, ['tv'], 'тьма гаснет ровно на одном бите — «Это монитор»');
  const take = steps.find((step) => step.id === 'take');
  assert.ok(take && take.pause === TUT.TUTORIAL_AFTER_SPIN, 'записка ждёт паузу после прокрутки, а не проступает сразу');
  assert.equal(steps.filter((step) => step.id === 'places').length, 1, 'бит «Это ящики» один — по его id сцена открывает полку');
});

test('строки про долг — без числа, ДОЛГ и ВЕРНУТЬ красные', () => {
  const steps = TUT.introSteps();
  const debt = steps.find((step) => step.id === 'debt');
  const [first, second] = debt.lines;
  assert.equal(TUT.tutorialLineText(first), `${LANG.t('tutDebtPrefix')}\n${LANG.t('tutDebtWord')}`, 'первая строка — «Это твой текущий\\nДОЛГ», числа нет');
  assert.equal(TUT.tutorialLineText(second), `${LANG.t('tutMustReturn')}\n${LANG.t('tutReturnWord')}`, 'вторая — «Ты обязан его\\nВЕРНУТЬ»');
  const firstParts = partsOf(first);
  assert.deepEqual(firstParts.map((part) => ('key' in part ? part.key : part.literal)), ['tutDebtPrefix', '\n', 'tutDebtWord'], 'куски первой строки — по брифу');
  assert.equal(firstParts[firstParts.length - 1].tone, 'red', 'слово ДОЛГ красное');
  assert.equal(partsOf(second).at(-1).tone, 'red', 'слово ВЕРНУТЬ красное');
  const rows = TUT.tutorialLineRows(first);
  // Пустые куски рядов — след авторского '\n' (collector их не рисует), поэтому в проверке их отбрасываем.
  assert.deepEqual(rows.map((row) => row.map((segment) => segment.text).filter((text) => text.length > 0)), [['Это твой текущий'], ['ДОЛГ']], 'ДОЛГ — второй ряд');
});

test('«Черепа сожгут весь кон» — красное только КОН', () => {
  const burn = TUT.introSteps().find((step) => step.id === 'burn');
  assert.equal(burn.lines.length, 1, 'у бита одна строка');
  const line = burn.lines[0];
  assert.equal(TUT.tutorialLineText(line), `${LANG.t('tutSkullsBurnPrefix')}\n${LANG.t('tutPotWord')}`, 'текст — из lang, с авторским переносом');
  const parts = TUT.tutorialLineParts(line);
  assert.deepEqual(parts.map((part) => part.tone), ['normal', 'normal', 'red'], 'красное — только слово КОН');
});

test('дорожка денег: семь строк, ФИШКИ белые, БИЛЕТЫ фиолетовые', () => {
  const lines = TUT.MONEY_LINES;
  assert.equal(lines.length, 7, 'строк ровно семь');
  assert.equal(TUT.tutorialLineText(lines[0]), LANG.t('tutPaidDebt'), 'первая — «Ты расплатился за долг»');
  assert.equal(TUT.tutorialLineText(lines[1]), LANG.t('tutLookUp'), 'вторая — «Посмотри выше на экран»');
  // Третья: «Ты точно заметил\\nФИШКИ и БИЛЕТЫ» — цвета валют те же, что у чисел на табло.
  const third = partsOf(lines[2]);
  assert.deepEqual(third.map((part) => ('key' in part ? part.key : part.literal)), ['tutNoticedFunds', '\n', 'tutChipsWord', ' и ', 'tutTicketsWord'], 'куски третьей строки — по брифу');
  assert.equal(third.find((part) => part.key === 'tutChipsWord').tone, 'white', 'ФИШКИ белые');
  assert.equal(third.find((part) => part.key === 'tutTicketsWord').tone, 'purple', 'БИЛЕТЫ фиолетовые');
  const chips = partsOf(lines[4]);
  const tickets = partsOf(lines[5]);
  assert.equal(chips[0].tone, 'white', 'на пятой строке ФИШКИ тоже белые');
  assert.equal(tickets[0].tone, 'purple', 'на шестой БИЛЕТЫ тоже фиолетовые');
  assert.equal(TUT.tutorialLineText(lines[4]), `${LANG.t('tutChipsWord')}\n${LANG.t('tutChipsSimple')}`, 'пятая — «ФИШКИ\\nосновная валюта»');
  assert.equal(TUT.tutorialLineText(lines[5]), `${LANG.t('tutTicketsWord')}\n${LANG.t('tutTicketsRare')}`, 'шестая — «БИЛЕТЫ\\nредкие»');
  assert.equal(TUT.tutorialLineText(lines[6]), LANG.t('tutSpendWisely'), 'седьмая — «Трать их с умом»');
  for (const line of lines) assert.ok(TUT.tutorialLineText(line).length > 0, 'пустых строк в дорожке нет');
});

// ---------- Богатый текст ----------

test('{ key } и { parts } дают одинаковый текст для простого случая', () => {
  const byKey = TUT.tutorialLineText({ key: 'tutDeathWhat' });
  const byParts = TUT.tutorialLineText({ parts: [{ literal: 'Что' }, { literal: '?' }] });
  assert.equal(byParts, byKey, 'куски склеиваются в ту же строку');
  assert.equal(byKey, LANG.t('tutDeathWhat'), 'ключ переводится тем же t()');
});

test('тона: у куска свой тон, по умолчанию normal; цвета — из theme.ts', () => {
  const parts = TUT.tutorialLineParts({ parts: [{ literal: 'a' }, { literal: 'b', tone: 'red' }, { key: 'tutPull', tone: 'green' }] });
  assert.deepEqual(parts.map((part) => part.tone), ['normal', 'red', 'green'], 'тон куска берётся свой, иначе normal');
  assert.equal(parts[1].text, 'b', 'текст куска — как есть');
  assert.equal(SCREEN_TEXT.SCREEN_TONE_COLORS.normal, '#fbbf24', 'normal — жёлтый LED_COLOR');
  assert.equal(SCREEN_TEXT.SCREEN_TONE_COLORS.red, '#f87171', 'red — RED_TEXT');
  assert.equal(SCREEN_TEXT.SCREEN_TONE_COLORS.green, '#4ade80', 'green — GREEN_TEXT');
  assert.equal(SCREEN_TEXT.TUTORIAL_SCREEN_MAX_WIDTH, 428, 'ширина строки — SCREEN.width − 32');
});

test('ряды режутся по авторскому \\n и пустой ряд остаётся отступом', () => {
  const rows = TUT.tutorialLineRows({ parts: [{ literal: 'один\n\nдва' }] });
  assert.deepEqual(rows.map((row) => row.map((segment) => segment.text)), [['один'], [''], ['два']], 'три ряда, средний пустой');
});

test('речь wait короче chain на hold последней строки, и короче суммы hold', () => {
  const lines = [{ key: 'tutTakePot', hold: 3000 }, { key: 'tutSpinFurther', hold: 1000 }];
  const chain = TUT.tutorialTalkTime(lines, 'chain', 2000);
  const wait = TUT.tutorialTalkTime(lines, 'wait', 2000);
  assert.equal(wait, chain - 1000, 'wait не считает hold последней строки: она висит');
  assert.ok(chain > wait, `chain ${chain} дольше wait ${wait}`);
  assert.ok(wait < 3000 + 1000, `wait ${wait} меньше суммы hold строк 4000: последняя не держится таймером`);
  assert.equal(TUT.tutorialLineHold({ key: 'tutWhatLooking' }, 2000), 2000, 'без своего hold берётся общий');
  assert.equal(TUT.TUTORIAL_LINE_HOLD, 2000, 'строка держится две секунды — автор не успевал прочитать');
  assert.equal(TUT.TUTORIAL_AFTER_SPIN, 1000, 'после прокрутки ждём секунду');
  assert.equal(TUT.TUTORIAL_PAUSE, 1000, 'пауза бита — тоже секунда');
});

test('words с именем предмета склеиваются через пробел', () => {
  const text = TUT.tutorialLineText({ parts: [{ literal: 'Возьми ' }, { words: ['ржавый', 'ключ'] }] });
  assert.equal(text, 'Возьми ржавый ключ');
});

test('старый формат { key } из introSteps читается по-прежнему', () => {
  const first = TUT.introSteps()[0];
  assert.equal(first.lines.length, 2, 'у первого бита две строки: «Что смотришь?» и «Дергай рычаг»');
  assert.deepEqual(first.lines.map((line) => line.key), ['tutWhatLooking', 'tutPullLever'], 'строки — по сценарию');
  assert.equal(TUT.tutorialLineText(first.lines[0]), LANG.t('tutWhatLooking'), 'ключ старого формата переводится');
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
const TRACKS = ['intro', 'death', 'rescueWin', 'actions', 'money'];
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
  assert.deepEqual(TRACKS.map((track) => PROGRESS.tutorialStep(track)), [0, 0, 0, 0, 0], 'дорожки не начаты, деньги тоже');
});

test('мусор в tutorial: строки, дроби, минус и чужие ключи отбрасываются', async () => {
  const { PROGRESS, store } = await loadProgress({ tutorial: { intro: '4', death: 2.5, rescueWin: -3, actions: 7, unknown: 9 } });
  assert.deepEqual(TRACKS.map((track) => PROGRESS.tutorialStep(track)), [0, 0, 0, 7, 0], 'из мусора выжило только целое ≥ 1');
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
