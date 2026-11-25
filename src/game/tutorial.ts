import { t, type TextKey } from './lang';
import { EARLY_PAY_MIN_SPINS, EARLY_PAY_TICKETS, TICKETS_PER_DEBT } from './amulets';
import { SYMBOLS, type Grid, type SlotSymbol } from './rules';
import type { ScreenTone } from './screenText';

/**
 * Обучение текстами: что Диллер говорит и какую сетку показывает. Без Phaser и без сцен — только данные:
 * сцена сама решает, когда показать строку, покрутить «рычаг» и ждать нажатия («забрать»).
 * Сетки собраны только из символов 1-го раунда: новичок видит в обучении ровно то, что уже есть в автомате.
 */

/** Какая сетка ложится на автомат при этом шаге интро. */
export type TutorialSpin = 'empty' | 'pattern' | 'skull' | 'debt';

/** Чего шаг ждёт от игрока: прокрутки, нажатия «забрать» или ничего — тогда шаг сам идёт дальше. */
export type TutorialWait = 'spin' | 'take' | 'none';

/**
 * Кусок строки: ключ надписи (с числами для {0}, {1}…), уже переведённые слова (имя предмета или амулета)
 * или готовый текст. Тон — по умолчанию normal.
 */
export type TutorialPart =
  | { key: TextKey; args?: readonly (string | number)[]; tone?: ScreenTone }
  | { words: readonly string[]; tone?: ScreenTone } // уже переведённое имя (предмет/амулет)
  | { literal: string; tone?: ScreenTone };

/**
 * Строка подсказки: либо одна надпись по ключу, либо набор кусков своих тонов. `hold` — сколько держать
 * именно эту строку; без него берётся общая.
 */
export type TutorialLine =
  | { key: TextKey; args?: readonly (string | number)[]; tone?: ScreenTone; hold?: number }
  | { parts: readonly TutorialPart[]; hold?: number };

/** Шаг интро: что сказать, чего ждать и что показать на автомате. */
export interface IntroStep {
  id: string;
  lines: readonly TutorialLine[];
  wait: TutorialWait;
  spin?: TutorialSpin;
  pause?: number; // пауза перед текстом шага, мс (сцена сама её выдерживает; у again/burn — ждём падения кона)
  openNote?: boolean; // открыть записку с долгом
  clearDark?: boolean; // погасить тьму первого забега
  pulseTake?: boolean; // подсветить кнопку «забрать»
  lastSpin?: boolean; // последний бит: счётчик прокруток сводится к одной, иначе раунд кончился бы на обучении
}

/** Сколько ждать после прокрутки, мс: сначала падает кон, потом говорим. */
export const TUTORIAL_AFTER_SPIN = 1000;
/** Сколько строка висит, мс. Автор не успевал прочитать первую же строку — держим две секунды (DONTLIKE, 25.11). */
export const TUTORIAL_LINE_HOLD = 2000;
/** Длинная строка (больше TUTORIAL_LONG_LINE_CHARS символов) висит дольше: за 2 с её не прочитать (DONTLIKE, 25.11). */
export const TUTORIAL_LONG_LINE_HOLD = 2800;
/** С какой длины строка считается длинной: считаются символы фактического текста, а не куски. */
export const TUTORIAL_LONG_LINE_CHARS = 40;
/** Пауза между битами, мс. */
export const TUTORIAL_PAUSE = 1000;

// Сколько строка гаснет и сколько ждём перед следующей. Значения — как SCREEN_LINE_FADE и SCREEN_LINE_GAP
// в parts/collector.ts: тот модуль тянет Phaser, а здесь нужны только числа для расчёта времени.
const SCREEN_FADE_MS = 220;
const SCREEN_GAP_MS = 120;

/** Текст куска: ключ переводится, готовые слова склеиваются через пробел, литерал — как есть. */
function partText(part: TutorialPart): string {
  if ('key' in part) return t(part.key, ...(part.args ?? []));
  if ('words' in part) return part.words.join(' ');
  return part.literal;
}

