import Phaser from 'phaser';
import { multiplierStep, START_SOCKETS, type Amulet, type AmuletId } from '../amulets';
import { ORDINARY, type MachineCharacter } from '../characters';
import { noEffects, START_SLOTS, type Item, type ItemEffects, type ShopItem } from '../items';
import { PHASES, type Phase } from '../phases';
import { debtForRound, multiplierForStreak, SPINS_PER_ROUND } from '../rules';
import type { RunSave, TapeState } from '../save';
import { Sound } from '../sound';
import { LAMP_ANGRY, LAMP_BLOOD, LAMP_GARLIC, LAMP_GOLD, LAMP_LUCK } from '../theme';
import type { AmuletCase } from '../parts/amuletCase';
import type { AmuletRack } from '../parts/amuletRack';
import type { Atmosphere } from '../parts/atmosphere';
import type { BrokenScreen } from '../parts/brokenScreen';
import type { BulletStand } from '../parts/bulletStand';
import type { Cassette } from '../parts/cassette';
import type { Collector } from '../parts/collector';
import type { DealerTable } from '../parts/dealerTable';
import type { Drum } from '../parts/drum';
import type { Effects } from '../parts/effects';
import type { ItemShelf } from '../parts/itemShelf';
import type { MachineBadge } from '../parts/machineBadge';
import type { MachinePanel } from '../parts/panel';
import type { PayoutWindow } from '../parts/payoutWindow';
import type { RevolverTable } from '../parts/revolverTable';
import type { Shop } from '../parts/shop';
import type { SlotScreen } from '../parts/slotScreen';
import type { SymbolMonitor } from '../parts/symbolMonitor';
import type { Tooltip } from '../parts/tooltip';

const RECORD_KEY = 'dolgovaya-yama-record'; // ключ рекорда в localStorage
const ANGRY_TENSION = 0.25; // фаза 2: столько тревоги добавляется — сердце в музыке бьётся чаще
// Записка светится (долг можно отдать раньше) только на последних прокрутках: если она горит сразу, её нажимают
// и не докручивают раунд себе в плюс (практика 3). Отдать раньше (D или клик) можно и до этого.
const PAY_EARLY_GLOW_SPINS = 3;

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

/**
 * Сцена игры собрана слоями — каждый слой в своём файле добавляет свою часть игры:
 * BaseScene (состояние забега и табло) → PhaseScene (фазы) → BonusScene (короны, клевер, джекпот) →
 * MachineScene (характер автомата: ржавчина, новый автомат) → RoundScene (прокрутка, кон, предметы) → DealerScene (игра Дилера) →
 * ShopScene (магазин) → SaveScene (кассета: записать забег и откатиться) → CollectorScene (расплата и игра с Коллектором) →
 * ShotScene (выстрел в автомат) → GameScene (создаёт части и разбирает клавиши).
 *
 * Этот слой — состояние забега в простых полях и части автомата (их создаёт GameScene).
 * Правила — в rules.ts, patterns.ts, items.ts, amulets.ts, collectorGame.ts, shot.ts и characters.ts,
 * картинки и анимации — в частях из parts/: сцена говорит им, что показать.
 */
