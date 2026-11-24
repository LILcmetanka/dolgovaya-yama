import { socketWord, type TextKey } from './lang';
import { SYMBOLS, type Grid, type SlotSymbol } from './rules';

/**
 * Обучение текстами: что Диллер говорит и какую сетку показывает. Без Phaser и без сцен — только данные:
 * сцена сама решает, когда показать строку, покрутить «рычаг» и ждать нажатия («забрать»).
 * Сетки собраны только из символов 1-го раунда: новичок видит в обучении ровно то, что уже есть в автомате.
 */

/** Какая сетка ложится на автомат при этом шаге интро. */
export type TutorialSpin = 'empty' | 'pattern' | 'skull' | 'debt';

/** Чего шаг ждёт от игрока: прокрутки, нажатия «забрать» или ничего — тогда шаг сам идёт дальше. */
export type TutorialWait = 'spin' | 'take' | 'none';

/** Строка подсказки: ключ надписи и числа для {0}, {1}… */
export interface TutorialLine {
  key: TextKey;
  args?: readonly (string | number)[];
}

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
export const TUTORIAL_AFTER_SPIN = 2000;
/** Сколько строка висит, мс. */
export const TUTORIAL_LINE_HOLD = 2000;
/** Пауза между битами, мс. */
export const TUTORIAL_PAUSE = 2000;

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
 * Интро: 13 битов в этом порядке. sockets — сколько сверху гнёзд под амулеты (число и форма слова в tutSlots).
 * Биты с wait: 'none' игрок не крутит: они сами передают эстафету следующему, как в сценарии автора.
 * Прокруток в интро 9 (pull, again, lever, debt, burn, tvInfo, goal, buy, amulets) из 12 за раунд.
 * Черепа падают на бите debt, сразу после «Это твой долг / отдай его до конца раунда».
 * Записка с долгом проступает из тьмы тоже на debt — после прокрутки с паттерном и паузы на показ выигрыша
 * (сценарий автора 24.11: на «Забери кон» долга ещё не видно).
 */
export function introSteps(sockets: number): readonly IntroStep[] {
  return [
    { id: 'pull', lines: [{ key: 'tutPull' }], wait: 'spin', spin: 'empty' },
    { id: 'again', lines: [{ key: 'tutAgain' }], wait: 'spin', spin: 'pattern', pause: TUTORIAL_AFTER_SPIN },
    { id: 'take', lines: [{ key: 'tutTake' }], wait: 'take', pause: TUTORIAL_AFTER_SPIN, pulseTake: true },
    { id: 'lever', lines: [{ key: 'tutLever' }], wait: 'spin', spin: 'pattern' },
    { id: 'debt', lines: [{ key: 'tutDebt' }, { key: 'tutPayByRound' }], wait: 'spin', spin: 'skull', openNote: true },
    { id: 'burn', lines: [{ key: 'tutSkullsBurn' }], wait: 'spin', spin: 'empty', pause: TUTORIAL_AFTER_SPIN },
    { id: 'tv', lines: [{ key: 'tutTv' }], wait: 'none', pause: TUTORIAL_PAUSE, clearDark: true },
    { id: 'tvInfo', lines: [{ key: 'tutTvInfo' }], wait: 'spin', spin: 'empty' },
    { id: 'goalNot', lines: [{ key: 'tutGoalNotMillion' }], wait: 'none', pause: TUTORIAL_PAUSE },
    { id: 'goal', lines: [{ key: 'tutGoal' }, { key: 'tutSurvive' }], wait: 'spin', spin: 'empty' },
    { id: 'places', lines: [{ key: 'tutItemPlaces' }], wait: 'none', pause: TUTORIAL_PAUSE },
    { id: 'buy', lines: [{ key: 'tutBuyInShop' }, { key: 'tutUseWisely' }], wait: 'spin', spin: 'empty' },
    {
      id: 'amulets',
      lines: [
        { key: 'tutSlots', args: [sockets, socketWord(sockets)] },
        { key: 'tutAmulets' },
        { key: 'tutBestHere' },
        { key: 'tutBuyTickets' },
        { key: 'tutAmuletsUntilDeath' },
      ],
      wait: 'spin',
      spin: 'debt',
      lastSpin: true,
    },
  ];
}

/** Первая смерть: полное объяснение раунда спасения. */
export const DEATH_LINES: readonly TextKey[] = [
  'tutRescueLaugh',
  'tutRescueHere',
  'tutRescueLook',
  'tutRescuePattern',
  'tutRescueFreeze',
  'tutRescueWontHelp',
  'tutRescueLuck',
];

/** Спасение удалось: Диллер недоволен. */
export const RESCUE_WIN_LINES: readonly TextKey[] = ['tutWinLucky', 'tutWinNextTime', 'tutWinRemember'];

/** Первая смерть: перед выбором улучшения на следующий забег. */
export const DEATH_SCREEN_LINES: readonly TextKey[] = [
  'tutDeathWhat',
  'tutDeathSurprised',
  'tutDeathAlive',
  'tutDeathPick',
  'tutDeathSomeday',
  'tutDeathGoal',
  'tutDeathLuck',
];

/** Действия между прокрутками: первое появление полки действий. */
export const ACTIONS_LINES: readonly TextKey[] = [
  'tutActionsOh',
  'tutActionsAffect',
  'tutActionsCareful',
  'tutActionsOnce',
  'tutActionsUseful',
  'tutActionsThink',
];