/** Строка в куски с тонами: у { key } один кусок, у { parts } — по куску на каждую часть. */
export function tutorialLineParts(line: TutorialLine): readonly { text: string; tone: ScreenTone }[] {
  if ('key' in line) return [{ text: t(line.key, ...(line.args ?? [])), tone: line.tone ?? 'normal' }];
  return line.parts.map((part) => ({ text: partText(part), tone: part.tone ?? 'normal' }));
}

/** Вся строка одним текстом без тонов — для тестов и логов. */
export function tutorialLineText(line: TutorialLine): string {
  return tutorialLineParts(line)
    .map((part) => part.text)
    .join('');
}

/**
 * Строка по рядам: каждый кусок режется по авторским '\n', пустые строки остаются пустыми рядами (отступ),
 * ряд из нескольких кусков — сегменты по порядку.
 */
export function tutorialLineRows(line: TutorialLine): readonly (readonly { text: string; tone: ScreenTone }[])[] {
  const rows: { text: string; tone: ScreenTone }[][] = [];
  let row: { text: string; tone: ScreenTone }[] = [];
  rows.push(row);
  for (const part of tutorialLineParts(line)) {
    part.text.split('\n').forEach((piece, index) => {
      if (index > 0) {
        row = [];
        rows.push(row);
      }
      row.push({ text: piece, tone: part.tone });
    });
  }
  return rows;
}

/** Сколько держать строку: свой hold, иначе общий; длинную строку держим дольше — иначе её не успеть прочитать. */
export function tutorialLineHold(line: TutorialLine, fallback: number): number {
  return line.hold ?? lineHoldFor(tutorialLineText(line), fallback);
}

/** Сколько держать текст строки: длинный держится TUTORIAL_LONG_LINE_HOLD, короткий — fallback. Этой же дверью меряет простая заставка. */
export function lineHoldFor(text: string, fallback: number): number {
  return text.length > TUTORIAL_LONG_LINE_CHARS ? Math.max(fallback, TUTORIAL_LONG_LINE_HOLD) : fallback;
}

/**
 * Сколько идёт речь из строк. chain — как старая заставка: каждая строка держится и гаснет, между строками пауза.
 * wait — последняя строка остаётся висеть, поэтому её hold не считается: done зовётся сразу после её появления.
 * Обучение теперь говорит только цепочкой (tutorialStepMode), режим wait остался дверью заставки.
 */
export function tutorialTalkTime(lines: readonly TutorialLine[], mode: 'chain' | 'wait', fallback: number): number {
  if (lines.length === 0) return 0;
  const holds = lines.map((line) => tutorialLineHold(line, fallback));
  const total = holds.reduce((sum, hold) => sum + hold, 0);
  const pauses = (lines.length - 1) * (SCREEN_FADE_MS + SCREEN_GAP_MS);
  if (mode === 'wait') return total - holds[holds.length - 1] + pauses;
  return total + pauses;
}

/** Символ по id: сетки обучения трогают только символы 1-го раунда, чужих id здесь быть не может. */
function symbolOf(id: string): SlotSymbol {
  const found = SYMBOLS.find((symbol) => symbol.id === id);
  if (!found) throw new Error(`В обучении нет символа ${id}`);
  return found;
}

/**
 * Сетки интро по id символов, 3 ряда × 5 столбцов. Числа выплат считаны по evaluateGrid:
 * pattern — три 🍒 подряд в верхнем ряду (паттерн «ряд из 3» платит в любом ряду), 4 фишки;
 * skull — три 💀 в верхнем ряду: сгорание кона;
 * debt — два ряда из пяти 7️⃣ и первый столбец из 7️⃣: 75 + 75 + 25 = 175 при ×1, это больше startDebt() = 150.
 */
