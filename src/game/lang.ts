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
  newSymbol: { ru: 'НОВЫЙ СИМВОЛ', en: 'NEW SYMBOL' },
  warning: { ru: 'ВНИМАНИЕ', en: 'WARNING' },
  phase: { ru: 'ФАЗА', en: 'PHASE' }, // «ФАЗА 2» на стекле
  debtCovered: { ru: 'ДАЛЬШЕ — ПРИБЫЛЬ', en: "NOW IT'S PROFIT" }, // на стекле: на долг хватает — дальше крутишь себе в плюс
  rerollAsk: { ru: 'ПОМЕНЯТЬ СЕТКУ?', en: 'CHANGE THE GRID?' }, // окно перемешки и подмены
  rerollColumn: { ru: 'КАКОЙ СТОЛБЕЦ?', en: 'WHICH COLUMN?' },
  rerollCell: { ru: 'КАКАЯ КЛЕТКА?', en: 'WHICH CELL?' },
  rerollSkip: { ru: 'Пропустить', en: 'Skip' }, // ✕ в окне
  pause: { ru: 'ПАУЗА', en: 'PAUSE' }, // над знаком паузы
  // Экран на стене (WallScreen): вкладки и их надписи.
  tabSymbols: { ru: 'СИМВОЛЫ', en: 'SYMBOLS' },
  tabHowTo: { ru: 'КАК ИГРАТЬ', en: 'HOW TO PLAY' },
  tabWho: { ru: 'КТО ЕСТЬ КТО', en: "WHO'S WHO" },
  tabItems: { ru: 'ПРЕДМЕТЫ', en: 'ITEMS' },
  tabEmpty: { ru: 'Пока ничего не встретил', en: 'Nothing met yet' },
  whoCollector: { ru: 'Коллектор', en: 'Collector' },
  whoCollectorWhat: {
    ru: 'Приходит за долгом. Фишек не хватает: на экране GOOD LUCK, и автомат крутит сам — забери кон, когда он возьмёт порог. Добрал — чемодан платит долг, но счёт откатывается на один долг назад',
    en: 'Comes for the debt. Short on chips: GOOD LUCK on the screen and the machine spins by itself — take the pot once it reaches the goal. Reach it and a case of chips pays the debt, but the score rolls back one debt',
  },
  whoDealer: { ru: 'Дилер', en: 'Dealer' },
  whoDealerWhat: {
    ru: 'Приходит, когда выпал кубик 🎲. Угадай, следующая карта больше, меньше или такая же: «>» и «<» ×1,5, «=» ×8. Не угадал: кон сгорает',
    en: 'Comes when the 🎲 drops. Guess if the next card is higher, lower or the same: ">" and "<" ×1.5, "=" ×8. Wrong: the pot burns',
  },
  howToGoal: {
    ru: 'Цель. Отдать долг, пока не кончились прокрутки. Каждый раунд долг больше.\n\nКрути автомат: паттерны из одинаковых символов добавляют фишки в кон. Каждая прокрутка подряд поднимает множитель кона. Череп сжигает кон, пока ты его не забрал.\n\nЗабрать: кон уходит на табло, множитель сбрасывается.\n\nФишек на долг хватает: отдай его записке или банкомату Коллектора, потом магазин. Не хватает: на экране GOOD LUCK, и автомат крутит сам — забери кон, когда он возьмёт порог. Добрал — долг закрыт, фишки целы, счёт на один долг назад; не добрал — конец забега.',
    en: 'Goal. Pay the debt before you run out of spins. The debt grows every round.\n\nSpin the machine: patterns of matching symbols add chips to the pot. Each spin in a row raises the pot multiplier. A skull burns the pot until you take it.\n\nTake: the pot goes to the board, the multiplier resets.\n\nEnough chips for the debt: hand it to the note or the Collector\'s ATM, then the shop. Not enough: GOOD LUCK on the screen and the machine spins by itself — take the pot once it reaches the goal. Reach it and the debt is paid, your chips stay, the score goes one debt back; miss it and the run is over.',
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
  // Монитор справа: что делает каждый особый символ. {0}, {1} — числа из правил (их подставляет монитор).
  skullNote: { ru: 'Паттерн из черепов сжигает кон', en: 'A skull pattern burns the pot' },
  ticketNote: { ru: '{0} на экране — билет', en: '{0} on screen — a ticket' },
  jokerNote: { ru: 'Заменяет любой символ в паттерне', en: 'Stands in for any symbol in a pattern' },
  diceNote: { ru: 'Игра Дилера: больше или меньше', en: "Dealer's game: higher or lower" },
  spiderNote: { ru: 'Съедает {0}% кона', en: 'Eats {0}% of the pot' },
  cloverNote: { ru: 'Следующая прокрутка — с паттерном', en: 'Next spin hits a pattern' },
  lockNote: { ru: 'Паттерны через его столбец не считаются', en: "Patterns through its column don't count" },
  crownNote: { ru: '{0} на экране — прокрутки без черепов: {1}', en: '{0} on screen — free spins, no skulls: {1}' },
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
