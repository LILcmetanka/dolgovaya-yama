/**
 * Язык игры: русский или английский. Без Phaser.
 * В первый раз язык берётся из браузера (русский браузер — русский, иначе английский),
 * потом — тот, что выбрал игрок (L или «RU/EN» в углу); выбор запоминается в localStorage.
 * Все надписи — здесь, в TEXTS, а названия и описания предметов и амулетов — рядом с ними, в items.ts и amulets.ts.
 */

export type Lang = 'ru' | 'en';

/** Надпись на двух языках. */
export type Words = Record<Lang, string>;

const LANG_KEY = 'dolgovaya-yama-lang'; // ключ выбранного языка в localStorage

/** Все надписи игры. Текста на экране минимум — поэтому их так мало. */
const TEXTS = {
  debt: { ru: 'ДОЛГ', en: 'DEBT' }, // на записке
  again: { ru: 'ЗАНОВО', en: 'AGAIN' },
  debtsPaid: { ru: 'Долгов закрыто', en: 'Debts paid' },
  best: { ru: 'Рекорд', en: 'Best' },
  // Экран победы: набрано 1 000 000 за забег — на экране автомата заголовок, под ним итог и «ЗАНОВО» с «ДАЛЬШЕ».
  // «ДАЛЬШЕ» продолжает тот же забег с целью 10 000 000 — там уже экран РЕКОРД и только «ЗАНОВО».
  victory: { ru: 'ПОБЕДА', en: 'VICTORY' },
  record: { ru: 'РЕКОРД', en: 'RECORD' },
  continueRun: { ru: 'ДАЛЬШЕ', en: 'CONTINUE' },
  victoryScore: { ru: 'Набрано: {0} · рекорд: {1}', en: 'Earned: {0} · record: {1}' },
  newSymbol: { ru: 'НОВЫЙ СИМВОЛ', en: 'NEW SYMBOL' },
  warning: { ru: 'ВНИМАНИЕ', en: 'WARNING' },
  phase: { ru: 'ФАЗА', en: 'PHASE' }, // «ФАЗА 2» на стекле
  // Строка «💀 N%» под окошком множителя и знак ×▲ — что они значат (замечание 19: черепа растут сами, фаза 2 даёт прокрутку).
  skullShareTitle: { ru: 'Доля черепов', en: 'Skull share' },
  skullShareWhat: {
    ru: 'Столько клеток автомата — 💀. Каждый раунд доля растёт; 🧄 уменьшает её вдвое до конца раунда',
    en: 'That much of the machine is 💀. The share grows every round; 🧄 halves it until the round ends',
  },
  phase2Title: { ru: 'Фаза 2', en: 'Phase 2' },
  phase2What: {
    ru: '+1 прокрутка в каждом раунде; доля черепов растёт с каждым раундом сама',
    en: '+1 spin every round; the skull share grows on its own every round',
  },
  debtCovered: { ru: 'ДАЛЬШЕ — ПРИБЫЛЬ', en: "NOW IT'S PROFIT" }, // на стекле: на долг хватает — дальше крутишь себе в плюс
  // Цель забега: первая строка вкладки «Как играть» и новость на стекле, когда набранное перевалило порог.
  howToGoalLine: { ru: 'ЦЕЛЬ {0} · набрано {1} ({2}%)', en: 'GOAL {0} · earned {1} ({2}%)' },
  howToRecord: { ru: '{0} — рекорд после победы', en: '{0} — record after the victory' },
  chipsMilestone: { ru: 'НАБРАНО {0} · {1}% ЦЕЛИ', en: '{0} EARNED · {1}% OF GOAL' },
  patternNew: { ru: 'НОВЫЙ ПАТТЕРН ×{0}', en: 'NEW PATTERN ×{0}' }, // на стекле: паттерн выпал впервые
  patternKnown: { ru: 'ПАТТЕРН ×{0}', en: 'PATTERN ×{0}' }, // он уже открывался раньше (например, до отката кассетой)
  rerollAsk: { ru: 'ПОМЕНЯТЬ СЕТКУ?', en: 'CHANGE THE GRID?' }, // окно перемешки и подмены
  rerollColumn: { ru: 'КАКОЙ СТОЛБЕЦ?', en: 'WHICH COLUMN?' },
  rerollCell: { ru: 'КАКАЯ КЛЕТКА?', en: 'WHICH CELL?' },
  rerollSkip: { ru: 'Пропустить', en: 'Skip' }, // ✕ в окне
  // Последний шанс: цель (множитель паттерна), два действия и четыре кнопки.
  lcGoalPattern: { ru: 'ЦЕЛЬ: ПАТТЕРН ×{0}', en: 'GOAL: PATTERN ×{0}' },
  lcGoalJackpot: { ru: 'ЦЕЛЬ: ТОЛЬКО ДЖЕКПОТ', en: 'GOAL: JACKPOT ONLY' },
  lcActions: { ru: 'ДЕЙСТВИЙ: {0} · КЛАВИШИ 1–4', en: 'ACTIONS: {0} · KEYS 1–4' },
  lcFreeze: { ru: 'Заморозка', en: 'Freeze' },
  lcFreezeWhat: { ru: 'Клавиша 1. Столбец останется как есть, перекрут его не тронет. Бесплатно, действий не тратит', en: 'Key 1. The column stays as it is: a reroll won\'t touch it. Free, costs no actions' },
  lcReroll: { ru: 'Перекрут', en: 'Respin' },
  lcRerollWhat: { ru: 'Клавиша 2. Выбери столбец мышью — он выпадет заново чистыми символами. Одно действие', en: 'Key 2. Pick a column with the mouse — it drops again with clean symbols. One action' },
  lcJoker: { ru: 'Джокер', en: 'Joker' },
  lcJokerWhat: { ru: 'Клавиша 3. Выбери клетку мышью — в ней встанет 🃏. Одно действие', en: 'Key 3. Pick a cell with the mouse — a 🃏 takes its place. One action' },
  lcSurrender: { ru: 'Сдаться', en: 'Give up' },
  lcSurrenderWhat: { ru: 'Клавиша 4. Сразу провал последнего шанса', en: 'Key 4. Fail the last chance right away' },
  lcSecondWind: { ru: 'ВТОРОЕ ДЫХАНИЕ', en: 'SECOND WIND' },
  pause: { ru: 'ПАУЗА', en: 'PAUSE' }, // над знаком паузы
  // Экран на стене (WallScreen): вкладки и их надписи.
  tabSymbols: { ru: 'СИМВОЛЫ', en: 'SYMBOLS' },
  tabHowTo: { ru: 'КАК ИГРАТЬ', en: 'HOW TO PLAY' },
  tabWho: { ru: 'КТО ЕСТЬ КТО', en: "WHO'S WHO" },
  tabItems: { ru: 'ПРЕДМЕТЫ', en: 'ITEMS' },
  tabEmpty: { ru: 'Пока ничего не встретил', en: 'Nothing met yet' },
  whoCollector: { ru: 'Коллектор', en: 'Collector' },
  whoCollectorWhat: {
    ru: 'Приходит за долгом. Не хватает фишек — GOOD LUCK: одна чистая прокрутка и два действия, чтобы собрать паттерн нужного множителя',
    en: 'Comes for the debt. Short on chips — GOOD LUCK: one clean spin and two actions to land a pattern of the right multiplier',
  },
  whoDealer: { ru: 'Дилер', en: 'Dealer' },
  whoDealerWhat: {
    ru: 'Выпал 🎲 — угадай: «>», «<» ×1,5, «=» ×8. Не угадал — кон сгорает',
    en: 'The 🎲 drops — guess: ">", "<" ×1.5, "=" ×8. Wrong — the pot burns',
  },
  howToGoal: {
    ru: 'Цель. Отдать долг, пока не кончились прокрутки. Каждый раунд долг больше.\n\nКрути автомат: паттерны из одинаковых символов добавляют фишки в кон. Каждая прокрутка подряд поднимает множитель кона. Череп сжигает кон, пока ты его не забрал.\n\nЗабрать: кон уходит на табло, множитель уменьшается вдвое.\n\nФишек на долг хватает: отдай его записке или банкомату Коллектора, потом магазин. Не хватает: на экране GOOD LUCK, автомат делает одну чистую прокрутку — без черепов и злых символов. У тебя два действия: перекрутить столбец или поставить джокера в клетку, заморозка столбца бесплатная. Цель написана на полосе — это нужный множитель паттерна: собери его, и долг закрыт, фишки целы, счёт на один долг назад. Не добрал или сдался — провал: первый за забег даёт второе дыхание (счёт −1 и магазин), второй — конец забега. Схемы паттернов на стекле над экраном проступают, когда паттерн впервые выпадает.',
    en: 'Goal. Pay the debt before you run out of spins. The debt grows every round.\n\nSpin the machine: patterns of matching symbols add chips to the pot. Each spin in a row raises the pot multiplier. A skull burns the pot until you take it.\n\nTake: the pot goes to the board, the multiplier is halved.\n\nEnough chips for the debt: hand it to the note or the Collector\'s ATM, then the shop. Not enough: GOOD LUCK on the screen and the machine makes one clean spin — no skulls, no evil symbols. You have two actions: reroll a column or drop a joker into a cell; freezing a column is free. The goal is written on the bar: it is the pattern multiplier you need — land it and the debt is paid, your chips stay, the score goes one debt back. Miss it or give up — you fail: the first failure gives a second wind (score −1 and the shop), the second ends the run. The pattern diagrams on the glass above the screen appear once a pattern has landed for the first time.',
  },
  howToKeys: {
    ru: 'Клавиши\nПробел: крутить, назад из магазина\nEnter: забрать кон, отдать долг\nD: отдать долг раньше\n1–8: предмет с полки\n→ или клик: этот экран\nEsc или P: пауза\nM: звук\nL: язык\nT: режим прокрутки\n\nВ магазине\n1–4: торговый автомат\n5–8: чемодан с амулетами\n9: кассета, 0: барабан',
    en: 'Keys\nSpace: spin, leave the shop\nEnter: take the pot, pay the debt\nD: pay the debt early\n1–8: shelf item\n→ or click: this screen\nEsc or P: pause\nM: sound\nL: language\nT: spin mode\n\nIn the shop\n1–4: vending machine\n5–8: amulet suitcase\n9: tape, 0: drum',
  },
  // Переключатель режима прокрутки у рычага (шаг 70): три плашки.
  spinModeTitle: { ru: 'Режим прокрутки', en: 'Spin mode' },
  spinModeNormal: { ru: 'ОБЫЧНО', en: 'NORMAL' },
  spinModeRisk: { ru: 'РИСК', en: 'RISK' },
  spinModeCalm: { ru: 'СПОКОЙНО', en: 'CALM' },
  spinModeNormalWhat: {
    ru: 'Обычная прокрутка: черепа и выигрыш как есть. Бесплатные прокрутки, смена автомата и последний шанс — по обычным правилам',
    en: 'Normal spin: skulls and winnings as usual. Free spins, machine change and last chance follow the usual rules',
  },
  spinModeRiskWhat: {
    ru: 'Черепов {0} чаще, выигрыш {1}. Складывается с предметом «Риск». Бесплатные прокрутки, смена автомата и последний шанс — по обычным правилам',
    en: 'Skulls {0} as often, winnings {1}. Stacks with the "Risk" item. Free spins, machine change and last chance follow the usual rules',
  },
  spinModeCalmWhat: {
    ru: 'Черепов и выигрыша нет — только серия +1. Заряженные предметы и смена автомата их не тратят. Заевший столбец спокойная прокрутка не переносит. Бесплатные прокрутки и последний шанс — по обычным правилам',
    en: 'No skulls and no winnings — only the streak +1. Charged items and a machine change do not spend them. A calm spin does not carry the jammed column over. Free spins and last chance follow the usual rules',
  },
  closedSlot: { ru: 'Закрытое место', en: 'Locked slot' },
  closedSlotHow: { ru: 'Открывается за фишки в магазине', en: 'Opens for chips in the shop' },
  shelfSlot: { ru: 'Место на полке', en: 'Shelf slot' },
  shelfSlotWhat: { ru: 'Ещё одна клетка для предмета', en: 'One more place for an item' },
  closedSocket: { ru: 'Закрытое гнездо', en: 'Locked socket' },
  closedSocketHow: { ru: 'Открывается за билеты в витрине', en: 'Opens for tickets in the showcase' },
  socket: { ru: 'Гнездо', en: 'Socket' },
  socketWhat: { ru: 'Ещё одно место для амулета', en: 'One more place for an amulet' },
  ticket: { ru: 'Билет', en: 'Ticket' }, // без эмодзи 🎟: билет в игре — одна красная картинка (decor.ts)
  ticketWhat: { ru: 'На амулеты и гнёзда', en: 'Buys amulets and sockets' },
  drum: { ru: 'Барабан', en: 'Wheel' }, // колесо в магазине
  drumWhat: { ru: 'Крути за фишки. Каждая следующая прокрутка — цена ×{0}', en: 'Spin for chips. Each next spin: price ×{0}' },
  tape: { ru: 'Кассета', en: 'Cassette' },
  tapeWhat: { ru: 'Запиши забег как есть — и вернись к записи, когда попадёшь в беду. Автомат съест кассету', en: 'Record the run as it is — and go back to it when things go wrong. The machine eats the tape' },
  tapeBlank: { ru: 'Чистая. Между прокрутками — запиши забег как есть, переписать нельзя', en: 'Blank. Between spins — record the run as it is, no re-recording' },
  tapeRecorded: { ru: 'Записано. Между прокрутками — вернись к записи', en: 'Recorded. Between spins — go back to the recording' },
  vcr: { ru: 'Видеомагнитофон', en: 'VCR' },
  vcrWhat: { ru: 'Кассета к нему — в магазине', en: 'Its cassette is sold in the shop' },
  // Включённые предметы у экрана: четыре места, лишний предмет не включается, пока место не освободили кликом.
  effectsFull: { ru: 'Все 4 места заняты — снимите предмет у экрана', en: 'All 4 slots are taken — remove an item from the screen' },
  effectRemove: { ru: 'Нажмите, чтобы убрать', en: 'Click to remove' },
  // Выбор автомата в магазине: сам выбор бесплатный, прокачка — за билеты.
  machinePickWhat: { ru: 'Выбрать бесплатно: встанет со следующего раунда', en: 'Pick for free: takes effect next round' },
  machineUpgrade: { ru: 'Прокачать до ур. {0}', en: 'Upgrade to lvl {0}' },
  machineUpgradeWhat: { ru: 'Билетов: {0}', en: 'Tickets: {0}' },
  machineUpgradeBranch: {
    ru: 'На 3-м уровне ветка по умолчанию — «−10% черепа», потом меняется кнопкой',
    en: 'At level 3 the branch defaults to −10% skulls; change it with the button',
  },
  machineMaxLevel: { ru: 'Последний уровень', en: 'Top level' },
  machineBranchWhat: { ru: 'Что даёт третий уровень: ветку можно выбрать одну', en: 'What level 3 gives: pick one branch' },
  // Монитор справа: что делает каждый особый символ. {0}, {1} — числа из правил (их подставляет монитор).
  skullNote: { ru: 'Паттерн из черепов сжигает кон; сейчас {0}% клеток', en: 'A skull pattern burns the pot; {0}% of cells now' },
  ticketNote: { ru: '{0} на экране — билет', en: '{0} on screen — a ticket' },
  jokerNote: { ru: 'Заменяет любой символ в паттерне', en: 'Stands in for any symbol in a pattern' },
  diceNote: { ru: 'Игра Дилера: больше или меньше', en: "Dealer's game: higher or lower" },
  spiderNote: { ru: 'Съедает {0}% кона', en: 'Eats {0}% of the pot' },
  cloverNote: { ru: 'Следующая прокрутка — с паттерном; клеверов больше — паттерн сильнее', en: 'Next spin hits a pattern; more clovers — a stronger pattern' },
  lockNote: { ru: 'Паттерны через его столбец не считаются', en: "Patterns through its column don't count" },
  crownNote: {
    ru: '{0} на экране — прокрутки без черепов, кубика, пауков, замков и крови: {1}',
    en: '{0} on screen — free spins, no skulls, dice, spiders, locks or blood: {1}',
  },
  bloodNote: { ru: 'Следующая прокрутка ×{0}, но черепа жгут и табло', en: 'Next spin ×{0}, but skulls burn your chips too' },
  jackpotNote: { ru: 'Джекпот: билеты +{0}, прокрутки +{1}', en: 'Jackpot: tickets +{0}, spins +{1}' },
} satisfies Record<string, Words>;