export abstract class BaseScene extends Phaser.Scene {
  // Состояние игры. Начальные значения ставит resetState(), потому что
  // при scene.restart() поля класса сами не сбрасываются.
  protected round = 0; // номер раунда: какой по счёту долг закрываем
  protected debt = 0; // долг этого раунда
  protected balance = 0; // фишки на табло — твои; из них в конце раунда отдаётся долг
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
  protected amulets: Amulet[] = []; // амулеты в гнёздах, по порядку гнёзд
  protected amuletOffer: (Amulet | null)[] = []; // что лежит в витрине амулетов; купленное — null
  protected isTicketForSale = false; // в витрине ещё лежит билет за фишки
  protected drumSpins = 0; // сколько раз крутил барабан в этом магазине — каждая следующая прокрутка дороже
  protected bones = 0; // сколько паттернов из черепов выпало за забег — для коллекционера костей
  protected roundShields = 0; // сколько ещё черепов в этом раунде отобьёт бронежилет
  protected roulettes = 0; // сколько раз в этом забеге сыграл с Коллектором в рулетку — она одна за забег
  protected bulletsBought = 0; // сколько патронов куплено за забег — каждый следующий дороже
  protected machine: MachineCharacter = ORDINARY; // какой автомат стоит: в начале забега обычный, после выстрела — с характером
  protected newsRound = 0; // в каком раунде уже показали новость о новом символе — второй раз не показываем
  protected isDebtNewsShown = false; // в этом раунде уже показали «НА ДОЛГ ХВАТАЕТ» — второй раз не показываем
  protected diceDrought = 0; // сколько прокруток подряд не было кубика — его шанс растёт («подстраховка»)
  protected isBloodNext = false; // на экране была кровь: следующая прокрутка кровавая
  protected isLuckyNext = false; // на экране был клевер: следующая прокрутка — с паттерном наверняка
  protected freeSpins = 0; // сколько бесплатных прокруток за короны ещё впереди — они крутятся сами
  protected phase: Phase = PHASES[0]; // какая фаза сейчас (phases.ts) — по числу закрытых долгов
  protected tapeState: TapeState = 'forSale'; // кассета: продаётся, куплена (запишет забег на выходе из магазина), записана или уже вставлена
  protected tapeRecord: RunSave | null = null; // что записано на кассету: забег в начале раунда
  protected isSpinning = false; // сетка крутится — ввод игнорируется
  protected isRoundOver = false; // прокрутки кончились — расплата и магазин, крутить и забирать нельзя
  protected isShopping = false; // вид повёрнут к магазину — можно покупать (пока крутится барабан — нельзя)
  protected isAwaitingPayment = false; // рука протянута и фишек хватает — ждём «отдать» (клик по руке или Enter)
  protected isChoosingDeal = false; // фишек не хватило: можно отдать амулет или сыграть в рулетку
  protected isAiming = false; // рулетка, твой ход — ждём, в кого стреляешь
  protected isDealing = false; // идёт игра Дилера «больше или меньше» — крутить и забирать нельзя
  protected isGameOver = false; // долг не отдан — DEATH, конец забега
  protected isRewinding = false; // кассету вставили — плёнка перематывается, потом сцена перезапустится с записью
  protected isPaused = false; // пауза (Esc, P, ⏸): анимации, таймеры и звук стоят
  protected isAtMonitor = false; // вид повёрнут к монитору символов — крутить и забирать нельзя
  protected canRestartWithSpace = false; // Пробел на экране DEATH срабатывает не сразу

  // Звук создаётся один раз вместе со сценой и живёт весь сеанс: при scene.restart() он тот же (аудиоконтекстов в браузере мало).
  protected readonly sfx = new Sound();

  // Части автомата и комнаты. GameScene создаёт их заново в каждом create(), поэтому картинки и анимации всегда свежие.
  protected screen!: SlotScreen; // экран 5×3, стекло с паттернами, бегущие огни
  protected panel!: MachinePanel; // табло, окошко множителя, лампочки прокруток, рычаг
  protected payout!: PayoutWindow; // окошко выплаты: электронное табло с коном и красной кнопкой
  protected collector!: Collector; // записка с долгом, рука Коллектора, GOOD LUCK и DEATH
  protected itemShelf!: ItemShelf; // полка с предметами и включённые предметы у экрана
  protected amuletRack!: AmuletRack; // гнёзда с амулетами на верхушке корпуса
  protected shop!: Shop; // комната слева и торговый автомат
  protected cassette!: Cassette; // кассета в магазине и видеомагнитофон у монитора
  protected amuletCase!: AmuletCase; // витрина амулетов над торговым автоматом
  protected drum!: Drum; // «барабан» в магазине: колесо с призами за фишки
  protected revolverTable!: RevolverTable; // стол Коллектора: рулетка с револьвером и лоток для откупа амулетом
  protected bulletStand!: BulletStand; // патрон на стене магазина: его покупают за билеты
  protected brokenScreen!: BrokenScreen; // дыра и трещины на экране автомата после выстрела
  protected machineBadge!: MachineBadge; // характер автомата: цвет корпуса и значок
  protected dealerTable!: DealerTable; // стол Дилера поверх экрана
  protected atmosphere!: Atmosphere; // пыль, полосы на экране, мигание света, тёмные края от тревоги
  protected tooltip!: Tooltip; // подсказка при наведении мыши
  protected monitor!: SymbolMonitor; // монитор символов у правой стены: цены и что делает каждый символ
  protected effects!: Effects; // брызги фишек, всплывающие надписи, вспышка с тряской

