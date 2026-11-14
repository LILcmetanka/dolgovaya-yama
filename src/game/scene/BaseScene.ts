import Phaser from 'phaser';
import { amuletIdsFrom, multiplierStep, START_SOCKETS, type Amulet, type AmuletCounts, type AmuletId } from '../amulets';
import { resetCodex } from '../codex';
import { CHIP_GOAL } from '../gameConfig';
import { garlicOn, noEffects, START_SLOTS, type Item, type ItemEffects, type ShopItem } from '../items';
import { formatChips, t } from '../lang';
import { PHASES, type Phase } from '../phases';
import { newMachineSet, type MachineId, type MachineSet, type MachineState } from '../machines';
import type { Pattern } from '../patterns';
import { hasPattern, markPatternOpen, markTutorialDone, openedPatterns } from '../progress';
import { debtForRound, multiplierForStreak, SPINS_PER_ROUND } from '../rules';
import type { RunSave, TapeState } from '../save';
import { Sound } from '../sound';
import { LAMP_ANGRY, LAMP_BLOOD, LAMP_GARLIC, LAMP_GOLD, LAMP_LUCK } from '../theme';
import type { AmuletCase } from '../parts/amuletCase';
import type { AmuletRack } from '../parts/amuletRack';
import type { Atmosphere } from '../parts/atmosphere';
import type { BrokenScreen } from '../parts/brokenScreen';
import type { Cassette } from '../parts/cassette';
import type { ChipCase } from '../parts/chipCase';
import type { Collector } from '../parts/collector';
import type { DealerTable } from '../parts/dealerTable';
import type { Drum } from '../parts/drum';
import type { Effects } from '../parts/effects';
import type { ItemShelf } from '../parts/itemShelf';
import type { LastChanceBar } from '../parts/lastChanceBar';
import type { MachineBadge } from '../parts/machineBadge';
import type { MachinePicker } from '../parts/machinePicker';
import type { MiniShop } from '../parts/miniShop';
import type { MachinePanel } from '../parts/panel';
import type { PayoutWindow } from '../parts/payoutWindow';
import type { RerollMenu } from '../parts/rerollMenu';
import type { Reveal } from '../parts/reveal';
import type { Shop } from '../parts/shop';
import type { SlotScreen } from '../parts/slotScreen';
import type { WallScreen } from '../parts/wallScreen';
import type { Tooltip } from '../parts/tooltip';

const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage
const CHIP_RECORD_KEY = 'dolgovaya-yama-chip-record'; // ключ рекорда набранных за забег фишек (отметка CHIP_RECORD)
const ANGRY_TENSION = 0.25; // фаза 2: столько тревоги добавляется — сердце в музыке бьётся чаще
// Записка светится (долг можно отдать раньше) только на последних прокрутках: если она горит сразу, её нажимают
// и не докручивают раунд себе в плюс (практика 3). Отдать раньше (D или клик) можно и до этого.
const PAY_EARLY_GLOW_SPINS = 3;
// Пороги по пути к цели: на них на стекле новость «НАБРАНО N · M% ЦЕЛИ» (1 000 000 — уже победа, не новость).
const CHIP_MILESTONES = [100_000, 500_000];

/** Рекорд из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadRecord(): number {
  try {
    const saved = Number(localStorage.getItem(RECORD_KEY));
    return Number.isFinite(saved) ? saved : 0;
  } catch {
    return 0;
  }
}

/** Сохранить рекорд в localStorage. Не получилось — не страшно. */
function saveRecord(record: number): void {
  try {
    localStorage.setItem(RECORD_KEY, String(record));
  } catch {
    // хранилище недоступно (например, запрещено настройками браузера) — играем без сохранения
  }
}

/** Рекорд набранных фишек из localStorage. Если хранилище недоступно — 0, игра работает и так. */
function loadChipRecord(): number {
  try {
    const saved = Number(localStorage.getItem(CHIP_RECORD_KEY));
    return Number.isFinite(saved) && saved > 0 ? saved : 0;
  } catch {
    return 0;
  }
}

/** Сохранить рекорд набранных фишек. Не получилось — не страшно: экран победы покажет рекорд этого забега. */
function saveChipRecord(record: number): void {
  try {
    localStorage.setItem(CHIP_RECORD_KEY, String(record));
  } catch {
    // хранилище недоступно — играем без сохранения
  }
}

