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
  goal: { ru: 'ЦЕЛЬ', en: 'GOAL' }, // на второй записке — над экраном на стене
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
  // Экранчик доли черепов слева от сетки — что он значит (замечание 19: черепа растут сами, фаза 2 даёт прокрутку).
  skullShareTitle: { ru: 'Доля черепов', en: 'Skull share' },
  skullShareWhat: {
    ru: 'Столько клеток автомата — 💀. Каждый раунд доля растёт; 🧄 уменьшает её вдвое до конца раунда',
    en: 'That much of the machine is 💀. The share grows every round; 🧄 halves it until the round ends',
  },
  phase2Title: { ru: 'Фаза 2', en: 'Phase 2' },
  // Подсказка к знаку фазы 2: знак ×▲ автор убрал (DONTLIKE б.1), поэтому сейчас эти две строки нигде не показываются.
  // Оставлены резервом: вернуть знак в PHASE_SIGNS — и подсказка снова заработает, тексты готовы.
  phase2What: {
    ru: '+1 прокрутка в каждом раунде; доля черепов растёт с каждым раундом сама',
    en: '+1 spin every round; the skull share grows on its own every round',
  },
  debtCovered: { ru: 'ДАЛЬШЕ — ПРИБЫЛЬ', en: "NOW IT'S PROFIT" }, // на стекле: на долг хватает — дальше крутишь себе в плюс
  // Цель забега: новость на стекле, когда набранное перевалило порог (сама цель — на записке над экраном).
  chipsMilestone: { ru: 'НАБРАНО {0}', en: '{0} EARNED' },
  patternNew: { ru: 'НОВЫЙ ПАТТЕРН ×{0}', en: 'NEW PATTERN ×{0}' }, // на стекле: паттерн выпал впервые
  patternKnown: { ru: 'ПАТТЕРН ×{0}', en: 'PATTERN ×{0}' }, // он уже открывался раньше (например, до отката кассетой)
  rerollAskRespin: { ru: 'ПЕРЕКРУТИТЬ?', en: 'RESPIN?' }, // новость на стекле: перемешка заряжена
  rerollAskSwap: { ru: 'ПОДМЕНА?', en: 'SWAP?' },
  // Раунд спасения (шаг 27): вместо старого последнего шанса. Красный экран, 5 прокруток, заморозка столбцов.
  // Кнопок на полосе нет: столбец морозят кликом, прокрутку даёт рычаг. Долг после выживания остаётся тем же.
  rescueTitle: { ru: 'СПАСЕНИЕ', en: 'RESCUE' },
  rescueSpins: { ru: 'ОСТАЛОСЬ ПРОКРУТОК: {0}', en: 'SPINS LEFT: {0}' },
  rescueGoal: { ru: 'СОБЕРИ ПАТТЕРН', en: 'LAND A PATTERN' },
  rescueDebtStays: { ru: 'ДОЛГ ОСТАЁТСЯ', en: 'THE DEBT STAYS' },
  rescueFreezeHint: { ru: 'Клик по столбцу — заморозить или разморозить. Одно действие за прокрутку', en: 'Click a column to freeze or unfreeze it. One action per spin' },
  rescueFreezeUsed: { ru: 'Заморозка в этом ходу использована — крути рычаг', en: 'Freeze used this spin — pull the lever' },
  rescueSurvived: { ru: 'ПАТТЕРН СОБРАН', en: 'PATTERN LANDED' },
  rescueSecondWind: { ru: 'ВТОРОЕ ДЫХАНИЕ', en: 'SECOND WIND' },
  // Пояснение к попапу: почему забег жив, хотя спасение провалено (DONTLIKE б.12).
  // Со сделкой №9 запасов может быть больше одного, поэтому «второй провал» заранее не обещаем.
  rescueSecondWindWhat: {
    ru: 'провал прощён: счёт на один долг назад. Запасы кончились — конец забега',
    en: 'the failure is forgiven: the score goes one debt back. No reserves left — the run ends',
  },
  // Память амулетов после смерти (шаг 26): один амулет погибшего забега переезжает в следующий за билеты.
  // Цены (2 за обычный, 3 за редкий) — числами под амулетами; название стоит в строке памяти после выбора.
  memoryTitle: { ru: 'ВИТРИНА ПАМЯТИ', en: 'MEMORY SHOWCASE' },
  memoryKept: { ru: 'В ПАМЯТИ: {0}', en: 'REMEMBERED: {0}' },
  pause: { ru: 'ПАУЗА', en: 'PAUSE' }, // над знаком паузы
  // Экран на стене (WallScreen): вкладки и их надписи.
  tabSymbols: { ru: 'СИМВОЛЫ', en: 'SYMBOLS' },
  tabHowTo: { ru: 'КАК ИГРАТЬ', en: 'HOW TO PLAY' },
  // Подписи под клавишами на вкладке «Как играть» (wallScreen.buildHowTo): одно слово, иначе не влезает.
  keySpin: { ru: 'крутить', en: 'spin' },
  keyTake: { ru: 'забрать', en: 'take' },
  keyDebt: { ru: 'долг', en: 'debt' },
  keyItems: { ru: 'предметы', en: 'items' },
  keyPause: { ru: 'пауза', en: 'pause' },
  keyLanguage: { ru: 'язык', en: 'language' },
  keySound: { ru: 'звук', en: 'sound' },
  keyShop: { ru: 'магазин', en: 'shop' },
  keyAmulets: { ru: 'амулеты', en: 'amulets' },
  keyCassette: { ru: 'кассета', en: 'tape' },
  keyDrum: { ru: 'барабан', en: 'drum' },
  tabWho: { ru: 'КТО ЕСТЬ КТО', en: "WHO'S WHO" },
  tabItems: { ru: 'ПРЕДМЕТЫ', en: 'ITEMS' },
  tabAchievements: { ru: 'АЧИВКИ', en: 'ACHIEVEMENTS' }, // вкладка планшета: все ачивки, полученные и нет
  tabEmpty: { ru: 'Пока ничего не встретил', en: 'Nothing met yet' },
  // Режим разработчика: раздел «?» на планшете (строка с кодом) и его вкладка «ТЕСТ».
  devTab: { ru: 'ТЕСТ', en: 'TEST' },
  devCodeAsk: { ru: 'КОД', en: 'CODE' },
  devCodeHint: { ru: 'Enter — подтвердить', en: 'Enter to confirm' },
  devConfirm: { ru: 'ОК', en: 'OK' },
  devCodeWrong: { ru: 'НЕВЕРНО', en: 'WRONG' },
  devItems: { ru: 'ПРЕДМЕТЫ', en: 'ITEMS' },
  devAmulets: { ru: 'АМУЛЕТЫ', en: 'AMULETS' },
  devChips: { ru: '+{0} фишек', en: '+{0} chips' },
  devTickets: { ru: '+{0} билетов', en: '+{0} tickets' },
  devExit: { ru: 'ВЫЙТИ', en: 'EXIT' },
  whoCollector: { ru: 'Коллектор', en: 'Collector' },
  whoCollectorWhat: {
    ru: 'За долгом; не хватило фишек — раунд спасения',
    en: 'For the debt; short on chips — rescue round',
  },
  whoDealer: { ru: 'Дилер', en: 'Dealer' },
  whoDealerWhat: {
    ru: 'Предлагает сделку: баф за дебаф',
    en: 'Offers a deal: a buff for a debuff',
  },
  // Сделки Дилера (dealerGame.ts): карта на сукне — две подписи и две строки (сами тексты сделок — в dealerGame.PACTS).
  pactBonus: { ru: 'ПОЛУЧАЕШЬ', en: 'YOU GET' },
  pactCost: { ru: 'ПЛАТИШЬ', en: 'YOU PAY' },
  pactRefuse: { ru: 'ОТКАЗАТЬСЯ', en: 'REFUSE' }, // кнопка внизу сукна, перед ней ✕
  pactPickSymbol: { ru: 'ВЫБЕРИ СИМВОЛ', en: 'PICK A SYMBOL' }, // карта №11: ряд кнопок-символов на сукне
  pactNews: { ru: 'СДЕЛКА: {0} / {1}', en: 'DEAL: {0} / {1}' }, // новость на стекле, когда сделку взяли
  pactOver: { ru: 'СДЕЛКА КОНЧИЛАСЬ', en: 'THE DEAL IS OVER' }, // новость на стекле, когда срок вышел
  pactNoRoom: { ru: 'НЕТ МЕСТА ПОД АМУЛЕТ', en: 'NO ROOM FOR AN AMULET' }, // карта №13: сосуд занят — взять нельзя
  pactAlreadyTaken: { ru: 'ЭТО УЖЕ БРАЛИ', en: 'ALREADY TAKEN' }, // карта №9: запас дыхания один раз за забег
  shopClosedByPact: { ru: 'МАГАЗИН ЗАКРЫТ СДЕЛКОЙ', en: 'SHOP CLOSED BY THE DEAL' }, // вместо панели магазина
  closedSlot: { ru: 'Закрытое место', en: 'Locked slot' },
  closedSlotHow: { ru: 'Открывается за фишки в магазине', en: 'Opens for chips in the shop' },
  shelfSlot: { ru: 'Место на полке', en: 'Shelf slot' },
  shelfSlotWhat: { ru: 'Ещё одна клетка для предмета', en: 'One more place for an item' },
  closedSocket: { ru: 'Закрытое гнездо', en: 'Locked socket' },
  closedSocketHow: { ru: 'Открывается за билеты в витрине', en: 'Opens for tickets in the showcase' },
  socket: { ru: 'Гнездо', en: 'Socket' },
  socketWhat: { ru: 'Ещё одно место для амулета', en: 'One more place for an amulet' },
  // Дверца маленького автомата в магазине: пока закрыта, витрины не видно — клик по ней открывает.
  miniDoor: { ru: 'Дверца витрины', en: 'Showcase door' },
  miniDoorOpen: {
    ru: 'Клик — открыть: за ней место на полке за фишки и гнездо за билеты',
    en: 'Click to open: a shelf slot for chips and a socket for tickets behind it',
  },
  ticket: { ru: 'Билет', en: 'Ticket' }, // без эмодзи 🎟: билет в игре — одна красная картинка (decor.ts)
  ticketWhat: { ru: 'На амулеты и гнёзда', en: 'Buys amulets and sockets' },
  // Билет за фишки — четвёртый ряд торгового автомата (шаг 13): цена — доля фишек на руках, и она растёт с покупками.
  shopTicket: { ru: 'Билет', en: 'Ticket' },
  shopTicketWhat: {
    ru: 'Один билет за долю фишек на руках; каждый следующий дороже',
    en: 'One ticket for a share of your chips; each next one costs more',
  },
  // Потолок билетов за магазин (items.TICKETS_PER_SHOP): ряд погас после покупки — почему и где взять ещё.
  shopTicketSold: {
    ru: 'За заход больше не продают — приходи в следующий магазин',
    en: 'No more this visit — come back to the next shop',
  },
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
  // Кнопка выхода в шапке панели магазина — единственный выход (ручки-язычка больше нет).
  shopLeave: { ru: 'К СЛОТ-МАШИНЕ', en: 'TO THE SLOT MACHINE' },
  // Монитор справа: что делает каждый особый символ. {0}, {1} — числа из правил (их подставляет монитор).
  skullNote: { ru: 'Паттерн из черепов сжигает кон; сейчас {0}% клеток', en: 'A skull pattern burns the pot; {0}% of cells now' },
  ticketNote: { ru: '{0} на экране — билет', en: '{0} on screen — a ticket' },
  jokerNote: { ru: 'Заменяет любой символ в паттерне', en: 'Stands in for any symbol in a pattern' },
  diceNote: { ru: 'Игра Дилера: сделка', en: "Dealer's game: a deal" },
  spiderNote: { ru: 'Съедает {0}% кона', en: 'Eats {0}% of the pot' },
  cloverNote: { ru: 'Следующая прокрутка — с паттерном; клеверов больше — паттерн сильнее', en: 'Next spin hits a pattern; more clovers — a stronger pattern' },
  lockNote: { ru: 'Паттерны через его столбец не считаются', en: "Patterns through its column don't count" },
  crownNote: {
    ru: '{0} на экране — прокрутки без черепов, кубика, пауков, замков и крови: {1}',
    en: '{0} on screen — free spins, no skulls, dice, spiders, locks or blood: {1}',
  },
  bloodNote: { ru: 'Следующая прокрутка ×{0}, но черепа жгут и табло', en: 'Next spin ×{0}, but skulls burn your chips too' },
  jackpotNote: { ru: 'Джекпот: билеты +{0}, прокрутки +{1}', en: 'Jackpot: tickets +{0}, spins +{1}' },
  // ---------- Ачивки (achievements.ts): подпись окна, названия и описания. Формулировки автора — в названиях. ----------
  achievementUnlocked: { ru: 'АЧИВКА', en: 'ACHIEVEMENT' },
  achievementNews: { ru: '🏆 {0}', en: '🏆 {0}' }, // новость на стекле: только название, как просил автор
  // ТЕСТ: запись ачивок запрещена (progress.grantAchievement) — вместо молчания один раз за забег новость на стекле.
  achievementDevNotice: { ru: 'ТЕСТ: ачивки не пишутся', en: 'TEST: achievements are not saved' },
  // Панель подробностей ачивки на планшете (wallScreen.ts): статус и то, что видно у неполученной вместо описания.
  achEarned: { ru: 'ПОЛУЧЕНО', en: 'EARNED' },
  achNotEarned: { ru: 'НЕ ПОЛУЧЕНО', en: 'NOT EARNED' },
  achConditionHidden: { ru: 'Условие скрыто', en: 'Condition hidden' },
  achNoSmoke: { ru: 'Не кури', en: "Don't smoke" },
  achNoSmokeWhat: { ru: 'Впервые включил сигарету', en: 'You used a cigarette for the first time' },
  achProtectedShield: { ru: 'Защищён', en: 'Protected' },
  achProtectedShieldWhat: { ru: 'Впервые включил щит', en: 'You used a shield for the first time' },
  achCalm: { ru: 'Спокойствие', en: 'Calm' },
  achCalmWhat: { ru: 'Впервые включил чеснок', en: 'You used garlic for the first time' },
  achMuchTriple: { ru: 'Ого как много', en: 'Oh, so much' },
  achMuchTripleWhat: { ru: 'Впервые включил тройное «забрать»', en: 'You used the triple take for the first time' },
  achManyBerries: { ru: 'Много ягод', en: 'So many berries' },
  achManyBerriesWhat: { ru: 'Впервые включил вишни', en: 'You used cherries for the first time' },
  achDing: { ru: 'Дзынь', en: 'Ding' },
  achDingWhat: { ru: 'Впервые включил колокольчики', en: 'You used bells for the first time' },
  achManyDiamonds: { ru: 'Как много алмазов', en: 'So many diamonds' },
  achManyDiamondsWhat: { ru: 'Впервые включил алмазы', en: 'You used diamonds for the first time' },
  achLuckyMe: { ru: 'Мне повезёт', en: 'Feeling lucky' },
  achLuckyMeWhat: { ru: 'Впервые включил удачу', en: 'You used luck for the first time' },
  achWhatTheHell: { ru: 'Была — не была', en: 'Here goes nothing' },
  achWhatTheHellWhat: { ru: 'Впервые включил риск', en: 'You used risk for the first time' },
  achDamnLock: { ru: 'Туда этот замок!', en: 'Damn this lock!' },
  achDamnLockWhat: { ru: 'Впервые включил молоток', en: 'You used the hammer for the first time' },
  achNoSkulls: { ru: 'Вы где черепа?', en: 'Any skulls here?' },
  achNoSkullsWhat: { ru: 'Впервые включил фарт', en: 'You used the lucky spin for the first time' },
  achLuckyShuffle: { ru: 'Хоть бы повезло', en: 'Fingers crossed' },
  achLuckyShuffleWhat: { ru: 'Впервые включил перемешку', en: 'You used a shuffle for the first time' },
  achSwapJackpot: { ru: 'Это КиШ!', en: "That's a jackpot!" },
  achSwapJackpotWhat: { ru: 'Впервые включил подмену', en: 'You used a swap for the first time' },
  achMoreBerries: { ru: 'Больше ягод', en: 'More berries' },
  achMoreBerriesWhat: { ru: 'Впервые получил «вишнёвую косточку»', en: 'You got the cherry pit amulet for the first time' },
  achPseudoInfinity: { ru: 'Псевдо-бесконечность', en: 'Pseudo-infinity' },
  achPseudoInfinityWhat: { ru: 'Впервые получил амулет «колокольчик»', en: 'You got the bell amulet for the first time' },
  achSoSo: { ru: 'Толи да толи нет', en: 'Hit or miss' },
  achSoSoWhat: { ru: 'Впервые получил копилку', en: 'You got the piggy bank for the first time' },
  achInsured: { ru: 'Застрахован', en: 'Insured' },
  achInsuredWhat: { ru: 'Впервые получил страховку', en: 'You got the insurance amulet for the first time' },
  achBoostSpeed: { ru: 'Разгон', en: 'Boost' },
  achBoostSpeedWhat: { ru: 'Впервые получил разгон', en: 'You got the boost amulet for the first time' },
  achVestOn: { ru: 'На мне бронежилет', en: 'I wear a vest' },
  achVestOnWhat: { ru: 'Впервые получил бронежилет', en: 'You got the vest amulet for the first time' },
  achMoreDiamonds: { ru: 'БОЛЬШЕ АЛМАЗОВ', en: 'MORE DIAMONDS' },
  achMoreDiamondsWhat: { ru: 'Впервые получил «огранку»', en: 'You got the cut amulet for the first time' },
  achStrangeSchemes: { ru: 'Странные схемы', en: 'Strange schemes' },
  achStrangeSchemesWhat: { ru: 'Впервые получил «проценты»', en: 'You got the interest amulet for the first time' },
  achImmoral: { ru: 'Аморальный', en: 'Immoral' },
  achImmoralWhat: { ru: 'Впервые получил «коллекционера костей»', en: 'You got the bone collector for the first time' },
  achSkeletonPack: { ru: 'Пачка скелетов в кармане', en: 'A pack of skeletons in the pocket' },
  achSkeletonPackWhat: { ru: 'Впервые получил «череп в кармане»', en: 'You got the skull-in-pocket amulet for the first time' },
  achGreedyWins: { ru: 'Скупой выигрывает дважды', en: 'The greedy one wins twice' },
  achGreedyWinsWhat: { ru: 'Впервые получил «жадность»', en: 'You got the greed amulet for the first time' },
  achOccupied: { ru: 'ЗАНЯТО!', en: 'OCCUPIED!' },
  achOccupiedWhat: { ru: 'Все шесть гнёзд заняты амулетами', en: 'All six sockets are taken by amulets' },
  achFreebie: { ru: 'Халява', en: 'Freebie' },
  achFreebieWhat: { ru: 'Впервые включил свечку', en: 'You used a candle for the first time' },
  achWrongGame: { ru: 'Я играю не туда', en: 'Playing the wrong game' },
  achWrongGameWhat: { ru: 'Включён предмет «Риск» и «череп в кармане» одновременно', en: 'The Risk item is on and the skull-in-pocket amulet is in place' },
  achInfinity: { ru: 'Бесконечность', en: 'Infinity' },
  achInfinityWhat: { ru: 'Колокольчики и амулет «колокольчик» одновременно', en: 'Bells item and the bell amulet at the same time' },
  achSkeletonKing: { ru: 'Король скелетов', en: 'Skeleton King' },
  achSkeletonKingWhat: { ru: '«Коллекционер костей» и «череп в кармане» одновременно', en: 'Bones collector and skull-in-pocket at the same time' },
  achCheapAndAngry: { ru: 'Дешёво и сердито', en: 'Cheap and cheerful' },
  achCheapAndAngryWhat: { ru: '«Вишнёвая косточка» и вишни одновременно', en: 'Cherry pit amulet and cherries at the same time' },
  achWhereAreSkulls: { ru: 'А где черепа?', en: 'Where are the skulls?' },
  achWhereAreSkullsWhat: { ru: 'Чеснок и амулет, удваивающий выпадение', en: 'Garlic and an amulet that doubles a symbol' },
  achSkullsAreSoLastCentury: { ru: 'Черепа это прошлый век!', en: 'Skulls are so last century!' },
  achSkullsAreSoLastCenturyWhat: { ru: 'Чеснок, алмазы и «огранка» одновременно', en: 'Garlic, diamonds and the cut amulet at the same time' },
  achBank: { ru: 'Банк', en: 'Bank' },
  achBankWhat: { ru: '«Страховка» и «проценты» одновременно', en: 'Insurance and interest at the same time' },
  achSmoker: { ru: 'Курильщик', en: 'Smoker' },
  achSmokerWhat: { ru: 'Три сигареты за один раунд', en: 'Three cigarettes in one round' },
  achLuckyOne: { ru: 'Везунчик', en: 'Lucky one' },
  achLuckyOneWhat: { ru: 'Включён предмет «Риск», «череп в кармане» и тройное «забрать» в выигрышном раунде', en: 'The Risk item is on, skull-in-pocket is in place and a triple take lands in a winning round' },
  achNope: { ru: 'Неа', en: 'Nope' },
  achNopeWhat: { ru: 'Попробуй включить «Риск» вместе с «Фартом» — игра ответит «неа»', en: 'Try to turn Risk on together with Lucky spin - the game will say nope' },
  achFiftyFifty: { ru: '50 на 50', en: '50/50' },
  achFiftyFiftyWhat: { ru: 'Паттерн выиграл, когда доля черепов была 50% или выше', en: 'A pattern won when the skull share was 50% or higher' },
  achMyGold: { ru: 'Моё золото', en: 'My gold' },
  achMyGoldWhat: { ru: 'Все слоты полки забиты одним предметом', en: 'Every shelf slot holds the same item' },
  achDuplicate: { ru: 'Дубликат', en: 'Duplicate' },
  achDuplicateWhat: { ru: 'Две копии одного амулета', en: 'Two copies of the same amulet' },
  achTheEnd: { ru: 'Конец?', en: 'The end?' },
  achTheEndWhat: { ru: 'Набрано 1 000 000 фишек', en: '1 000 000 chips earned' },
  achNotTheEnd: { ru: 'Это не конец...', en: 'This is not the end...' },
  achNotTheEndWhat: { ru: 'Набрано 10 000 000 фишек', en: '10 000 000 chips earned' },
  achYourTicket: { ru: 'Ваш билетик!', en: 'Your ticket!' },
  achYourTicketWhat: { ru: '20 билетов на табло', en: '20 tickets on the board' },
  achIAmSpeed: { ru: 'Я скорость', en: 'I am speed' },
  achIAmSpeedWhat: { ru: 'Множитель серии ×50', en: 'Streak multiplier ×50' },
  achBloodSpill: { ru: 'Я пролью много крови', en: 'I will spill much blood' },
  achBloodSpillWhat: { ru: '«Жадность», и до конца раунда две прокрутки', en: 'Greed amulet, two spins left in the round' },
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
 * Число фишек с разделителями между тысячами: 1234567 → «1 234 567». Так цель «1 000 000» читается как на табло,
 * а не «1000000». Округляем: дробных фишек в игре нет. separator — чем разделять («.» — на записке цели).
 */
export function formatChips(value: number, separator = ' '): string {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