const GRID_IDS: Record<TutorialSpin, readonly (readonly string[])[]> = {
  empty: [
    ['cherry', 'lemon', 'bell', 'diamond', 'seven'],
    ['bell', 'diamond', 'seven', 'cherry', 'lemon'],
    ['seven', 'cherry', 'lemon', 'bell', 'diamond'],
  ],
  pattern: [
    ['cherry', 'cherry', 'cherry', 'lemon', 'bell'],
    ['diamond', 'seven', 'lemon', 'cherry', 'bell'],
    ['bell', 'lemon', 'diamond', 'seven', 'cherry'],
  ],
  skull: [
    ['skull', 'skull', 'skull', 'lemon', 'bell'],
    ['diamond', 'seven', 'lemon', 'cherry', 'bell'],
    ['bell', 'lemon', 'diamond', 'seven', 'cherry'],
  ],
  debt: [
    ['seven', 'seven', 'seven', 'seven', 'seven'],
    ['seven', 'diamond', 'lemon', 'cherry', 'bell'],
    ['seven', 'seven', 'seven', 'seven', 'seven'],
  ],
};

/** Сетка для шага интро: свежая копия, чтобы сцена могла её менять. */
export function tutorialGrid(kind: TutorialSpin): Grid {
  return GRID_IDS[kind].map((row) => row.map(symbolOf));
}

/**
 * Интро (шаг 46б): 10 битов в порядке сценария автора. Бит с wait: 'none' игрок не крутит — он сам передаёт
 * эстафету следующему; сейчас таких нет, но дверь живая. Прокруток в интро 9 (pull, again, lever, debt, burn, tv,
 * goal, places, last) из 12 за раунд; последняя (last) показывает сетку-долг и сводит счётчик к одной.
 * Черепа падают на бите debt — сразу после «Ты обязан его ВЕРНУТЬ», а сгорают на следующем (burn).
 * Записка с долгом проступает на входе в бит debt — одновременно с первой строкой «Это твой текущий ДОЛГ»,
 * а не на бите take: на take остаются только пульс «забрать» и пауза TUTORIAL_AFTER_SPIN (DONTLIKE, 25.11).
 * «Это монитор» и «Бесполезная вещь» — один бит двумя строками: иначе между ними на миг был виден автомат
 * (замечание автора 25.11). Числа в строке про долг нет: «Это твой текущий ДОЛГ».
 */
export function introSteps(): readonly IntroStep[] {
  return [
    { id: 'pull', lines: [{ key: 'tutWhatLooking' }, { key: 'tutPullLever' }], wait: 'spin', spin: 'empty' },
    { id: 'again', lines: [{ key: 'tutTryAgain' }], wait: 'spin', spin: 'pattern', pause: TUTORIAL_AFTER_SPIN },
    { id: 'take', lines: [{ key: 'tutTakePot' }], wait: 'take', pause: TUTORIAL_AFTER_SPIN, pulseTake: true },
    { id: 'lever', lines: [{ key: 'tutSpinFurther' }], wait: 'spin', spin: 'pattern' },
    {
      id: 'debt',
      lines: [
        { parts: [{ key: 'tutDebtPrefix' }, { literal: '\n' }, { key: 'tutDebtWord', tone: 'red' }] },
        { parts: [{ key: 'tutMustReturn' }, { literal: '\n' }, { key: 'tutReturnWord', tone: 'red' }] },
      ],
      wait: 'spin',
      spin: 'skull',
      openNote: true, // записка проступает на входе в бит — вместе с первой строкой «Это твой текущий ДОЛГ»
    },
    {
      id: 'burn',
      lines: [{ parts: [{ key: 'tutSkullsBurnPrefix' }, { literal: '\n' }, { key: 'tutPotWord', tone: 'red' }] }],
      wait: 'spin',
      spin: 'empty',
      pause: TUTORIAL_AFTER_SPIN,
    },
    {
      id: 'tv',
      lines: [{ key: 'tutThisIsMonitor' }, { key: 'tutUselessThing' }],
      wait: 'spin',
      spin: 'empty',
      clearDark: true,
    },
    {
      id: 'goal',
      lines: [{ key: 'tutWhatQ' }, { key: 'tutGoalQ' }, { key: 'tutForgetIt' }, { key: 'tutNeverReach' }],
      wait: 'spin',
      spin: 'empty',
    },
    {
      id: 'places',
      lines: [
        { parts: [{ key: 'tutBoxesFor' }, { literal: '\n' }, { key: 'tutItemsWord', tone: 'orange' }] },
        { key: 'tutIfYouSurvive' },
        { key: 'tutWhereQ' },
        { key: 'tutInShop' },
        {
          parts: [
            { key: 'tutIfOfCourse' },
            { literal: '\n' },
            { key: 'tutSurviveDebt' },
            { literal: ' ' },
            { key: 'tutDebtWord', tone: 'red' },
          ],
        },
      ],
      wait: 'spin',
      spin: 'empty',
    },
    { id: 'last', lines: [], wait: 'spin', spin: 'debt', lastSpin: true },
  ];
}