/**
 * Сцена игры собрана слоями — каждый слой в своём файле добавляет свою часть игры:
 * BaseScene (состояние забега и табло) → PhaseScene (фазы) → BonusScene (короны, клевер, джекпот) →
 * MachineScene (характер автомата: ржавчина, новый автомат) → RoundScene (прокрутка, кон, предметы) → DealerScene (игра Дилера) →
 * ShopScene (магазин) → SaveScene (кассета: записать забег и откатиться) → CollectorScene (расплата и последний шанс) →
 * GameScene (создаёт части и разбирает клавиши).
 *
 * Этот слой — состояние забега в простых полях и части автомата (их создаёт GameScene).
 * Правила — в rules.ts, patterns.ts, items.ts, amulets.ts, lastChance.ts и characters.ts,
 * картинки и анимации — в частях из parts/: сцена говорит им, что показать.
 */
export abstract class BaseScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  protected round = 0; // номер раунда: какой по счёту долг закрываем
  protected debt = 0; // долг этого раунда
  protected balance = 0; // фишки на табло — твои; из них в конце раунда отдаётся долг
  protected earned = 0; // сколько игра отдала за забег (все приходы на табло): цель забега — chipGoal
  protected chipGoal = CHIP_GOAL; // порог, к которому идёт забег: 1 000 000, а после «ДАЛЬШЕ» — 10 000 000 (CHIP_RECORD)
  protected chipRecord = 0; // лучший earned на конец забега (localStorage): экран победы и рекорда
  protected tickets = 0; // билеты 🎟 на табло — на амулеты и гнёзда
  protected spinsLeft = 0; // сколько прокруток осталось в раунде
  protected pot = 0; // кон: выиграно, но ещё не забрано — паттерн из черепов сжигает его
  protected streak = 0; // серия: +1 за прокрутку без паттерна из черепов; черепа её обнуляют, «забрать» уменьшает
  protected record = 0; // рекорд: больше всего закрытых долгов за одну игру
  protected slots = 0; // сколько мест на полке открыто
  protected shelf: (Item | null)[] = []; // что лежит на полке, по месту на клетку; null — пусто
  protected itemEffects: ItemEffects = noEffects(); // какие предметы сейчас включены
  protected offer: (ShopItem | null)[] = []; // что лежит в торговом автомате; купленное — null
  protected sockets = 0; // сколько гнёзд для амулетов открыто
  protected amulets: Amulet[] = []; // амулеты в гнёздах, по порядку гнёзд (каждый — уникальный, дубли — счётчиком ниже)
  protected amuletCounts: AmuletCounts = {}; // сколько копий каждого амулета (шаг 62б: копии не занимают гнёзда)
  protected amuletOffer: (Amulet | null)[] = []; // что лежит в витрине амулетов; купленное — null
  protected drumSpins = 0; // сколько раз крутил барабан в этом магазине — каждая следующая прокрутка дороже
  protected bones = 0; // сколько паттернов из черепов выпало за забег — для коллекционера костей
  protected roundShields = 0; // сколько ещё черепов в этом раунде отобьёт бронежилет
  // Автоматы забега: у каждого свой уровень и ветка, прокачка одного не пропадает, пока играешь другим.
  // Сбрасывается только новым забегом (resetState — KABOOM и «заново»).
  protected machineStates: MachineSet = newMachineSet();
  protected machineId: MachineId = 'classic'; // какой из трёх стоит сейчас

  /** Автомат, который стоит сейчас: его уровень и ветка из записи забега. */
  protected get machineState(): MachineState {
    return this.machineStates[this.machineId];
  }

  protected newsRound = 0; // в каком раунде уже показали новость о новом символе — второй раз не показываем
  protected isDebtNewsShown = false; // в этом раунде уже показали «НА ДОЛГ ХВАТАЕТ» — второй раз не показываем
  protected diceDrought = 0; // сколько прокруток подряд не было кубика — его шанс растёт («подстраховка»)
  protected isBloodNext = false; // на экране была кровь: следующая прокрутка кровавая
  protected luckyClovers = 0; // сколько клеверов висит на сетке: следующая прокрутка — с паттерном, и чем их больше, тем сильнее
  protected freeSpins = 0; // сколько бесплатных прокруток за короны ещё впереди — они крутятся сами
  protected freeSpinsGiven = 0; // сколько бесплатных прокруток уже дали в этом раунде — потолок MAX_FREE_SPINS_PER_ROUND
  protected phase: Phase = PHASES[0]; // какая фаза сейчас (phases.ts) — по числу закрытых долгов
  protected tapeState: TapeState = 'forSale'; // кассета: продаётся, чистая (в REC) или записана (в PLAY)
  protected tapesBought = 0; // сколько кассет куплено за забег — от этого цена; откат этого числа не откатывает
  protected tapeRecord: RunSave | null = null; // что записано на кассету: забег в начале раунда
  protected patternSet: string[] = []; // какие паттерны открыты в этом забеге: только их схемы видно на стекле
  protected isSpinning = false; // сетка крутится — ввод игнорируется
  protected isRerolling = false; // окно перемешки и подмены открыто: сетку ещё не посчитали, кроме выбора ничего нельзя
  protected isRoundOver = false; // прокрутки кончились — расплата и магазин, крутить и забирать нельзя
  protected isShopping = false; // панель магазина опущена — можно покупать (пока крутится барабан — нельзя)
  protected isShopOpen = false; // панель магазина вообще на экране (и когда покупки закрыты: крутится барабан)
  protected isVictoryPending = false; // цель взята, но победа ждёт конца текущего действия (CollectorScene.checkChipGoal)
  protected isAwaitingPayment = false; // банкомат выехал и фишек хватает — ждём «отдать» (клик по банкомату или Enter)
  protected isDealing = false; // идёт игра Дилера «больше или меньше» — крутить и забирать нельзя
  protected isLastChance = false; // фишек не хватило: одна чистая прокрутка и два действия игрока (CollectorScene)
  protected secondWindUsed = false; // второе дыхание потрачено: следующий провал последнего шанса — KABOOM
  protected insuranceUsed = false; // страховка уже сработала в этом раунде — второй сгоревший кон она не спасёт
  protected isGameOver = false; // долг не отдан — DEATH, конец забега
  protected isRewinding = false; // кассету вставили — плёнка перематывается, потом сцена перезапустится с записью
  protected isPaused = false; // пауза (Esc, P, ⏸): анимации, таймеры и звук стоят
  protected isAtMonitor = false; // большой экран на стене открыт — крутить и забирать нельзя
  protected canRestartWithSpace = false; // Пробел на экране DEATH срабатывает не сразу

  // Звук создаётся один раз вместе со сценой и живёт весь сеанс: при scene.restart() он тот же (аудиоконтекстов в браузере мало).
  protected readonly sfx = new Sound();

  // Части автомата и комнаты. GameScene создаёт их заново в каждом create(), поэтому картинки и анимации всегда свежие.
  protected screen!: SlotScreen; // экран 5×3, стекло с паттернами, бегущие огни
  protected panel!: MachinePanel; // табло, окошко множителя, лампочки прокруток, рычаг
  protected payout!: PayoutWindow; // окошко выплаты: электронное табло с коном и кнопкой «забрать»
  protected collector!: Collector; // записка с долгом, банкомат и экран DEATH
  protected chipCase!: ChipCase; // чемодан с фишками: выжил в последнем шансе — долг оплачен
  protected itemShelf!: ItemShelf; // полка с предметами и включённые предметы у экрана
  protected rerollMenu!: RerollMenu; // окно перемешки и подмены на месте окошка выплаты
  protected amuletRack!: AmuletRack; // гнёзда с амулетами на верхушке корпуса
  protected shop!: Shop; // панель магазина: жалюзи с торговым автоматом, витриной амулетов, барабаном и кассетой
  protected miniShop!: MiniShop; // маленький автомат на панели: место на полке за фишки и гнездо за билеты
  protected cassette!: Cassette; // кассета в магазине и видеомагнитофон у монитора
  protected amuletCase!: AmuletCase; // чемодан с амулетами над торговым автоматом
  protected drum!: Drum; // «барабан» в магазине: колесо с призами за фишки
  protected brokenScreen!: BrokenScreen; // дыра и трещины на экране автомата после взрыва (KABOOM)
  protected machineBadge!: MachineBadge; // автомат: цвет корпуса и значок
  protected machinePicker!: MachinePicker; // выбор автомата и прокачка — на панели магазина
  protected dealerTable!: DealerTable; // стол Дилера поверх экрана
  protected atmosphere!: Atmosphere; // пыль, полосы на экране, мигание света, тёмные края от тревоги
  protected tooltip!: Tooltip; // подсказка при наведении мыши
  protected lastChanceBar!: LastChanceBar; // полоса последнего шанса: цель, действия, кнопки
  protected monitor!: WallScreen; // экран на стене справа: символы, паттерны, как играть
  protected effects!: Effects; // брызги фишек, всплывающие надписи, вспышка с тряской
  protected reveal: Reveal | null = null; // тьма первого забега; null — обучение пройдено или его нет

  /** Начало забега: первый долг, пустое табло, 2 места на полке, ничего не включено, автомат обычный. */
  protected resetState(): void {
    this.round = 1;
    this.debt = debtForRound(1);
    this.balance = 0;
    this.earned = 0;
    this.chipGoal = CHIP_GOAL; // новый забег снова идёт к миллиону; 10 000 000 — только после «ДАЛЬШЕ»
    this.chipRecord = loadChipRecord();
    this.tickets = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    this.slots = START_SLOTS;
    this.shelf = new Array<Item | null>(START_SLOTS).fill(null);
    this.itemEffects = noEffects();
    this.offer = [];
    this.sockets = START_SOCKETS; // гнёзда есть с первого раунда: открываются долгами, а не забегами
    this.amulets = [];
    this.amuletCounts = {};
    this.amuletOffer = [];
    this.drumSpins = 0;
    this.bones = 0;
    this.roundShields = 0;
    this.machineStates = newMachineSet(); // новый забег: все трое с первого уровня
    this.machineId = 'classic';
    this.newsRound = 1;
    this.isDebtNewsShown = false;
    this.diceDrought = 0;
    this.isBloodNext = false;
    this.luckyClovers = 0;
    this.freeSpins = 0;
    this.freeSpinsGiven = 0;
    this.phase = PHASES[0];
    this.tapeState = 'forSale';
    this.tapesBought = 0;
    this.tapeRecord = null;
    this.patternSet = [...openedPatterns()]; // открытое копится навсегда: «заново» и конец забега схемы не гасят
    this.isDealing = false;
    this.isLastChance = false;
    this.secondWindUsed = false;
    this.insuranceUsed = false;
    this.isSpinning = false;
    this.isRerolling = false;
    this.isRoundOver = false;
    this.isShopping = false;
    this.isShopOpen = false;
    this.isAwaitingPayment = false;
    this.isGameOver = false;
    this.isVictoryPending = false;
    this.isRewinding = false;
    this.isPaused = false;
    this.isAtMonitor = false;
    this.canRestartWithSpace = false;
  }

  /** Обновить табло, окошко множителя, лампочки прокруток, окошко выплаты и записку (светится ли) по текущему состоянию. */
  protected refreshHud(): void {
    this.panel.showBalance(this.balance);
    this.panel.showTickets(this.tickets);
    this.shop.showMoney(this.balance, this.tickets); // та же пара чисел — на табло панели магазина
    this.panel.showMultiplier(this.multiplier());
    this.panel.showSpinsLeft(this.spinsLeft);
    this.panel.showFreeSpins(this.freeSpins);
    this.monitor.showGoal(this.earned, this.chipGoal); // цель забега на вкладке «Как играть» — по набранному сейчас
    // В последнем шансе цели в окошке нет: её показывает полоса последнего шанса, а «забрать» там нечего.
    this.payout.setGoal(null);
    this.payout.showPot(this.pot, this.debt);
    this.payout.setEnabled(this.canAct());
    this.collector.showPayable(this.canPayEarly());
    this.collector.showProgress(this.debt, this.balance, this.pot);
    this.cassette.showUsable(this.canRecord() || this.canRewind());
    this.monitor.setEnabled(this.canAct() || this.isAtMonitor); // к монитору — между прокрутками, от него — всегда
    const tension = this.tension();
    this.sfx.setTension(tension);
    this.atmosphere.setTension(tension);
  }

  /**
   * Доход на табло. Через эту дверь идут ВСЕ приходы фишек за забег: забранный кон (payPot), возврат страховки
   * (burnPot), «Проценты» (payDebt) и барабан (winDrum). earned меряет, сколько игра отдала за забег: долг его
   * не уменьшает, а штрафы (кровавая прокрутка) сюда не идут — это не доход.
   * После прибавки — новость порога и проверка цели забега (её делает CollectorScene: там же смерть).
   * Рекорд здесь не пишется: chipRecord фиксируется по концу забега (победа, рекорд или KABOOM).
   */
  protected earn(amount: number): void {
    if (amount <= 0) return;
    const before = this.earned;
    this.balance += amount;
    this.earned += amount;
    this.announceChipMilestone(before);
    this.checkChipGoal();
  }

  /** Лучший earned на конец забега: больше прежнего — запоминаем в localStorage. Зовут концовки забега. */
  protected updateChipRecord(): void {
    if (this.earned <= this.chipRecord) return;
    this.chipRecord = this.earned;
    saveChipRecord(this.chipRecord);
  }

  /** Набранное перевалило порог (100 000, 500 000) — новость на стекле. Порогов сразу два не бывает: показываем старший. */
  private announceChipMilestone(before: number): void {
    const crossed = CHIP_MILESTONES.filter((milestone) => before < milestone && this.earned >= milestone);
    const milestone = crossed.at(-1);
    if (milestone === undefined) return;
    const percent = Math.round((milestone / this.chipGoal) * 100);
    this.screen.announceNews(t('chipsMilestone', formatChips(milestone), percent));
    this.sfx.play('news', 0.3);
  }

  /**
   * Дошли до цели забега — chipGoal (1 000 000, после «ДАЛЬШЕ» — 10 000 000). Здесь пусто: победу делает CollectorScene
   * (в нём же KABOOM и экран DEATH) — только он знает, можно ли гасить лампы сейчас или надо дождаться конца анимации.
   */
  protected checkChipGoal(): void {}

  /** Насколько близко беда — от неё бьётся «сердце» в музыке: не хватает на долг, а прокрутки кончаются. */
  protected tension(): number {
    if (this.isRoundOver || this.isGameOver) return 0.6;
    const missing = 1 - Math.min(1, this.balance / this.debt); // какой доли долга не хватает
    const spent = 1 - Math.min(1, this.spinsLeft / SPINS_PER_ROUND); // сколько раунда прошло
    const angry = this.phase === PHASES[0] ? 0 : ANGRY_TENSION; // в фазе 2 сердце бьётся чаще
    return Math.min(1, missing * (0.3 + 0.7 * spent) + angry);
  }

  /** Множитель следующей прокрутки: серия × шаг (с «Разгоном» шаг больше, в фазе 2 — ещё больше). */
  protected multiplier(): number {
    return multiplierForStreak(this.streak, multiplierStep(this.amuletIds()) + this.phase.multiplierBonus);
  }

  /**
   * Огни вокруг экрана в покое: после клевера (следующая прокрутка с паттерном) — ярко-зелёные, следующая прокрутка кровавая —
   * тёмно-красные, действует чеснок — бледно-зелёные, фаза 2 — оранжевые, иначе золото.
   */
  protected calmLampColor(): number {
    if (this.luckyClovers > 0) return LAMP_LUCK;
    if (this.isBloodNext) return LAMP_BLOOD;
    if (garlicOn(this.itemEffects)) return LAMP_GARLIC;
    return this.phase === PHASES[0] ? LAMP_GOLD : LAMP_ANGRY;
  }

  /** Какие амулеты стоят в гнёздах (с учётом копий) — их правила действуют. */
  protected amuletIds(): AmuletId[] {
    return amuletIdsFrom(this.amuletCounts);
  }

  /**
   * Можно ли сейчас крутить, забирать и включать предметы. Пока впереди бесплатные прокрутки — нельзя: они крутятся сами.
   * Пока цель взята, но победа ждёт конца действия (isVictoryPending) — тоже нельзя: иначе кассета успела бы
   * откатить забег, а новая прокрутка начаться за экраном победы.
   */
  protected canAct(): boolean {
    return (
      !this.isSpinning &&
      !this.isRerolling &&
      !this.isRoundOver &&
      !this.isDealing &&
      !this.isGameOver &&
      !this.isVictoryPending &&
      !this.isRewinding &&
      !this.isPaused &&
      !this.isAtMonitor &&
      !this.isLastChance &&
      this.freeSpins === 0
    );
  }

  /** Хватает ли фишек на табло, чтобы отдать долг этого раунда. */
  protected hasEnoughForDebt(): boolean {
    return this.balance >= this.debt;
  }

  /**
   * Светится ли записка (долг можно отдать раньше конца раунда): фишек на табло хватает, раунд идёт (не расплата и не магазин,
   * не Дилер, не перемотка, не конец забега) и прокруток осталось мало — PAY_EARLY_GLOW_SPINS. Пока крутится, записка светится, но клик подождёт.
   * Открытое окно перемешки и подмены записку гасит: долг отдать нечем, пока сетку не посчитали (canAct() тут не годится —
   * он гасит записку и на бесплатных прокрутках).
   */
  protected canPayEarly(): boolean {
    const isRoundGoing = !this.isRoundOver && !this.isDealing && !this.isGameOver && !this.isRewinding && !this.isRerolling;
    return this.hasEnoughForDebt() && isRoundGoing && this.spinsLeft <= PAY_EARLY_GLOW_SPINS;
  }

  /** Можно ли записать на чистую кассету: между прокрутками у автомата (canAct). */
  protected canRecord(): boolean {
    return this.tapeState === 'blank' && this.canAct();
  }

  /** Можно ли откатиться: есть запись и сейчас между прокрутками (в последнем шансе и у Коллектора — уже нельзя). */
  protected canRewind(): boolean {
    return this.tapeState === 'recorded' && !this.isRewinding && !this.isGameOver && !this.isVictoryPending && this.canAct();
  }

  /**
   * Новый забег. Пустые данные — нарочно: без них Phaser отдал бы новой сцене прошлые (после отката это запись кассеты),
   * и «заново» снова откатило бы забег.
   */
  protected restartGame(): void {
    resetCodex(); // новый забег: встреченное забыто
    this.scene.restart({});
  }

  /** Из тьмы первого забега проступает записка с долгом (третья прокрутка). */
  protected openRevealNote(): void {
    this.reveal?.openNote();
  }

  /**
   * Паттерн выпал на сетке: впервые — открываем его навсегда (в браузере) и сразу в этом забеге: схема проступает
   * на стекле, на стекле же новость «НОВЫЙ ПАТТЕРН ×N». Уже открытый — ничего не делаем: слава о нём уже есть.
   * После отката кассетой схема может пропасть с плёнки, но открытой навсегда она осталась (hasPattern) — тогда новость
   * пишет «ПАТТЕРН ×N» без слова «новый»: игрок его уже видел.
   */
  protected openPattern(pattern: Pattern): void {
    if (this.patternSet.includes(pattern.id)) return;
    const isKnown = hasPattern(pattern.id); // открыт в прошлом забеге (или до отката): «новый» уже неправда
    markPatternOpen(pattern.id);
    this.patternSet.push(pattern.id);
    this.screen.revealPattern(pattern);
    this.screen.announcePattern(pattern, isKnown);
    this.sfx.play('news', 0.3);
  }

  /** Показать на стекле набор этого забега: при создании сцены и после отката кассетой (с набором с записи). */
  protected setPatternsOnGlass(): void {
    this.screen.setPatterns(this.patternSet);
  }

  /** Коллектор пришёл за долгом — обучение пройдено: тьма гаснет и больше не вернётся. */
  protected finishTutorial(): void {
    const reveal = this.reveal;
    if (!reveal) return;
    markTutorialDone(); // сразу: сцена может перезапуститься посреди фейда
    // Пока тьма не погасла, она ещё на экране: ссылку не отпускаем (подсказки и режим под ней запрещены),
    // а переключатель режима включаем, когда её уже нет.
    reveal.finish(() => {
      this.reveal = null;
      // Тьма погасла — переключатель режима снова виден и нажимается. Но если за это время выехал банкомат
      // Коллектора (он встаёт на его место), плашки вернутся, когда банкомат уедет.
      if (!this.collector.isAtmOut) this.panel.setModeVisible(true);
    });
  }

  /** Счёт — сколько долгов закрыто. */
  protected closedDebts(): number {
    return this.round - 1;
  }

  // Что открыто в магазине: не по числу законченных забегов, а по закрытым долгам (closedDebts() = round − 1).
  // В openShop раунд уже увеличен, поэтому первый отданный долг (closedDebts() = 1) — это уже амулеты в магазине,
  // второй — барабан, третий — кассета. Там эти предикаты и ставят частям setAvailable.

  /** Амулеты (чемодан) открыты: первый долг закрыт. */
  protected amuletsUnlocked(): boolean {
    return this.closedDebts() >= 1;
  }

  /** Барабан открыт: закрыто два долга. */
  protected drumUnlocked(): boolean {
    return this.closedDebts() >= 2;
  }

  /** Кассета и видеомагнитофон открыты: закрыто три долга. */
  protected cassetteUnlocked(): boolean {
    return this.closedDebts() >= 3;
  }

  /** Новый рекорд сохраняем сразу, как только закрыто больше долгов, чем в лучшей игре. */
  protected updateRecord(): void {
    if (this.closedDebts() <= this.record) return;
    this.record = this.closedDebts();
    saveRecord(this.record);
  }
}