  /** Начало забега: первый долг, пустое табло, 2 места на полке и 2 гнезда, ничего не включено, автомат обычный. */
  protected resetState(): void {
    this.round = 1;
    this.debt = debtForRound(1);
    this.balance = 0;
    this.tickets = 0;
    this.spinsLeft = SPINS_PER_ROUND;
    this.pot = 0;
    this.streak = 0;
    this.record = loadRecord();
    this.slots = START_SLOTS;
    this.shelf = new Array<Item | null>(START_SLOTS).fill(null);
    this.itemEffects = noEffects();
    this.offer = [];
    this.sockets = START_SOCKETS;
    this.amulets = [];
    this.amuletOffer = [];
    this.isTicketForSale = false;
    this.drumSpins = 0;
    this.bones = 0;
    this.roundShields = 0;
    this.roulettes = 0;
    this.bulletsBought = 0;
    this.machine = ORDINARY;
    this.newsRound = 1;
    this.isDebtNewsShown = false;
    this.diceDrought = 0;
    this.isBloodNext = false;
    this.isLuckyNext = false;
    this.freeSpins = 0;
    this.phase = PHASES[0];
    this.tapeState = 'forSale';
    this.tapeRecord = null;
    this.isDealing = false;
    this.isSpinning = false;
    this.isRoundOver = false;
    this.isShopping = false;
    this.isAwaitingPayment = false;
    this.isChoosingDeal = false;
    this.isAiming = false;
    this.isGameOver = false;
    this.isRewinding = false;
    this.isPaused = false;
    this.isAtMonitor = false;
    this.canRestartWithSpace = false;
  }

  /** Обновить табло, окошко множителя, лампочки прокруток, окошко выплаты и записку (светится ли) по текущему состоянию. */
  protected refreshHud(): void {
    this.panel.showBalance(this.balance);
    this.panel.showTickets(this.tickets);
    this.panel.showMultiplier(this.multiplier());
    this.panel.showSpinsLeft(this.spinsLeft);
    this.panel.showFreeSpins(this.freeSpins);
    this.payout.showPot(this.pot, this.debt);
    this.payout.setEnabled(this.canAct());
    this.collector.showPayable(this.canPayEarly());
    this.cassette.showUsable(this.canRewind());
    this.monitor.setEnabled(this.canAct() || this.isAtMonitor); // к монитору — между прокрутками, от него — всегда
    const tension = this.tension();
    this.sfx.setTension(tension);
    this.atmosphere.setTension(tension);
  }

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
    if (this.isLuckyNext) return LAMP_LUCK;
    if (this.isBloodNext) return LAMP_BLOOD;
    if (this.itemEffects.isGarlicOn) return LAMP_GARLIC;
    return this.phase === PHASES[0] ? LAMP_GOLD : LAMP_ANGRY;
  }

  /** Какие амулеты стоят в гнёздах — их правила действуют. */
  protected amuletIds(): AmuletId[] {
    return this.amulets.map((amulet) => amulet.id);
  }

  /** Можно ли сейчас крутить, забирать и включать предметы. Пока впереди бесплатные прокрутки — нельзя: они крутятся сами. */
  protected canAct(): boolean {
    return (
      !this.isSpinning &&
      !this.isRoundOver &&
      !this.isDealing &&
      !this.isGameOver &&
      !this.isRewinding &&
      !this.isPaused &&
      !this.isAtMonitor &&
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
   */
  protected canPayEarly(): boolean {
    const isRoundGoing = !this.isRoundOver && !this.isDealing && !this.isGameOver && !this.isRewinding;
    return this.hasEnoughForDebt() && isRoundGoing && this.spinsLeft <= PAY_EARLY_GLOW_SPINS;
  }

  /** Можно ли вставить кассету — тогда она светится: Коллектор пришёл, а фишек не хватает, и на кассете есть запись. */
  protected canRewind(): boolean {
    return this.isChoosingDeal && this.tapeState === 'recorded';
  }

  /**
   * Новый забег. Пустые данные — нарочно: без них Phaser отдал бы новой сцене прошлые (после отката это запись кассеты),
   * и «заново» снова откатило бы забег.
   */
  protected restartGame(): void {
    this.scene.restart({});
  }

  /** Счёт — сколько долгов закрыто. */
  protected closedDebts(): number {
    return this.round - 1;
  }

  /** Новый рекорд сохраняем сразу, как только закрыто больше долгов, чем в лучшей игре. */
  protected updateRecord(): void {
    if (this.closedDebts() <= this.record) return;
    this.record = this.closedDebts();
    saveRecord(this.record);
  }
}