/**
 * Режим заставки бита. Раньше бит, ждавший рычага или «забрать», оставлял последнюю строку висеть (wait) — её
 * снимало действие игрока. Автор передумал (DONTLIKE, 25.11): текст должен догаснуть сам через несколько секунд,
 * иначе непонятно, что делать, — поэтому все биты идут цепочкой (chain). Строки гаснут по своим hold, экран
 * остаётся пустым, и только потом бит начинает ждать рычага или «забрать». Режим wait у заставки остался,
 * но обучение им больше не говорит.
 */
export function tutorialStepMode(_step: IntroStep): 'chain' | 'wait' {
  return 'chain';
}

/**
 * Дорожка денег (шаг 46б): семь строк один раз — после первой оплаты долга, перед магазином. Тон кусков:
 * ФИШКИ белые, БИЛЕТЫ фиолетовые, ВЫЖИВАНИЕ красное — цвета табло и акцентов.
 */
export const MONEY_LINES: readonly TutorialLine[] = [
  { key: 'tutPaidDebt' },
  { key: 'tutLookUp' },
  {
    parts: [
      { key: 'tutNoticedFunds' },
      { literal: '\n' },
      { key: 'tutChipsWord', tone: 'white' },
      { literal: ' и ' },
      { key: 'tutTicketsWord', tone: 'purple' },
    ],
  },
  { parts: [{ key: 'tutYourFunds' }, { literal: '\n' }, { key: 'tutSurviveWord', tone: 'red' }] },
  { parts: [{ key: 'tutChipsWord', tone: 'white' }, { literal: '\n' }, { key: 'tutChipsSimple' }] },
  { parts: [{ key: 'tutTicketsWord', tone: 'purple' }, { literal: '\n' }, { key: 'tutTicketsRare' }] },
  { key: 'tutSpendWisely' },
];

/**
 * Первый магазин (после первого закрытого долга): игрок ничего не купил и закрывает панель.
 * Две строки — вопрос и ответ Дилера, дальше выход из магазина идёт как обычно.
 */
export const SHOP_EMPTY_LINES: readonly TutorialLine[] = [{ key: 'tutShopEmptyQ' }, { key: 'tutShopEmptyOk' }];

/**
 * Первый купленный предмет в витрине (не подарок и не барабан): имя предмета — из данных на текущем языке,
 * поэтому строки собираются функцией, а не константой.
 */
export function firstItemLines(name: string): readonly TutorialLine[] {
  return [
    { key: 'tutBoughtItemQ', args: [name] },
    { key: 'tutDontHope' },
    { key: 'tutUseWhenNeeded' },
    { key: 'tutNotCheap' },
  ];
}

/** Первый купленный амулет (чемодан или мини-чемодан): «до твоей СМЕРТИ», СМЕРТИ — красным. */
export const FIRST_AMULET_LINES: readonly TutorialLine[] = [
  { key: 'tutSeeAboveQ' },
  { key: 'tutYouBoughtAmulet' },
  { key: 'tutAmuletWithYou' },
  { parts: [{ key: 'tutUntilYour' }, { literal: '\n' }, { key: 'tutDeathWord', tone: 'red' }] },
];