export type TextKey = keyof typeof TEXTS;

/** Язык при запуске: выбранный раньше, иначе — по языку браузера. Хранилище недоступно — по браузеру. */
function startLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // localStorage запрещён — язык по браузеру
  }
  return navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

let current: Lang = startLang();

/** Какой язык сейчас. */
export function lang(): Lang {
  return current;
}

/** Переключить язык (русский ↔ английский) и запомнить выбор. */
export function toggleLang(): void {
  current = current === 'ru' ? 'en' : 'ru';
  try {
    localStorage.setItem(LANG_KEY, current);
  } catch {
    // не запомнили — в следующий раз язык снова по браузеру
  }
}

/**
 * Надпись на текущем языке: ключ из TEXTS или своя пара { ru, en } (название предмета, амулета).
 * values — числа для {0}, {1}… в надписи: так числа на экране всегда те же, что в правилах.
 */
export function t(text: TextKey | Words, ...values: (string | number)[]): string {
  const words = typeof text === 'string' ? TEXTS[text] : text;
  return values.reduce<string>((line, value, index) => line.replace(`{${index}}`, String(value)), words[current]);
}

/**
 * Число фишек с пробелами между тысячами: 1234567 → «1 234 567». Так цель «1 000 000» читается как на табло,
 * а не «1000000». Округляем: дробных фишек в игре нет.
 */
export function formatChips(value: number): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