/**
 * Ранняя оплата долга: один раз после того, как отдан второй долг, и ДО открытия магазина. Числа — из констант правил:
 * сколько прокруток должно остаться (EARLY_PAY_MIN_SPINS) и сколько билетов даёт такая оплата.
 * Билетов на самом деле два: билет за раннюю оплату (EARLY_PAY_TICKETS) и билет за сам долг (TICKETS_PER_DEBT);
 * улучшение №17 может добавить третий, но база — два, поэтому в тексте 2, а не 1 (DONTLIKE, 25.11).
 * ПРОКРУТКИ — зелёным, БИЛЕТА — фиолетовым, как акценты на табло.
 */
export const EARLY_PAY_LINES: readonly TutorialLine[] = [
  { key: 'tutEarlyForgot' },
  { key: 'tutEarlyCanPay' },
  {
    parts: [
      { key: 'tutEarlyIfLeft' },
      { literal: '\n' },
      { key: 'tutEarlyCount', args: [EARLY_PAY_MIN_SPINS] },
      { literal: ' ' },
      { key: 'tutEarlySpinsWord', tone: 'green' },
    ],
  },
  {
    parts: [
      { key: 'tutEarlyPayAndGet' },
      { literal: '\n' },
      { key: 'tutEarlyCount', args: [EARLY_PAY_TICKETS + TICKETS_PER_DEBT] },
      { literal: ' ' },
      { key: 'tutEarlyTicketsWord', tone: 'purple' },
      { literal: ' ' },
      { key: 'tutEarlyNotOne', args: [TICKETS_PER_DEBT] },
    ],
  },
];

/** Первая смерть: полное объяснение раунда спасения перед спасением (ПОСЛЕДНИЙ ШАНС красным, СТОЛБЕЦ синим). */
export const DEATH_LINES: readonly TutorialLine[] = [
  { key: 'tutDeathEndQ' },
  { key: 'tutDeathNo' },
  { parts: [{ key: 'tutDeathYouHave' }, { literal: '\n' }, { key: 'tutDeathLastChance', tone: 'red' }] },
  { key: 'tutDeathTryPattern' },
  { parts: [{ key: 'tutDeathCanFreeze' }, { literal: '\n' }, { key: 'tutDeathColumn', tone: 'blue' }] },
  { key: 'tutDeathEverySpin' },
  { key: 'tutDeathWontHelp' },
  { key: 'tutDeathSeeAfter' },
];

/** Спасение удалось: Диллер недоволен. */
export const RESCUE_WIN_LINES: readonly TextKey[] = ['tutWinSurvivedQ', 'tutWinPraise', 'tutWinDontForget', 'tutWinNextDeath'];

/** Первая смерть: перед выбором улучшения на следующий забег. */
export const DEATH_SCREEN_LINES: readonly TextKey[] = [
  'tutDeathIsItAll',
  'tutDeathNo',
  'tutDeathBeginning',
  'tutDeathPickUpgrade',
  'tutDeathMaybe',
  'tutDeathMillion',
  'tutDeathLuck',
];

/** Действия между прокрутками: первое появление полки действий (ПАНЕЛЬ ДЕЙСТВИЙ и КАЖДОЕ — зелёным).
 *  «КАЖДОЕ действие» — одно словосочетание в одной строке, «всего 1 раз за раунд» — следующая (DONTLIKE, 25.11). */
export const ACTIONS_LINES: readonly TutorialLine[] = [
  { key: 'tutActionsOh' },
  { key: 'tutActionsForgot' },
  { parts: [{ key: 'tutActionsLeftOfYou' }, { literal: '\n' }, { key: 'tutActionsPanel', tone: 'green' }] },
  { key: 'tutActionsUseful' },
  {
    parts: [
      { key: 'tutActionsYouCanUse' },
      { literal: '\n' },
      { key: 'tutActionsEach', tone: 'green' },
      { literal: ' ' },
      { key: 'tutActionWord' },
    ],
  },
  { key: 'tutActionsOncePerRound' },
  { key: 'tutActionsThinkWhen' },
];
