import type Phaser from 'phaser';
import {
  amuletPatternWin,
  amuletsOnWin,
  bellSkullDelta,
  bellSpins,
  BONES_BONUS,
  earlyPayTickets,
  insuranceRefund,
  owns,
  piggyCoins,
  spinsPerRound,
  vestShields,
  winFactor,
} from '../amulets';
import { actionSkullDelta, freshActions, lotteryWinMul, startRoundActions, type ActionState } from '../actions';
import { CIGARETTES_FOR_ACHIEVEMENT, isBloodSpill, ITEM_ACHIEVEMENTS } from '../achievements';
import { FREE_SPINS_GUARD } from '../bonus';
import { bloodBurn, BLOOD_WIN, cellsOf, diceWeight, spiderBite } from '../evil';
import {
  pactDoubleTake,
  pactEffects,
  pactJokerCenter,
  pactSkullDelta,
  pactSpinCap,
  pactSymbolPay,
  pactJackpotWin,
  shopDebt,
  skullShareWeightMul,
  skullStreakAfter,
} from '../dealerGame';
import {
  activeSlotEffects,
  CIGARETTE_SPINS,
  clearEffect,
  clearRoundEffects,
  effectSlotLimit,
  GARLIC_SKULL_FACTOR,
  isItemOn,
  RISK_WIN_FACTOR,
  SYMBOL_BOOST_FACTOR,
  takesEffectSlot,
  TRIPLE_TAKE_FACTOR,
  type Item,
  type ItemEffects,
  type ItemId,
  type RerollId,
  type SlotEffectId,
} from '../items';
import { t } from '../lang';
import { jackpotWinFactor, keepsHammerAfter, skullCancelAllowed, startGridOf } from '../upgrades';
import { RESCUE_SKULL_SHARE } from '../lastChance';
import { machineAtRoundStart, machineSymbolAllowed, machineWinFactor, MACHINE_SWAP_CHANCE } from '../machines';
import { phaseAt } from '../phases';
import { skullShareOf, symbolWeightOf, type WeightContext } from '../skullShare';
import { CENTER_X, cellX, cellY, DISPLAY, GRID_Y, PAYOUT_WINDOW, SPIN_LAMPS_Y } from '../layout';
import { evaluateGrid, lockedColumns, ticketCells, type SpinResult } from '../patterns';
import { revealStepMs, revealSteps, WIN_REVEAL_FADE_SHARE, WIN_REVEAL_HOLD, winGain, type RevealStep } from '../reveal';
import {
  GRID_ROWS,
  isPaying,
  isSkull,
  JOKER,
  MAX_SPINS_PER_ROUND,
  randomSymbol,
  spinsAfterBonus,
  SPINS_PER_ROUND,
  streakAfterTake,
  SYMBOLS,
  symbolsUnlockedAt,
  TICKET_SCATTER,
  weightsForRound,
  type Grid,
  type SlotSymbol,
  type WeightOf,
} from '../rules';
import { effectPosition } from '../parts/itemShelf';
import { ScreenList } from '../parts/screenList';
import { BLUE_TEXT, GOLD_TEXT, LAMP_BLUE, LAMP_GOLD, LAMP_GREEN, LAMP_RED, PURPLE_TEXT, RED_TEXT } from '../theme';
import { TutorialScene } from './TutorialScene';

const COLLECT_DELAY = 1300; // после последней прокрутки: пусть фишки долетят до табло, потом расплата, мс
const MACHINE_NEWS_DELAY = 1500; // новость о смене автомата: после «ФАЗЫ 2» на стекле — оно держит одну новость, мс
const FREE_SPIN_PAUSE = 900; // бесплатные прокрутки идут сами: между ними — столько, чтобы разглядеть итог, мс
// Сколько бегущие огни горят другим цветом, мс.
const WIN_LAMPS_TIME = 900; // выигрыш — золотом
const SKULL_LAMPS_TIME = 700; // черепа — красным
const SHIELD_LAMPS_TIME = 700; // щит или бронежилет отбил черепа — синим
const NEW_ROUND_LAMPS_TIME = 1000; // новый раунд — зелёным
const DEBT_LAMPS_TIME = 1500; // фишек на табло стало хватать на долг — зелёным
const TICKET_BORDER = 0xf59e0b; // рамки на клетках с билетами, когда их три
const SPIDER_BORDER = 0xa855f7; // рамки на пауках, когда они съели часть кона
const MIN_ROUND_SPINS = 1; // сделка «−1 прокрутка» не может оставить раунд без прокруток вовсе
// Улучшение №50 (28г): череп можно отменить — решение показывается списком на экране автомата (шаг 37).
// Список висит, пока игрок не решит: строка «ОТМЕНИТЬ ЧЕРЕП» или ✕ «не отменять» (DONTLIKE п.4: 1,6 секунды
// не хватало даже прочитать). Раунд ждёт — как и любое обязательное решение списком.
// Прошлый попап шага гаснет к следующему; POPUP_TIME не трогаем — он для прочих надписей.
const WIN_POPUP_FADE_MS = 90;

/** «+12», «+4 ×3 = +12» или с амулетами «+4 ×3 ×2 = +24». */
function formatWin(win: number, multiplier: number, factor: number, gain: number): string {
  const parts = [`+${win}`];
  if (multiplier > 1) parts.push(`×${multiplier}`);
  if (factor !== 1) parts.push(`×${Number(factor.toFixed(2))}`);
  return parts.length > 1 ? `${parts.join(' ')} = +${gain}` : `+${gain}`;
}

/** Риск и фарт взаимоисключающие: «черепа ×3 и выигрыш ×10» и «без черепов» вместе не работают. */
function conflictsWith(id: ItemId, effects: ItemEffects): boolean {
  return (id === 'risk' && effects.luckSpin) || (id === 'luckSpin' && effects.risk);
}

/**
 * Слой раунда: прокрутка → итог (выигрыш на кон, черепа его сжигают или их отбивает щит; злые символы: паук ест кон,
 * замок блокирует столбец, кровь делает следующую прокрутку кровавой) → «забрать» на табло,
 * предметы с полки и амулеты в гнёздах во время прокруток, начало и конец раунда.
 * Выпал кубик — сделки Дилера (слой DealerScene), прокрутки кончились — расплата (слой CollectorScene).
 * Короны, клевер и джекпот — слой BonusScene; бесплатные прокрутки за короны крутит этот слой (spinFree).
 * Автомат (классический, жадный, тихий) меняет веса символов и выплаты — его выбирают в магазине (machines.ts),
 * заржавевший столбец и смена автомата — слой MachineScene, обучение текстами — слой TutorialScene.
 */
export abstract class RoundScene extends TutorialScene {
  /** Коллектор приходит за долгом — расплата; isPaidEarly — долг отдают раньше, банкомат сразу забирает. Её делает слой CollectorScene. */
  protected abstract callCollector(isPaidEarly: boolean): void;
  /** Выпал кубик — Дилер предлагает сделки (dealerGame); ушёл — done(). Её делает слой DealerScene. */
  protected abstract startDealerGame(done: () => void): void;
  private pendingReroll: { grid: Grid; weightOf: WeightOf; multiplier: number; id: RerollId } | null = null;
  /** Раунд закрыт ранней оплатой: Коллектор забирает долг сам (и после «ДАЛЬШЕ» с экрана победы — тоже). */
  protected isPaidEarly = false;
  // Сделка №15 «забрать дважды»: в одной прокрутке после обычного «забрать» можно забрать ещё раз.
  private tookThisSpin = false; // «забрать» в этой прокрутке уже было
  private tookExtraThisSpin = false; // второе «забрать» уже потрачено (больше двух за прокрутку нельзя)
  private lastTakeAmount = 0; // сколько дало первое забирание: от него считается второе
  private bankKeptThisRound = false; // сделка №10: первый череп в этом раунде кон уже не сжёг
  private tookThisRound = false; // сделка №23: «забрать» в этом раунде уже было (раз за раунд)
  private potSparedThisRound = false; // сделка №24: первый череп раунда уже пощадил кон
  // Колокольчик: сколько к доле черепов набежало срабатываниями 🔔 в этом раунде (amulets.bellSkullDelta).
  private bellSkull = 0;
  // Поколение показа выигрыша: пока идёт каскад рамок, оно не меняется; сброс состояния его двигает,
  // и запоздавшие шаги старого показа молча гаснут (сцена перезапустилась — показывать уже нечего).
  private revealId = 0;
  // Сколько показано в окошке выплаты посреди каскада; null — каскада нет, окошко показывает кон как обычно.
  // Нужно, чтобы любой refreshHud во время показа (снятие паузы, новость) не выдал финальную сумму раньше времени.
  private revealShown: number | null = null;
  // Последний попап шага каскада: его гасим к следующему шагу, чтобы надписи не копились.
  private winPopup: Phaser.GameObjects.Text | null = null;
  // Улучшение №4 (шаг 28): бесплатная прокрутка за первый паттерн черепов в раунде — одна на раунд.
  private skullFreeSpinGiven = false;
  // Улучшение №50 (28г): череп выпал, отмена ещё доступна — итог ждёт нажатия строки на экране или конца таймера.
  private pendingSkull: { grid: Grid; result: SpinResult; isBloody: boolean } | null = null;
  private skullCancelList: ScreenList | null = null;
  protected skullCancelBox: Phaser.GameObjects.GameObject[] | null = null; // что нарисовано: сценарий проверки читает этот набор
  // Отложенная новость о смене автомата: её гасит новость действия (иначе «УКРАЛ!» через 1,5 с менялась бы
  // на название автомата — гонка шага 43). null — новость не ждёт.
  private machineNewsTimer: Phaser.Time.TimerEvent | null = null;
  // Действия вне прокрутки (шаг 29): что уже сделано в этом раунде, обмен, лотерея, чистка, проданные
  // символы и выкуп долга. Живёт до конца раунда, в кассету не пишется.
  protected actionState: ActionState = freshActions();

  /** Новый забег: решения по перемешке не висит, сделок Дилера нет. */
  protected resetState(): void {
    super.resetState();
    this.pendingReroll = null;
    this.isPaidEarly = false;
    this.tookThisSpin = false;
    this.tookExtraThisSpin = false;
    this.lastTakeAmount = 0;
    this.bankKeptThisRound = false;
    this.tookThisRound = false;
    this.potSparedThisRound = false;
    this.skullFreeSpinGiven = false; // №4: в новом забеге бесплатная прокрутка за черепа ещё не выдана
    this.clearSkullCancel(); // №50: плашка отмены не должна пережить сброс забега
    this.dropPendingMachineNews(); // отложенная новость о смене автомата — тоже
    this.bellSkull = 0; // колокольчик: в новом забеге 🔔 ещё не срабатывал
    this.revealId += 1; // новый забег: недосмотренный каскад не должен вернуться в него своим колбэком
    this.revealShown = null;
    this.fadeWinPopup(); // попап прошлого показа не должен пережить сброс забега
    this.actionState = freshActions(); // шаг 29: у нового забега действий ещё не было
  }

  // ---------- Прокрутка ----------

  /** Прокрутка: одно нажатие рычага (или Пробел, Enter) — одна прокрутка. Нельзя, пока canAct() или обучение против. */
  protected spin(): void {
    if (this.remindReroll()) return; // висит решение — сначала столбец или клетка, крутить раньше нельзя
    if (!this.tutorialCanSpin()) return; // бит «Забери кон»: рычаг молчит, ввод открыт только для take()
    if (!this.canAct()) return;
    this.trackRunStart(); // первая прокрутка забега — событие game_start (в метриках — один раз за забег)
    this.dropPendingMachineNews(); // прокрутка началась: её результат важнее отложенной новости о смене автомата
    this.forgetTakeThisSpin();
    this.spinsLeft -= 1;
    this.panel.blinkSpinLamp(this.spinsLeft);
    this.roll(false);
  }

  /** Бесплатная прокрутка за короны: идёт сама, лампочки прокруток не гаснут — гаснет корона в их ряду. Она чистая: без черепов, кубика, пауков, замков и крови. */
  private spinFree(): void {
    if (this.isGameOver) return; // победа или KABOOM: забег кончен, бесплатные прокрутки за экраном не крутятся
    // Бит «Забери кон»: бесплатная прокрутка поменяла бы кон под руками и сбила бы бит — вернёмся к ней после него.
    if (!this.tutorialCanSpin()) {
      this.time.delayedCall(FREE_SPIN_PAUSE, () => this.spinFree());
      return;
    }
    this.freeSpins -= 1;
    // Это тоже новая прокрутка: второе «забрать» (сделка №15) из прошлой не переживает чужие авто-прокрутки.
    this.forgetTakeThisSpin();
    this.roll(true);
  }

  /**
   * Новая прокрутка: «забрать» снова одно. Сделка №15 даёт второе только в той же прокрутке (take),
   * поэтому флаги второго забирания снимаются и в spin(), и в spinFree().
   */
  private forgetTakeThisSpin(): void {
    this.tookThisSpin = false;
    this.tookExtraThisSpin = false;
    this.lastTakeAmount = 0;
  }

  /** Рычаг дёргается, столбцы мелькают и останавливаются слева направо. isFree — бесплатная прокрутка. */
  private roll(isFree: boolean): void {
    this.tutorialSpinStarted(); // обучение: висящая строка бита снимается — бит дождался действия
    if (this.isGameOver) return; // заслон на случай таймера: итог прокрутки не должен прийти на экран победы
    this.panel.pullLever();
    this.sfx.play('lever');
    this.sfx.play('roll', 0.1);
    this.isSpinning = true;
    this.isFreeSpinNow = isFree; // ачивкам важно: черепов в бесплатной прокрутке нет, «50 на 50» за неё не дают
    const multiplier = this.multiplier(); // множитель запоминаем до прокрутки
    this.screen.clearHighlights();
    this.refreshHud();

    const base = this.baseWeights(); // какие символы сейчас в автомате и с какими весами
    const weightOf = (symbol: SlotSymbol): number => this.symbolWeight(symbol, base, isFree);
    // Результат известен сразу (после клевера — с паттерном), анимация только показывает его.
    // Клевер на сетку и ржавый столбец работают всегда: спокойного режима больше нет.
    // Обучение (TutorialScene) подкладывает свою сетку — с ней правки стартовой сетки и джокера не нужны.
    const scripted = this.tutorialTakeGrid(isFree);
    let grid = scripted ?? this.rollGrid(weightOf, true, true);
    if (!scripted) {
      // Улучшения №32/33 (шаг 28в): первая сетка забега — с джокером и выбранным символом. Один раз за забег.
      if (!this.startGridGiven) {
        grid = startGridOf(grid, this.upgradeEffects, this.startSymbolId);
        this.startGridGiven = true;
      }
      grid = pactJokerCenter(grid, pactEffects(this.pacts, this.round)); // сделка №39: джокер в центре каждой сетки
    }
    this.screen.spin(grid, weightOf, () => this.finishSpin(grid, weightOf, multiplier, isFree));
  }

  /**
   * Веса раунда — те же, что считает rules.weightsForRound, с поправкой сделок Дилера (dealerGame.pactEffects):
   * «до конца раунда нет черепов» — черепам этого раунда вес 0, и в прокрутке их не будет.
   * Остальные сделки веса не гасят: они двигают вес черепа в weightContext (поправка доли любого знака).
   */
  private baseWeights(): WeightOf {
    const base = weightsForRound(this.round, diceWeight(this.diceDrought));
    if (!pactEffects(this.pacts, this.round).noSkulls) return base;
    return (symbol) => (isSkull(symbol) ? 0 : base(symbol));
  }

  /**
   * Всё, от чего зависит вес символа, плюс поправки сделок: №11 — выбранный символ (+2 / −0,5), доля черепов (±):
   * множитель веса черепа выводим из доли, которую видит игрок (dealerGame.skullShareWeightMul), поэтому прокрутка
   * и плашка «💀 N%» показывают одно число. Колокольчик добавляет к той же доле свою поправку за раунд (поле bellSkull,
   * его считает amulets.bellSkullDelta).
   */
  protected override weightContext(): WeightContext {
    const base = super.weightContext();
    const effects = pactEffects(this.pacts, this.round);
    // Действия шага 29: обмен весов двух символов (№2) и проданные символы (№8) — до конца раунда.
    const withActions: WeightContext = {
      ...base,
      swapSymbols: this.actionState.exchange,
      dropSymbols: this.actionState.sold,
    };
    const withLuck: WeightContext = effects.symbolLuck ? { ...withActions, symbolLuck: effects.symbolLuck } : withActions;
    // Сделка №14: вишни реже вдвое — вес символа, а не доля черепов.
    const withSymbols: WeightContext = Object.keys(effects.symbolWeightMul).length > 0
      ? { ...withLuck, symbolWeightMul: effects.symbolWeightMul }
      : withLuck;
    // Сделки Дилера, колокольчик, улучшение №31 и действия раунда (лотерея и чистка черепов) двигают долю
    // черепов каждый по-своему (может выйти и минус). Сделка №10 держит долю не выше своего потолка.
    const share = skullShareOf(this.round, this.diceDrought, withSymbols);
    const delta = pactSkullDelta(
      share,
      effects.skullShareDelta + this.bellSkull + this.upgradeEffects.skullShareDelta + actionSkullDelta(this.actionState),
      effects.skullShareMax,
    );
    if (delta === 0 || !Number.isFinite(delta)) return withSymbols;
    const mul = skullShareWeightMul(share, delta);
    return mul === 1 ? withSymbols : { ...withSymbols, skullMul: mul };
  }

  /** Шаг множителя серии: сделка «шаг вдвое» его удваивает (dealerGame.pactEffects). */
  protected override streakStep(): number {
    const effects = pactEffects(this.pacts, this.round);
    return super.streakStep() * effects.multiplierStepMul + effects.streakStepBonus;
  }

  /** Потолок множителя: сделка «тише черепа» держит серию не выше ×PACT_CAP (dealerGame.pactEffects). */
  protected override multiplierCap(): number {
    return pactEffects(this.pacts, this.round).multiplierCap;
  }

  /** Доля черепов для ачивки «50 на 50» — как плашка на корпусе: в раунде без черепов она 0. */
  protected override currentSkullShare(): number {
    if (pactEffects(this.pacts, this.round).noSkulls) return 0;
    return super.currentSkullShare();
  }

  /**
   * Вес символа в этой прокрутке: обычный вес раунда, его меняют амулеты (огранка, череп в кармане), автомат,
   * бусты предметов (чеснок, вишни…) и риск. Долю черепов фаза не множит (замечание 19):
   * она растёт по раундам в rules.ts, а фаза 2 даёт лишнюю прокрутку (startRound).
   * В бесплатной прокрутке нет черепов, кубика, пауков, замков и крови.
   */
  private symbolWeight(symbol: SlotSymbol, base: WeightOf, isFree: boolean): number {
    // Сами правила веса — в skullShare.ts: по ним же считается доля на плашке «💀 N%» и ачивка «50 на 50».
    return symbolWeightOf(symbol, base, this.weightContext(), isFree);
  }

  /**
   * Доля клеток-черепов в следующей платной прокрутке — для экранчика доли черепов на корпусе. Считаем по тем же весам, что и
   * сама прокрутка (symbolWeight), поэтому чеснок, риск, фарт, амулеты и автомат уже внутри — копий чисел нет.
   * Кубик в долю не входит — так её задаёт weightsForRound (skullShare), и так игрок видит её в мониторе и на корпусе.
   * Бесплатные прокрутки сюда не попадают: черепов в них нет всегда, а строка — про обычную прокрутку.
   */
  private skullShareNext(): number {
    if (this.isRescue) return RESCUE_SKULL_SHARE; // спасение: в сетке своя доля черепов — показываем её, а не раунда
    if (pactEffects(this.pacts, this.round).noSkulls) return 0; // сделка «нет черепов»: их и правда нет
    return this.currentSkullShare(); // то же число считает ачивка «50 на 50»: один код, а не два
  }

  /** HUD: приборы корпуса плюс доля черепов — её считает только эта сцена, у неё веса прокрутки. */
  protected override refreshHud(): void {
    super.refreshHud();
    this.panel.showSkullShare(this.skullShareNext());
    // Сделка №15: кон уже забран, но второе забирание ещё можно — окно выплаты горит и показывает его сумму
    // (обычное «кон пуст — окно гаснет» сделало бы второе забирание невидимой кнопкой).
    const extra = this.canTakeAgain() ? this.extraTake() : 0;
    if (extra > 0) this.payout.showPot(extra, this.debt);
    // Идёт каскад рамок — окошко показывает свою долю, а не весь кон: снятие паузы или новость во время показа
    // не должны выдать финальную сумму раньше последней рамки.
    if (this.revealShown !== null && !this.isGameOver) this.payout.showPot(this.revealShown, this.debt);
  }

  /**
   * Сетка встала. Платная прокрутка с заряженной перемешкой или подменой — обязательный выбор: надпись на стекле
   * и столбец (клетка), и только потом итог (offerReroll); иначе итог сразу (evaluateSpin). Пропустить выбор нельзя.
   * Бесплатная прокрутка выбора не предлагает: заряженное ждёт платной.
   */
  private finishSpin(grid: Grid, weightOf: WeightOf, multiplier: number, isFree: boolean): void {
    this.isSpinning = false;
    if (!isFree && (this.itemEffects.shuffle || this.itemEffects.swap)) {
      this.offerReroll(grid, weightOf, multiplier);
      return;
    }
    this.evaluateSpin(grid, multiplier);
  }

  /**
   * Итог прокрутки: паттерн из черепов — onSkulls, иначе серия растёт, выигрыш или копилка — на кон, пауки едят кон.
   * Кровь на экране — следующая прокрутка кровавая; короны, клевер и джекпот — collectBonuses. Выпал кубик — сначала сделки Дилера, потом дальше.
   * Единственный вход в подсчёт: и обычная прокрутка, и сетка после перемешки или подмены приходят сюда.
   */
  private evaluateSpin(grid: Grid, multiplier: number): void {
    const result = evaluateGrid(grid, { ignoreLocks: this.itemEffects.hammer }); // молот: замки не блокируют
    const isBloody = this.isBloodNext; // кровь была в прошлой прокрутке — эта кровавая
    this.isBloodNext = cellsOf(grid, 'blood').length > 0;
    if (result.tickets >= TICKET_SCATTER) this.collectTicketSymbols(grid);
    const locked = this.itemEffects.hammer ? [] : [...lockedColumns(grid)]; // при молоте столбцы не затемняются
    this.screen.dimColumns(locked); // замок заблокировал свои столбцы
    if (locked.length > 0) this.sfx.play('lock');
    if (this.isBloodNext) this.sfx.play('blood');
    if (result.kind === 'skull') {
      // Улучшение №50 (28г): если череп действительно сжёг бы кон — сначала плашка «ОТМЕНИТЬ ЧЕРЕП»,
      // и только потом обычный итог (его вызовет resolveSkullCancel). Отменили — ни кона, ни серии.
      if (this.canCancelSkull()) {
        this.offerSkullCancel(grid, result, isBloody);
        return;
      }
      this.onSkulls(result, isBloody);
      this.finishSpinOutcome(grid, result); // черепам показывать нечего: итог идёт сразу, как раньше
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без паттерна из черепов, даже без выигрыша
      this.panel.pulseMultiplier(); // множитель в окошке вырос
      if (result.kind === 'win') {
        // Выигрыш показывается каскадом рамок, а остальной итог ждёт конца показа (finishSpinOutcome в колбэке).
        this.addToPot(result, multiplier, isBloody, () => {
          this.feedSpiders(grid);
          this.finishSpinOutcome(grid, result);
        });
      } else {
        this.feedPiggy(multiplier);
        this.feedSpiders(grid);
        this.finishSpinOutcome(grid, result);
      }
    }
  }

  /**
   * Всё, что идёт после того, как кон пополнен и выигрыш показан: короны, клевер и джекпот, ржавчина, ачивки,
   * сброс риск/молот/фарт, предметы у экрана, HUD, кубик (сделки Дилера) или обычное продолжение раунда.
   * У выигрыша это зовётся из колбэка каскада рамок — порядок тот же, что был, сдвинут только момент
   * (раньше — сразу после addToPot, теперь — после последней рамки).
   */
  private finishSpinOutcome(grid: Grid, result: SpinResult): void {
    this.tutorialSpinEnded(); // обучение: бит, который ждал прокрутки, пройден
    this.collectBonuses(grid, result);
    this.rustAfterSpin(grid); // ржавый автомат: столбец может заржаветь к следующей прокрутке
    // Ачивки этой прокрутки проверяем до того, как гаснут риск, молот и фарт: они работали на неё, и «Неа»,
    // «Везунчик» и «Я играю не туда» должны их видеть (после сброса флагов эти ачивки не выпадали бы никогда).
    // «50 на 50» тоже получает долю именно этой прокрутки — ту, с которой она крутилась.
    this.checkAchievements(result.kind === 'win');
    // Риск, молот и фарт действуют на одну прокрутку — она прошла, гаснут. Молот с улучшением №25 (28б)
    // переживает прокрутку без выигрыша: у замка не было что блокировать, предмет ждёт следующей.
    this.itemEffects.risk = false;
    if (!keepsHammerAfter(result.kind, this.upgradeEffects.keepsHammerOnEmpty)) this.itemEffects.hammer = false;
    this.itemEffects.luckSpin = false;
    // Перемешка и подмена здесь не гаснут: выбор их уже погасил (applyShuffle/applySwap). Если заряжены оба,
    // подмена осталась на следующую платную прокрутку — до конца раунда её снимет clearRoundEffects.
    this.showItemEffects();
    this.itemShelf.refreshPulses(); // риск, молот и фарт погасли — предметы на полке снова годны, пульс пересчитываем
    this.refreshHud();
    if (cellsOf(grid, 'dice').length > 0) {
      this.diceDrought = 0;
      this.sfx.play('dice');
      this.startDealerGame(() => this.afterSpin());
    } else {
      this.diceDrought += 1; // кубика нет — в следующий раз его шанс чуть выше
      this.afterSpin();
    }
  }

  // ---------- Перемешка и подмена (шаг 63б) ----------

  /**
   * Платная прокрутка встала, а на полке заряжена перемешка или подмена: на стекле короткая новость «ПЕРЕКРУТИТЬ?»
   * или «ПОДМЕНА?» (как «ФАЗА 2», без окна и крестика), и сразу включаются зоны выбора — столбец или клетка.
   * Выбор ОБЯЗАТЕЛЕН: итог ждёт (pendingReroll), canAct() заперт, пока столбец или клетка не выбраны; пропуска нет.
   * Оба предмета заряжены — сначала перемешка, подмена остаётся на следующую платную прокрутку.
   */
  private offerReroll(grid: Grid, weightOf: WeightOf, multiplier: number): void {
    const id: RerollId = this.itemEffects.shuffle ? 'shuffle' : 'swap';
    this.pendingReroll = { grid, weightOf, multiplier, id };
    this.isRerolling = true;
    this.screen.announceNews(t(this.rerollNewsKey(id)));
    this.screen.beginPick(id === 'shuffle' ? 'column' : 'cell', (row, col) => {
      if (id === 'shuffle') this.applyShuffle(col);
      else this.applySwap(row, col);
    });
    this.refreshHud();
  }

  /**
   * Игрок дёрнул прокрутку, «забрать» или долг, пока решение висит: ничего не делаем, только напоминаем —
   * надпись на стекле заново и «нет» звуком. Выбор обязателен: обойти его нельзя.
   */
  private remindReroll(): boolean {
    if (!this.pendingReroll) return false;
    this.relabelReroll();
    this.sfx.play('deny');
    return true;
  }

  /** Сменили язык, а решение висит: новость на стекле — заново на новом языке. */
  protected relabelReroll(): void {
    const pending = this.pendingReroll;
    if (pending) this.screen.announceNews(t(this.rerollNewsKey(pending.id)));
  }

  /** Ключ новости решения: «ПЕРЕКРУТИТЬ?» для перемешки, «ПОДМЕНА?» для подмены. */
  private rerollNewsKey(id: RerollId): 'rerollAskRespin' | 'rerollAskSwap' {
    return id === 'shuffle' ? 'rerollAskRespin' : 'rerollAskSwap';
  }

  /**
   * Перемешка: столбец col перекручивается целиком новыми символами этой прокрутки, потом — итог по новой сетке.
   * Предмет тратится; защита от двойного клика — pendingReroll снимается до анимации.
   */
  private applyShuffle(col: number): void {
    const pending = this.pendingReroll;
    if (!pending) return;
    for (let row = 0; row < GRID_ROWS; row++) pending.grid[row][col] = randomSymbol(pending.weightOf);
    this.itemEffects.shuffle = false;
    this.itemShelf.spend('shuffle', cellX(col), GRID_Y);
    this.itemShelf.refreshPulses(); // перемешка потрачена — место у экрана свободно, пульс пересчитываем
    this.isSpinning = true; // сетка перекручивается: приборы гаснут до итога
    this.clearReroll();
    this.screen.rerollColumn(col, pending.weightOf, (row) => pending.grid[row][col], () => {
      this.isSpinning = false;
      this.evaluateSpin(pending.grid, pending.multiplier);
    });
  }

  /** Подмена: в клетке (ряд, столбец) теперь джокер, клетка подпрыгивает, потом — итог по новой сетке. */
  private applySwap(row: number, col: number): void {
    const pending = this.pendingReroll;
    if (!pending) return;
    pending.grid[row][col] = JOKER;
    this.itemEffects.swap = false;
    this.itemShelf.spend('swap', cellX(col), cellY(row));
    this.itemShelf.refreshPulses(); // подмена потрачена — место у экрана свободно, пульс пересчитываем
    this.isSpinning = true;
    this.clearReroll();
    this.screen.revealCell(row, col, JOKER, () => {
      this.isSpinning = false;
      this.evaluateSpin(pending.grid, pending.multiplier);
    });
  }

  /** Решение снято: зоны выбора выключены, приборы снова по canAct(). Итог считает выбор столбца или клетки. */
  private clearReroll(): void {
    this.pendingReroll = null;
    this.isRerolling = false;
    this.tooltip.hide(); // подсказка не должна висеть, когда решения уже нет
    this.screen.clearNews(); // «ПЕРЕКРУТИТЬ?» / «ПОДМЕНА?» гаснут сразу: решение снято
    this.screen.endPick();
    this.showItemEffects();
    this.refreshHud();
  }

  /**
   * После итога (и сделок Дилера, если они были): впереди бесплатные прокрутки — следующая сама, прокрутки кончились — конец раунда,
   * иначе спокойный момент — может начаться новая фаза.
   */
  private afterSpin(): void {
    if (this.freeSpins > 0 && this.freeSpinsAwarded > FREE_SPINS_GUARD) {
      this.breakRunawayFreeSpins();
      return;
    }
    if (this.freeSpins > 0) this.time.delayedCall(FREE_SPIN_PAUSE, () => this.spinFree());
    else if (this.spinsLeft === 0) this.endOfSpins();
    else this.checkPhase();
    this.refreshHud();
  }

  /**
   * Предохранитель от зависания раунда, а не игровое правило: цепочка «бесплатная прокрутка даёт короны» выдала
   * больше FREE_SPINS_GUARD прокруток за раунд — раунд кончается штатно, как по нулю прокруток (endOfSpins:
   * кон забирается, приходит Коллектор), а в консоль уходит предупреждение. Игроку это никак не показывается:
   * до 500 цепочка доходит редко (2–3 % забегов по симуляции full-run.mjs), но именно в этих случаях без
   * предохранителя раунд не кончался бы.
   */
  private breakRunawayFreeSpins(): void {
    console.warn('free spins guard', this.freeSpinsAwarded, 'free spins in round', this.round);
    this.freeSpins = 0; // цепочка рвётся, иначе после Коллектора она продолжится в новом раунде
    this.spinsLeft = 0; // и обычных прокруток не остаётся — раунд кончен
    this.endOfSpins();
  }

  /** Пауки на экране: каждый съедает часть кона. Их клетки в рамках, над первым — «−N». */
  private feedSpiders(grid: Grid): void {
    const spiders = cellsOf(grid, 'spider');
    const bite = spiderBite(this.pot, spiders.length);
    if (bite === 0) return;
    this.pot -= bite;
    this.sfx.play('spider');
    this.screen.highlightCells(spiders, SPIDER_BORDER);
    const [row, col] = spiders[0];
    this.effects.popupAt(cellX(col), cellY(row) - 30, `−${bite}`, PURPLE_TEXT);
    this.payout.addWin(this.pot, this.debt); // сумма в окошке — по новому кону
  }

  /**
   * Улучшение №50 (28г): можно ли сейчас отменить череп. Только если улучшение куплено и в этом забеге ещё не
   * тратилось, и только когда череп правда сжёг бы кон: щит и бронежилет его и так отобьют, сделка №10 «первый
   * череп не жжёт» — тоже, а в раунде спасения свои правила (черепа там не жгут кон вовсе).
   */
  private canCancelSkull(): boolean {
    if (this.isRescue) return false;
    if (!skullCancelAllowed(this.upgradeEffects, this.skullCancelUsedThisRun)) return false;
    if (this.roundShields > 0 || this.itemEffects.shields > 0) return false;
    const pact = pactEffects(this.pacts, this.round);
    return !(pact.bankSurvivesSkull && !this.bankKeptThisRound);
  }

  /**
   * Плашка «ОТМЕНИТЬ ЧЕРЕП» теперь — строка списка на экране автомата (шаг 37). Список висит, пока игрок не решит:
   * строка — череп отменяется, ✕ — срабатывает как обычно (resolveSkullCancel(false)). Пока список висит,
   * ввод закрыт: прокрутка ещё не осела, второй рычаг нажать нельзя.
   */
  private offerSkullCancel(grid: Grid, result: SpinResult, isBloody: boolean): void {
    this.pendingSkull = { grid, result, isBloody };
    this.isSpinning = true;
    this.sfx.play('warning', 0.25);
    const list = new ScreenList(this);
    this.skullCancelList = list;
    list.show(
      [{ icon: '💀', title: t('skullCancel'), desc: t('skullCancelWhat'), right: t('upgTake'), danger: true }],
      {
        title: t('skullCancelTitle'),
        caption: t('skullCancelCaption'),
        onPick: () => this.resolveSkullCancel(true),
        onClose: () => this.resolveSkullCancel(false), // ✕ — не отменять, череп сработает как обычно
      },
    );
    this.skullCancelBox = list.parts;
    this.refreshHud();
  }

  /**
   * Клавиша C (шаг 35): отменить висящий череп так же, как клик по плашке. Плашки нет — клавиша молчит:
   * отменять нечего, и тратить единственную за забег нельзя.
   */
  protected cancelSkullByKey(): void {
    if (!this.pendingSkull) return;
    this.resolveSkullCancel(true);
  }

  /**
   * Итог черепа после плашки: cancelled — игрок отменил. Отмена одноразовая за забег (флаг липкий: откат кассетой
   * вторую не даёт), кон и серия остаются как были; иначе — обычный onSkulls. Дальше всегда finishSpinOutcome,
   * чтобы короны, клевер, ачивки и продолжение раунда отработали как после любой прокрутки.
   */
  protected resolveSkullCancel(cancelled: boolean): void {
    const pending = this.pendingSkull;
    if (!pending) return;
    this.pendingSkull = null;
    this.clearSkullCancel();
    if (cancelled) {
      this.skullCancelUsedThisRun = true;
      this.sfx.play('shield');
      this.effects.popup(t('skullCancelled'), BLUE_TEXT);
    }
    this.isSpinning = false;
    this.onSkulls(pending.result, pending.isBloody, cancelled);
    this.finishSpinOutcome(pending.grid, pending.result);
  }

  /** Убрать список: решение снято (нажали или забег начинается заново). */
  private clearSkullCancel(): void {
    this.skullCancelList?.close();
    this.skullCancelList = null;
    this.skullCancelBox = null;
    this.pendingSkull = null;
  }

  /** Паттерн из черепов: первым его отбивает бронежилет, потом щит, иначе кон сгорает. Коллекционер костей их считает. */
  private onSkulls(result: SpinResult, isBloody: boolean, cancelled = false): void {
    this.bones += 1; // паттерн из черепов выпал в любом случае — его и считает Коллекционер костей
    if (owns(this.amuletIds(), 'bones')) this.amuletRack.trigger('bones');
    const pact = pactEffects(this.pacts, this.round);
    if (!cancelled) {
      this.grantSkullFreeSpin(); // улучшение №4: первый паттерн черепов в раунде даёт бесплатную прокрутку
      // Сделка №46: череп не отбивается ни бронежилетом, ни щитом — кон сгорает всегда.
      if (!pact.skullUnblockable && this.roundShields > 0) {
        this.roundShields -= 1;
        this.amuletRack.trigger('vest');
        this.blockSkulls(result);
      } else if (!pact.skullUnblockable && this.itemEffects.shields > 0) {
        this.itemEffects.shields -= 1;
        this.itemShelf.spend('shield', CENTER_X, GRID_Y); // щит летит на сетку и тает
        this.itemShelf.refreshPulses(); // щит потрачен: место у экрана могло освободиться — второй щит на полке снова годен
        this.blockSkulls(result);
      } else {
        // Сделка №10: первый череп в этом раунде кон не жжёт (потом жжёт как обычно). Серия падает в любом случае.
        // Сделка №24: первый череп раунда тоже щадит кон, но следующий сжигает вдвое — пот и столько же с табло.
        const bankSafe = pact.bankSurvivesSkull && !this.bankKeptThisRound;
        const pactSafe = pact.potSafeFirst && !this.potSparedThisRound;
        if (bankSafe) this.bankKeptThisRound = true;
        if (pactSafe) this.potSparedThisRound = true;
        const keepsPot = bankSafe || pactSafe;
        const doubleBurn = pact.skullDoubleBurn && this.potSparedThisRound && !keepsPot;
        const lost = keepsPot ? 0 : this.pot;
        this.burnPot(result, keepsPot);
        if (doubleBurn && lost > 0) this.burnBoardAmount(lost);
        if (isBloody) this.burnBoard();
      }
      // Сделка №2: каждый паттерн из черепов отнимает прокрутку, но не оставляет раунд без прокруток вовсе.
      if (pact.skullSpinCost > 0) {
        const before = this.spinsLeft;
        this.spinsLeft = Math.max(MIN_ROUND_SPINS, this.spinsLeft - Math.abs(pact.skullSpinCost));
        if (this.spinsLeft < before) this.panel.burnOutSpinLamps(before - this.spinsLeft);
      }
    }
    this.showBones();
  }

  /**
   * Улучшение №4 (шаг 28): первый паттерн черепов в раунде даёт бесплатную прокрутку — она крутится сама и по правилам
   * бесплатных (без черепов, кубика, пауков), как прокрутки за короны. За раунд такая одна: счётчик skullFreeSpinGiven.
   * Почему в onSkulls, а не в burnPot: черепа отбил щит — это всё равно «первый череп раунда», подарок он не отменяет.
   */
  private grantSkullFreeSpin(): void {
    if (!this.upgradeEffects.freeSpinAfterFirstSkull || this.skullFreeSpinGiven) return;
    this.skullFreeSpinGiven = true;
    this.freeSpins += 1;
    this.freeSpinsAwarded += 1; // считаем и её: предохранитель FREE_SPINS_GUARD видит все бесплатные прокрутки раунда
    this.panel.showFreeSpins(this.freeSpins);
    this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, '+1', GOLD_TEXT);
    this.sfx.play('news', 0.3);
  }

  /** Кровавая прокрутка с черепами: сгорает ещё и часть фишек на табло. */
  private burnBoard(): void {    const burned = bloodBurn(this.balance);
    if (burned === 0) return;
    this.balance -= burned;
    this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `−${burned}`, RED_TEXT);
    this.panel.pulseBoard();
    this.markDebt();
  }

  /** Сделка №24: второй череп после пощажённого сжигает вдвое — столько же фишек уходит и с табло. */
  private burnBoardAmount(amount: number): void {
    if (!(amount > 0)) return;
    const burned = Math.min(this.balance, Math.round(amount));
    if (burned === 0) return;
    this.balance -= burned;
    this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `−${burned}`, RED_TEXT);
    this.panel.pulseBoard();
    this.markDebt();
  }

  /**
   * Черепа сжигают кон вместе с выигрышем этой прокрутки, серия падает до трети. Страховка возвращает на табло
   * `INSURANCE_SHARE` сгоревшего — по разу за копию: каждая копия даёт в раунде ещё одно спасение (`insuranceSaves`).
   * Сделка №5 «страховка возвращает 100%» поднимает долю возврата до всего кона (pactEffects.insuranceShare),
   * улучшение №15 — до 80%: берём большую из двух, чтобы улучшение не отменило сделку.
   * keepsPot (сделка №10) — кон остаётся: сгорать нечему, страховка не тратится, но серия падает как обычно.
   */
  private burnPot(result: SpinResult, keepsPot = false): void {
    const lost = keepsPot ? 0 : this.pot;
    const effects = pactEffects(this.pacts, this.round);
    const share = Math.max(effects.insuranceShare, this.upgradeEffects.insuranceShare);
    const insured = insuranceRefund(lost, this.amuletIds(), this.insuranceSaves, share);
    // Сделка №23: череп возвращает на табло половину сгоревшего кона без всякой страховки.
    const pactRefund = Math.floor(lost * Math.max(0, Math.min(1, effects.skullPotRefund)));
    const refund = Math.max(insured, pactRefund);
    if (!keepsPot) this.pot = 0;
    // Сделки с черепом: «череп в ×1» обнуляет серию, «мягкий череп» снимает одну ступень (одно очко серии),
    // иначе остаётся треть (SKULL_KEEPS_STREAK).
    this.streak = skullStreakAfter(this.streak, pactEffects(this.pacts, this.round));
    this.sfx.play('skulls');
    this.screen.highlightSkulls(result.hits);
    this.effects.flashAndShake();
    this.screen.flashLamps(LAMP_RED, SKULL_LAMPS_TIME);
    this.panel.flashMultiplierRed();
    if (refund > 0) {
      if (insured > 0) {
        this.insuranceSaves += 1; // сработка копии: следующая копия (если есть) спасёт ещё раз в этом раунде
        this.amuletRack.trigger('insurance');
      }
      this.earn(refund); // возврат страховки или сделки — доход забега: игра отдала эти фишки обратно
      this.payout.takeAll(refund, () => this.panel.pulseBoard());
      this.markDebt();
    } else if (lost > 0) {
      this.effects.popup(`−${lost}`, RED_TEXT); // сколько сгорело с кона
      this.sfx.play('burn', 0.15);
      this.payout.burn();
    }
  }

  /** Три билета 🎟 на экране (или больше) — настоящий билет: клетки в рамках, билет летит с сетки на табло. */
  private collectTicketSymbols(grid: Grid): void {
    this.tickets += 1;
    this.sfx.play('ticket');
    this.screen.highlightCells(ticketCells(grid), TICKET_BORDER);
    this.panel.flyTickets(1, CENTER_X, GRID_Y);
  }

  /** Коллекционер костей: под его гнездом — сколько процентов он уже прибавляет (черепа считаются с начала забега). */
  protected showBones(): void {
    this.amuletRack.showBones(Math.round(this.bones * BONES_BONUS * 100));
  }

  /** Щит или бронежилет отбил паттерн из черепов: кон цел, серия идёт дальше, но выигрыша в эту прокрутку нет. */
  private blockSkulls(result: SpinResult): void {
    this.streak += 1;
    this.panel.pulseMultiplier();
    this.sfx.play('shield');
    this.screen.highlightBlocked(result.hits);
    this.screen.flashLamps(LAMP_BLUE, SHIELD_LAMPS_TIME);
    this.effects.popup('🛡', BLUE_TEXT);
    this.showItemEffects();
  }

  /**
   * Выигрыш паттернов (с амулетами) × множитель серии × множитель амулетов и автомата идёт на кон.
   * Колокольчик добавляет прокрутки (не выше потолка раунда) и на столько же срабатываний греет черепа
   * (bellSkullDelta). Кон прибавляется сразу (t0): числа те же, что были,
   * а вот показ теперь поэтапный — рамки загораются по одной (showWinReveal), и done() зовётся, когда каскад кончился.
   * Звук итога здесь не играет: по звуку на каждый паттерн и один итоговый — в каскаде, в самом его конце.
   */
  private addToPot(result: SpinResult, multiplier: number, isBloody: boolean, done: () => void): void {
    const ids = this.amuletIds();
    const pact = pactEffects(this.pacts, this.round);
    const payMul = (symbol: SlotSymbol): number => pactSymbolPay(symbol, pact); // сделка №14: вишни платят ×2
    const win = amuletPatternWin(result.hits, ids, payMul);
    const jackpot = result.hits.some((hit) => hit.pattern.id === 'jackpot'); // №34: только джекпот, не все ×100
    const factor =
      winFactor(ids, this.bones) *
      (isBloody ? BLOOD_WIN : 1) * // кровавая прокрутка — ×3
      machineWinFactor(this.machineId) *
      (this.itemEffects.risk ? RISK_WIN_FACTOR : 1) * // риск: выигрыш ×10 (видно в подсказке как ×10)
      pact.winMul * // сделка «выигрыш паттернов +N%» — только паттерны, не «забрать»
      this.upgradeEffects.winMul * // улучшение №12 «выигрыш паттернов +5%» (шаг 28) — тоже только паттерны
      lotteryWinMul(this.actionState) * // действие №4 (шаг 29): лотерея может поднять или срезать выигрыш раунда
      jackpotWinFactor(jackpot, this.upgradeEffects) * // улучшение №34: джекпот ×1,2 (×120 вместо ×100)
      pactJackpotWin(jackpot, pact); // сделка №12: джекпот платит вдвое
    const gain = winGain(result.hits, ids, multiplier, factor, payMul); // та же формула, что в показе по шагам (revealSteps)
    const potBefore = this.pot; // от него окошко выплаты показывает, как кон растёт по шагам
    this.pot += gain;
    // Колокольчик: прокрутки, но не выше потолка. Показываем, сколько добавилось на самом деле: у потолка бывает и 0.
    const extra = spinsAfterBonus(this.spinsLeft, bellSpins(result.hits, ids), this.spinCap()) - this.spinsLeft;
    this.spinsLeft += extra;
    // Колокольчик греет черепа: поправку копим по всем срабатываниям раунда, даже когда прокрутки уже у потолка
    // (сработало же). Дальше она живёт в weightContext — и в прокрутке, и на плашке «💀 N%».
    this.bellSkull = bellSkullDelta(result.hits, ids, this.bellSkull);
    if (extra > 0) {
      this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${extra}`, GOLD_TEXT);
      this.panel.winkSpinLamps(this.spinsLeft);
    }
    for (const id of amuletsOnWin(result.hits, ids)) this.amuletRack.trigger(id);
    this.screen.flashLamps(LAMP_GOLD, WIN_LAMPS_TIME);
    // Каскад рамок: по шагу на паттерн. Он показывает то, что уже начислено, и в конце зовёт done().
    this.showWinReveal(revealSteps(result.hits, ids, multiplier, factor, payMul), win, multiplier, factor, gain, potBefore, done);
  }

  /**
   * Поэтапный показ выигравших паттернов: каждая линия (диагональ, фигура) загорается своей рамкой, попапом «+дельта»
   * и прибавкой в окошке выплаты — как в Clover Pit (DONTLIKE 19.11, «Улучшения» п.1). Рамки НЕ копятся: линия
   * загорелась, погасла, загорелась следующая. Каждый шаг сам снимает прошлую рамку (SlotScreen.startWinStep), а свою
   * тушит по alpha за последние WIN_REVEAL_FADE_SHARE шага — к началу следующего шага на сетке пусто.
   *
   * Звук: короткий «coin» на каждый паттерн (громкости на вызов у Sfx нет, поэтому coin, а не win) и один итоговый
   * win/bigWin после последней паузы — там же, где «+gain» и брызги фишек.
   *
   * В деньги и счётчики здесь не пишется ничего: кон уже начислен в addToPot (t0), окошко выплаты получает только показ
   * (showPot), а начислять в конце (payout.addWin) — это тоже показ, а не деньги. Настоящее начисление и всё, что
   * после него, — в finishSpinOutcome, её зовёт колбэк в самом конце. Не переносить сюда collectBonuses,
   * rustAfterSpin и checkAchievements: числа должны остаться прежними.
   *
   * isSpinning держится на весь показ — поэтому рычаг, «забрать» и кассета до конца каскада не срабатывают.
   * Шаги идут по таймерам сцены (пауза их замораживает), и каждый проверяет своё поколение (revealId) и isGameOver:
   * запоздавший шаг старого показа после сброса или KABOOM молча гаснет.
   */
  private showWinReveal(
    steps: RevealStep[],
    win: number,
    multiplier: number,
    factor: number,
    gain: number,
    potBefore: number,
    done: () => void,
  ): void {
    if (steps.length === 0) {
      // Страховка: показывать нечего (пустой каскад) — не запираем ввод и сразу отдаём итог. Без неё цикл шагов
      // пуст, а ввод всё равно стоял бы до конца паузы WIN_REVEAL_HOLD.
      done();
      return;
    }
    const id = this.revealId; // поколение показа: сброс состояния его сменит, и старые шаги замолчат
    const stepMs = revealStepMs(steps.length, this.isFreeSpinNow);
    const hold = this.isFreeSpinNow ? 0 : WIN_REVEAL_HOLD; // бесплатная прокрутка идёт сама — лишней паузы нет
    // Тушение рамки: последние 45% шага. У последнего шага оно тянется ещё и на паузу hold — рамка тает до итога.
    const fadeMs = stepMs * WIN_REVEAL_FADE_SHARE;
    const fadeDelay = stepMs - fadeMs;
    this.isSpinning = true; // каскад — часть прокрутки: ввод закрыт до его конца (canAct)
    steps.forEach((step, index) => {
      const tail = index === steps.length - 1 ? hold : 0; // последней рамке — ещё и пауза перед итогом
      this.time.delayedCall(index * stepMs, () => {
        if (this.revealId !== id || this.isGameOver) return;
        this.showWinStep(step, potBefore, fadeDelay, fadeMs + tail);
      });
    });
    // Последний шаг тоже держится свой шаг, потом пауза hold — и итог.
    this.time.delayedCall(steps.length * stepMs + hold, () => {
      if (this.revealId !== id) return; // сцена перезапустилась: показ не наш, снимать нечего
      if (this.isGameOver) {
        this.fadeWinPopup(); // на KABOOM попап шага тоже убираем
        this.revealShown = null; // KABOOM: каскад снят, окошко снова живёт обычным путём
        this.isSpinning = false; // раунд кончился на KABOOM, но не запираем сцену: если забег продолжится без resetState, ввод свободен
        this.refreshHud();
        return;
      }
      this.sfx.play(gain >= this.debt / 2 ? 'bigWin' : 'win'); // итог — один раз и в конце, а не на t0
      this.fadeWinPopup(); // прошлый попап шага гаснет к итоговому
      this.effects.popup(formatWin(win, multiplier, factor, gain), GOLD_TEXT);
      this.effects.burstFromGrid(gain);
      this.payout.addWin(this.pot, this.debt); // в окошке — настоящий кон: он равен potBefore + последнего shown
      this.screen.clearHighlights(); // последняя рамка уже погасла твином — снимаем её совсем, чтобы не висела
      this.revealShown = null; // каскад кончился: окошко снова показывает кон обычным путём
      this.isSpinning = false;
      this.refreshHud();
      done();
    });
  }

  /**
   * Один шаг каскада: рамка паттерна, его прибавка попапом в центре фигуры и новое число в окошке выплаты.
   * Прошлую рамку снимает startWinStep, а своя гаснет за fadeDuration мс через fadeDelay — горит только этот паттерн.
   * Звук на шаг один: короткий «coin».
   */
  private showWinStep(step: RevealStep, potBefore: number, fadeDelay: number, fadeDuration: number): void {
    this.fadeWinPopup(); // попап прошлого шага гаснет к этому шагу — надписи не копятся
    this.screen.startWinStep(step.hit); // прошлые рамки сняты: горит только этот паттерн
    this.sfx.play('coin');
    const cols = step.hit.cells.map(([, col]) => cellX(col));
    const rows = step.hit.cells.map(([row]) => cellY(row));
    const x = (Math.min(...cols) + Math.max(...cols)) / 2; // попап — в центр фигуры
    const y = (Math.min(...rows) + Math.max(...rows)) / 2;
    if (step.delta > 0) this.winPopup = this.effects.popupAt(x, y - 30, `+${step.delta}`, GOLD_TEXT); // округление может дать и 0
    this.revealShown = potBefore + step.shown; // только показ: в состояние не пишем
    this.payout.showPot(this.revealShown, this.debt);
    this.screen.fadeWinHighlights(fadeDelay, fadeDuration); // последние 45% шага рамка тает в ноль
  }

  /** Попап шага гаснет быстро к следующему шагу: твин в ноль за WIN_POPUP_FADE_MS, потом убираем. */
  private fadeWinPopup(): void {
    const winPopup = this.winPopup;
    if (!winPopup || !winPopup.active) {
      this.winPopup = null;
      return;
    }
    this.tweens.killTweensOf(winPopup);
    this.tweens.add({
      targets: winPopup,
      alpha: 0,
      duration: WIN_POPUP_FADE_MS,
      onComplete: () => winPopup?.destroy(),
    });
    this.winPopup = null;
  }

  /** Прокрутка без выигрыша: копилка кладёт на кон немного фишек (× множитель), с улучшением №14 — ещё +1 фишку. */
  private feedPiggy(multiplier: number): void {
    const pact = pactEffects(this.pacts, this.round);
    const coins = piggyCoins(multiplier, this.amuletIds(), this.upgradeEffects.piggyBonus + pact.piggyBonus);
    if (coins > 0) {
      this.pot += coins;
      this.sfx.play('coin');
      this.amuletRack.trigger('piggy');
      this.effects.popup(`+${coins}`, GOLD_TEXT);
      this.payout.addWin(this.pot, this.debt);
    }
    // Сделка №5: пустая прокрутка (кон без выигрыша) даёт ещё прокрутку — не выше потолка раунда.
    if (pact.emptySpinSpins > 0) {
      const before = this.spinsLeft;
      this.spinsLeft = spinsAfterBonus(this.spinsLeft, pact.emptySpinSpins, this.spinCap());
      if (this.spinsLeft > before) {
        this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${this.spinsLeft - before}`, GOLD_TEXT);
        this.panel.winkSpinLamps(this.spinsLeft);
      }
    }
  }

  // ---------- Забрать ----------

  /**
   * «Забрать»: кон уходит на табло. Бесплатно, но множитель уменьшается вдвое.
   * Сделка №15: после обычного забирания в этой же прокрутке можно забрать ещё раз — оно отдаёт
   * DOUBLE_TAKE_SHARE (80%) только что забранного кона и серию второй раз не режет.
   */
  protected take(): void {
    if (this.remindReroll()) return; // висит решение — сначала столбец или клетка, забрать раньше нельзя
    if (!this.canAct()) return;
    const pact = pactEffects(this.pacts, this.round);
    // Сделка №22: кон забрать руками нельзя — он уйдёт сам в конце раунда.
    if (pact.noTake) return;
    // Сделка №23: забрать кон можно один раз за раунд.
    if (pact.takeOncePerRound && this.tookThisRound) return;
    if (this.pot > 0) {
      this.payout.press();
      this.sfx.play('take');
      this.payPot();
      this.tutorialPotTaken(); // обучение: бит «забрать» пройден
      this.refreshHud();
      return;
    }
    const extra = this.extraTake();
    if (extra === 0) return;
    this.payout.press();
    this.sfx.play('take');
    this.takeExtra(extra);
    this.refreshHud();
  }

  /** Сколько отдаст второе «забрать»: сделка №15, только если кон уже забран в этой прокрутке и второго ещё не было. */
  private extraTake(): number {
    if (!this.tookThisSpin || this.tookExtraThisSpin || this.pot > 0) return 0;
    const pact = pactEffects(this.pacts, this.round);
    return pactDoubleTake(pact.doubleTake, this.lastTakeAmount, pact.doubleTakeShare);
  }

  /** Второе «забрать» в этой прокрутке ещё доступно — по нему Enter берёт, а не крутит (GameScene.onEnter). */
  protected canTakeAgain(): boolean {
    return this.canAct() && this.extraTake() > 0;
  }

  /** Второе «забрать» (сделка №15): фишки летят на табло, серию не режем — она уже упала на первом. */
  private takeExtra(amount: number): void {
    this.tookExtraThisSpin = true;
    this.earn(amount);
    this.payout.takeAll(amount, () => {
      this.effects.burstFromBoard();
      this.panel.pulseBoard();
    });
    this.markDebt();
  }

  /**
   * Кон переходит на табло (с включённым ×3 — втройне): фишки из окошка летят туда, серия уменьшается — окошко множителя сжимается.
   * Свеча оставляет серию как есть: это «забрать» множитель не режет. isRoundEnd — кон забирается сам в конце раунда:
   * тогда серию не режем, она переходит в следующий раунд такой, какой была (KABOOM её всё равно обнулит).
   */
  private payPot(isRoundEnd = false): void {
    let amount = this.pot;
    if (this.itemEffects.tripleTakes > 0) {
      this.itemEffects.tripleTakes -= 1;
      amount *= TRIPLE_TAKE_FACTOR;
      this.itemShelf.spend('triple', PAYOUT_WINDOW.x, PAYOUT_WINDOW.y); // ×3 влетает в окошко выплаты
      this.showItemEffects();
    }
    this.earn(amount); // кон — доход забега: так его считает цель 1 000 000
    if (!isRoundEnd) {
      // Сделка №15: запоминаем, сколько дало это забирание, — от него считается второе в той же прокрутке.
      this.lastTakeAmount = amount;
      this.tookThisSpin = true;
      this.tookExtraThisSpin = false;
      this.tookThisRound = true;
    }
    this.pot = 0;
    const pact = pactEffects(this.pacts, this.round);
    if (this.itemEffects.candle) {
      this.itemEffects.candle = false;
      this.itemShelf.spend('candle', PAYOUT_WINDOW.x, PAYOUT_WINDOW.y); // свеча сгорает: серия осталась
      this.showItemEffects();
    } else if (!isRoundEnd) {
      // Сделка №48: второе забирание отдаёт весь кон, но серия сбрасывается в ноль.
      this.streak = pact.takeStreakReset ? 0 : streakAfterTake(this.streak);
      this.panel.dropMultiplier();
    }
    this.payout.takeAll(amount, () => {
      this.effects.burstFromBoard();
      this.panel.pulseBoard();
    });
    this.markDebt();
    // ×3 отработал и свеча сгорела — места у экрана освободились, предметы на полке снова годны: пульс пересчитываем.
    this.itemShelf.refreshPulses();
  }

  /**
   * Передвинулся долг — перерисовываем записку. Фишек на табло стало хватать на долг (или уже не хватает):
   * хватило впервые за раунд, а прокрутки ещё есть — на стекле «НА ДОЛГ ХВАТАЕТ», огни мигают зелёным,
   * оставшиеся лампочки подмигивают: дальше крутишь себе в плюс или отдаёшь долг раньше (записка светится — refreshHud).
   */
  private markDebt(): void {
    if (this.isRescue) return; // в спасении раунд кончился: записку и новость не трогаем
    const isEnough = this.hasEnoughForDebt();
    this.collector.markNote(this.debt);
    if (!isEnough || this.isDebtNewsShown || this.isRoundOver) return;
    this.isDebtNewsShown = true;
    this.screen.announceDebtCovered();
    this.screen.flashLamps(LAMP_GREEN, DEBT_LAMPS_TIME);
    this.panel.winkSpinLamps(this.spinsLeft);
    this.sfx.play('news', 0.3);
  }

  // ---------- Предметы ----------

  /**
   * Почему предмет с полки нельзя включить (порядок как в useItem): «риск» с «фартом» несовместимы,
   * такой предмет уже действует (сигарета у потолка прокруток пропала бы впустую), места у экрана заняты.
   * null — можно включать.
   */
  private denyReason(item: Item): 'conflict' | 'busy' | 'full' | null {
    // Риск с фартом несовместимы — попытка включить один при другом и есть «Неа».
    if (conflictsWith(item.id, this.itemEffects)) return 'conflict';
    if (isItemOn(item.id, this.itemEffects) || (item.id === 'cigarette' && this.spinsLeft >= this.spinCap())) return 'busy';
    if (takesEffectSlot(item.id) && activeSlotEffects(this.itemEffects).length >= this.effectPlaces()) return 'full';
    return null;
  }

  /** Сколько мест у экрана сейчас даёт столбик (сделка №13 короче: предел — effectSlotLimit). */
  private effectPlaces(): number {
    return effectSlotLimit(pactEffects(this.pacts, this.round).effectSlotsDelta);
  }

  /**
   * Потолок прокруток в раунде: MAX_SPINS_PER_ROUND плюс улучшение №3 (шаг 28). Через него считаются все бонусные
   * прокрутки (колокольчик, джекпот, фаза, сигарета) и запрет сигареты у потолка — иначе улучшение работало бы наполовину.
   */
  protected spinCap(): number {
    return pactSpinCap(MAX_SPINS_PER_ROUND + this.upgradeEffects.spinCapBonus, pactEffects(this.pacts, this.round));
  }

  /** Вес символа прямо сейчас — для подписи в панели действий (шаг 29): те же правила, что у прокрутки. */
  protected currentSymbolWeight(symbol: SlotSymbol): number {
    return this.symbolWeight(symbol, this.baseWeights(), false);
  }

  /**
   * Можно ли сейчас включить предмет с полки: одни и те же правила в useItem и у полки (ItemShelf спрашивает
   * для пульса) — одна правда, без дублей (DONTLIKE, стр. 3: пульс не должен врать).
   */
  protected canUseItem(item: Item): boolean {
    return this.denyReason(item) === null;
  }

  /** Включить предмет с места полки slot (клик по нему или клавиша). Только между прокрутками. */
  protected useItem(slot: number): void {
    if (slot < 0 || slot >= this.slots) return; // закрытое место: клавиша молчит, дверцу не обойти
    const item = this.shelf[slot];
    if (!item) return;
    if (!this.canAct()) return; // висит решение по перемешке — этот нажим теряется, предмет включается отдельным нажатием после выбора
    const reason = this.denyReason(item);
    if (reason !== null) {
      this.sfx.play('deny');
      this.itemShelf.deny(slot);
      if (reason === 'conflict') this.unlockAchievement('nope');
      // Все места у экрана заняты: место освобождает сам игрок — кликом по включённому предмету, автозамены нет.
      if (reason === 'full') this.tooltip.show(t('effectsFull'), '');
      return;
    }
    this.tooltip.hide();
    this.shelf[slot] = null;
    this.sfx.play('item');
    this.activateItem(item);
    // Сигарета летит к лампочкам прокруток, чеснок — на сетку (в столбике у экрана его нет), остальные — на своё место.
    const target =
      item.id === 'cigarette'
        ? { x: CENTER_X, y: SPIN_LAMPS_Y }
        : item.id === 'garlic'
          ? { x: CENTER_X, y: GRID_Y }
          : effectPosition(item.id, this.itemEffects);
    this.itemShelf.takeItem(slot, target.x, target.y, () => this.showItemEffects());
    this.itemShelf.refreshPulses(); // у других предметов из-за этого включения могли измениться правила
    this.refreshHud();
  }

  /**
   * Игрок кликнул по включённому предмету у экрана и освободил его место: предмет больше ничего не делает.
   * Значок к этому моменту уже погас (ItemShelf.fadeOut) — остаётся снять сам эффект и переставить столбик.
   * Не между прокрутками (крутится, Дилер, решение по перемешке, спасение) — нельзя: значок вернётся на место.
   */
  protected discardEffect(id: SlotEffectId): void {
    if (!this.canAct()) {
      this.showItemEffects(); // значок возвращается: снимать было нельзя
      return;
    }
    clearEffect(id, this.itemEffects);
    this.sfx.play('item');
    this.showItemEffects();
    this.itemShelf.refreshPulses(); // место у экрана освободилось — предмет снова годен и снова может дышать
    this.refreshHud();
  }

  /**
   * Что делает предмет. Сигарета — сразу; щит — в onSkulls, ×3 и свеча — в payPot, чеснок и бусты — в symbolWeight,
   * риск, молот и фарт — в symbolWeight и finishSpin (на одну прокрутку).
   */
  private activateItem(item: Item): void {
    switch (item.id) {
      case 'cigarette':
        this.spinsLeft = spinsAfterBonus(this.spinsLeft, CIGARETTE_SPINS, this.spinCap());
        this.cigarettesThisRound += 1; // третья за раунд — «Курильщик»
        if (this.cigarettesThisRound === CIGARETTES_FOR_ACHIEVEMENT) this.unlockAchievement('smoker');
        break;
      case 'shield':
        this.itemEffects.shields += 1;
        break;
      case 'garlic':
        this.itemEffects.symbolBoost.skull = GARLIC_SKULL_FACTOR;
        break;
      case 'triple':
        this.itemEffects.tripleTakes += 1;
        break;
      case 'cherries':
        this.itemEffects.symbolBoost.cherry = SYMBOL_BOOST_FACTOR;
        break;
      case 'bells':
        this.itemEffects.symbolBoost.bell = SYMBOL_BOOST_FACTOR;
        break;
      case 'diamonds':
        this.itemEffects.symbolBoost.diamond = SYMBOL_BOOST_FACTOR;
        break;
      case 'luck': // удача: и клевер 🍀, и короны 👑
        this.itemEffects.symbolBoost.clover = SYMBOL_BOOST_FACTOR;
        this.itemEffects.symbolBoost.crown = SYMBOL_BOOST_FACTOR;
        break;
      case 'risk':
        this.itemEffects.risk = true;
        break;
      case 'hammer':
        this.itemEffects.hammer = true;
        break;
      case 'candle':
        this.itemEffects.candle = true;
        break;
      case 'luckSpin':
        this.itemEffects.luckSpin = true;
        break;
      case 'shuffle':
        this.itemEffects.shuffle = true; // заряжена: надпись и выбор столбца — после следующей платной прокрутки
        break;
      case 'swap':
        this.itemEffects.swap = true;
        break;
    }
    // Первое включение предмета за всё время — простая ачивка (у каждого предмета из списка своя), а дальше
    // проверяем комбинации: риск + фарт, чеснок + колокола и прочее «одновременно».
    const achievement = ITEM_ACHIEVEMENTS[item.id];
    if (achievement !== undefined) this.unlockAchievement(achievement);
    this.checkAchievements();
  }

  /** Включённые предметы у экрана и цвет огней вокруг экрана в покое (чеснок, кровь, фаза — calmLampColor). */
  protected showItemEffects(): void {
    // Сделка №13: столбик короче на FREE_AMULET_SLOTS — лишние пустые места прячутся.
    this.itemShelf.showEffects(this.itemEffects, this.effectPlaces());
    this.screen.setCalmColor(this.calmLampColor());
  }

  // ---------- Действия вне прокрутки (шаг 29) ----------

  /**
   * Платящие символы, которые сейчас есть в автомате (вошли по раунду и не отобраны автоматом): из них
   * выбирают замену для обмена (№2) и проверяется, что менять есть на что. Черепа, злые символы, билет,
   * клевер, корона и кубик сюда не входят: они не платят, и обмен открыл бы то, чего в автомате нет.
   */
  protected machineSymbols(): SlotSymbol[] {
    const base = weightsForRound(this.round, diceWeight(this.diceDrought));
    return SYMBOLS.filter(
      (symbol) =>
        isPaying(symbol) &&
        machineSymbolAllowed(this.machineId, symbol) &&
        base(symbol) > 0 &&
        !this.actionState.sold.includes(symbol.id), // проданный символ (№8) из автомата ушёл
    );
  }

  /**
   * Платящие символы на последней сетке — из них игрок выбирает, что обменять (№2) и что продать (№8).
   * Пусто, пока в раунде не было прокрутки: менять нечего, и панель так и говорит.
   */
  protected gridSymbols(): SlotSymbol[] {
    const ids = new Set(this.machineSymbols().map((symbol) => symbol.id));
    const seen = new Set<string>();
    const result: SlotSymbol[] = [];
    for (const row of this.lastGrid ?? []) {
      for (const cell of row) {
        if (seen.has(cell.id) || !ids.has(cell.id)) continue;
        seen.add(cell.id);
        result.push(cell);
      }
    }
    return result;
  }

  /** Долг следующего раунда, каким его поставит магазин: для подписи цены «Долговой биржи» (№10). */
  protected nextDebtValue(): number {
    const next = shopDebt(this.debt, this.round + 1, this.debtNextMul, false, this.upgradeEffects.debtGrowthMul);
    return Math.max(0, next.debt + this.debtCarry);
  }

  /**
   * Прокрутки от лотереи (№4): прибавка идёт через потолок раунда (spinCap), отнять можно до одной прокрутки
   * в раунде — как сделка «−1 прокрутка»: раунд без прокруток невозможен.
   */
  protected actionSpins(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0) return;
    if (delta > 0) {
      const before = this.spinsLeft;
      this.spinsLeft = spinsAfterBonus(this.spinsLeft, delta, this.spinCap());
      if (this.spinsLeft > before) this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${this.spinsLeft - before}`, GOLD_TEXT);
      this.panel.winkSpinLamps(this.spinsLeft);
    } else {
      const before = this.spinsLeft;
      this.spinsLeft = Math.max(MIN_ROUND_SPINS, this.spinsLeft + delta);
      if (this.spinsLeft < before) this.panel.burnOutSpinLamps(before - this.spinsLeft);
    }
    this.refreshHud();
  }

  /**
   * Новость действия важнее отложенной новости о смене автомата: гасим её, иначе через MACHINE_NEWS_DELAY
   * название автомата затрёт «УКРАЛ!», «СИМВОЛ ПРОДАН» и другие результаты действий (гонка шага 43).
   */
  protected dropPendingMachineNews(): void {
    this.machineNewsTimer?.remove(false);
    this.machineNewsTimer = null;
  }

  // ---------- Начало и конец раунда ----------

  /**
   * Новый раунд: прокрутки снова полные (лампочки загораются по очереди), огни бегут зелёным.
   * Амулеты: «Жадность» забирает прокрутки, «Бронежилет» снова готов.
   */
  protected startRound(): void {
    const ids = this.amuletIds();
    this.cigarettesThisRound = 0; // и сигареты тоже
    // Автомат сам редко меняется в начале раунда: первый раунд — всегда тот, что стоит с забега.
    // Сделка №8 держит автомат первые NO_SWAP_ROUNDS своих раундов: тогда он остаётся прежним и новости о смене нет.
    // Улучшение №48 (28г) отключает смену совсем — шанс 0, как будто сделка держит автомат всегда.
    const swapChance = this.upgradeEffects.noMachineSwap ? 0 : MACHINE_SWAP_CHANCE;
    const machine = pactEffects(this.pacts, this.round).noMachineSwap ? this.machineId : machineAtRoundStart(this.machineId, this.round, swapChance);
    if (machine !== this.machineId) {
      this.machineId = machine;
      this.showNewMachine(); // корпус, значок и UPDATE на мониторе — сразу
      // Новость о смене — с задержкой: ниже в этом же startRound checkPhase может объявить «ФАЗУ 2»,
      // а на стекле живёт одна новость за раз. Через 1,5 с фаза уже прочитана, и название автомата встаёт на её место.
      this.machineNewsTimer?.remove(false);
      this.machineNewsTimer = this.time.delayedCall(MACHINE_NEWS_DELAY, () => {
        this.machineNewsTimer = null;
        if (!this.scene.isActive()) return; // сцену выключили — новость не нужна (таймеры сцены умирают вместе с ней)
        this.announceMachine();
      });
    }
    this.isRoundOver = false;
    this.isDebtNewsShown = this.hasEnoughForDebt(); // фишек хватает с начала раунда — новости нет, записка и так светится
    // Счётчик бесплатных прокруток за раунд — только для предохранителя FREE_SPINS_GUARD. В кассете (RunSave) его нет,
    // и после отката он снова 0: сцена тогда перезапускается (SaveScene.insertTape → scene.restart) и раунд начинается
    // заново. Это сознательно: бюджет — часть состояния раунда, а canRewind и так требует freeSpins === 0.
    // Флаг devUsedThisRun устроен наоборот — он лежит в RunSave (save.ts) и откат его не снимает: забег, который
    // трогали в «ТЕСТ», рекорда не пишет, к какой бы плёнке ни откатились.
    this.freeSpinsAwarded = 0;
    clearRoundEffects(this.itemEffects); // бусты и флаги прошлого раунда не переходят в новый
    this.insuranceSaves = 0; // страховка снова готова: сработок на новый раунд — по числу копий
    this.bankKeptThisRound = false; // сделка №10: «первый череп не жжёт кон» — снова первый
    this.tookThisRound = false; // сделка №23: «забрать» раз за раунд — счётчик нового раунда
    this.potSparedThisRound = false; // сделка №24: первый череп раунда снова пощадит кон
    // Кровь из прошлого раунда не переходит в новый. Сброс — ДО сделок: иначе сделка №40 «первая прокрутка
    // раунда кровавая» ставила флаг и тут же его гасила (баг шага 43).
    this.isBloodNext = false;
    // Сделки шага 30: №40 — первая прокрутка раунда кровавая, №21 — на кону с самого начала лежит N фишек.
    const roundPacts = pactEffects(this.pacts, this.round);
    if (roundPacts.bloodFirstSpin) this.isBloodNext = true;
    if (roundPacts.potStart > 0) this.pot = Math.max(this.pot, roundPacts.potStart);
    this.bellSkull = 0; // колокольчик: поправка к доле черепов живёт один раунд
    this.tookThisSpin = false; // сделка №15: в новом раунде «забрать» ещё не было
    this.tookExtraThisSpin = false;
    this.lastTakeAmount = 0;
    this.showItemEffects(); // спокойные огни — по новому раунду (кровь могла зажечь сделка №40)
    this.spinsLeft = spinsPerRound(SPINS_PER_ROUND, ids);
    // Фаза 2: +1 прокрутка в раунде (замечание 19). Фазу берём по закрытым долгам сразу, а не this.phase:
    // checkPhase идёт в конце startRound (после зелёных огней), а прокрутки нужны уже сейчас.
    this.spinsLeft = spinsAfterBonus(this.spinsLeft, phaseAt(this.closedDebts()).bonusSpins, this.spinCap());
    // Сделка «−1 прокрутка в раунде»: после амулетов и фазы, но не меньше MIN_ROUND_SPINS — иначе раунд кончился бы сразу.
    // «+1 прокрутка» (шаг 30) не пробивает потолок раунда: он для всех бонусных прокруток один (spinCap).
    const spinsDelta = pactEffects(this.pacts, this.round).spinsDelta;
    this.spinsLeft = Math.max(MIN_ROUND_SPINS, this.spinsLeft + spinsDelta);
    if (spinsDelta > 0) this.spinsLeft = Math.min(this.spinCap(), this.spinsLeft);
    // Улучшение №1 «+1 прокрутка в первом раунде» (шаг 28): только раунд 1 и после всех поправок — это подарок,
    // а не бонус, который потолок мог бы срезать.
    if (this.round === 1) this.spinsLeft += this.upgradeEffects.firstRoundSpins;
    // «Я пролью много крови» (DONTLIKE п.12): смотрим, сколько прокруток выдано НА СТАРТЕ раунда, а не остаток.
    // Здесь уже учтены амулеты (жадность), фаза, сделки и №1 — это и есть «в начале раунда».
    if (isBloodSpill(this.spinsLeft, ids)) this.unlockAchievement('bloodSpill');
    this.skullFreeSpinGiven = false; // №4: в новом раунде бесплатная прокрутка за первый череп снова доступна
    // Действия шага 29: одноразовые снова доступны, обмен/лотерея/проданные символы гаснут, чистка тикает.
    this.actionState = startRoundActions(this.actionState);
    this.lastGrid = null; // сетка прошлого раунда не годится для продажи и обмена: символы уже не те
    this.roundShields = vestShields(ids);
    if (owns(ids, 'greed')) this.amuletRack.trigger('greed');
    // Сделка кончилась — одна короткая новость. Новый символ важнее, поэтому announceNewSymbols идёт следом
    // и в раунде с новым символом перекрывает её (на стекле живёт одна новость).
    if (this.dropExpiredPacts()) this.screen.announceNews(t('pactOver'));
    this.announceNewSymbols();
    this.panel.popSpinLamps(this.spinsLeft); // лишние лампочки (фаза 2, сигареты) появляются сразу, а не вторым «попом»
    this.screen.flashLamps(LAMP_GREEN, NEW_ROUND_LAMPS_TIME);
    this.sfx.play('roundStart');
    this.checkPhase(); // начало раунда — спокойный момент; после зелёных огней раунда, иначе они перекроют красную вспышку фазы
    this.refreshHud();
    // В самом конце: прокрутки уже посчитаны (сигарета смотрит на spinsLeft), просроченные сделки сняты (лимит мест).
    this.itemShelf.refreshPulses(); // бусты и флаги прошлого раунда сняты — предметы на полке снова годны
    // Ранняя оплата долга (дорожка earlyPay) здесь не говорится: её реплика идёт сразу после оплаты второго долга,
    // ДО открытия магазина (CollectorScene.payDebt → tutorialEarlyPayBeforeShop, DONTLIKE, 25.11).
  }

  /**
   * Убрать сделки, чей срок вышел (последний раунд — untilRound): их срок прошёл вместе с прошлым раундом,
   * и в этом они уже ничего не делают. Вернёт true — что-то кончилось, и об этом стоит сказать один раз.
   */
  private dropExpiredPacts(): boolean {
    const alive = this.pacts.filter((pact) => pact.untilRound >= this.round);
    if (alive.length === this.pacts.length) return false;
    this.pacts = alive;
    return true;
  }

  /** В автомат вошли новые символы — новость на экране, а на мониторе они появляются. Один раз за раунд: номер раунда запоминается. */
  private announceNewSymbols(): void {
    if (this.round <= this.newsRound) return;
    this.newsRound = this.round;
    this.monitor.showRound(this.round);
    for (const symbol of symbolsUnlockedAt(this.round)) {
      this.screen.announce(symbol);
      this.sfx.play(symbol.isEvil ? 'warning' : 'news', 0.3);
    }
  }

  /**
   * Отдать долг раньше (клик по светящейся записке или D): фишек на табло хватает — оставшиеся прокрутки пропадают
   * (лампочки гаснут, за EARLY_PAY_MIN_SPINS и больше из них вылетает билет), и сразу приходит Коллектор — банкомат сам забирает долг.
   */
  protected payEarly(): void {
    if (this.remindReroll()) return; // висит решение — долг отдаётся только после выбора
    if (this.isDebtFree()) return; // долга нет (прощение, выкуп) — платить нечего, раунд не кончаем и билетов не даём
    if (!this.canAct() || !this.hasEnoughForDebt()) return;
    const bonus = earlyPayTickets(this.spinsLeft);
    this.panel.burnOutSpinLamps(this.spinsLeft);
    this.spinsLeft = 0;
    if (bonus > 0) {
      this.tickets += bonus;
      this.sfx.play('ticket');
      this.panel.flyTickets(bonus, CENTER_X, SPIN_LAMPS_Y); // прокрутки превратились в билет
    }
    this.endOfSpins(true);
    this.refreshHud();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): раунд закрыт, а когда фишки долетят до табло — расплата.
   * Флаг ранней оплаты помним: победа может задержать Коллектора, и после «ДАЛЬШЕ» он должен приехать тем же путём.
   */
  private endOfSpins(isPaidEarly = false): void {
    this.isPaidEarly = isPaidEarly;
    this.closeRound();
    this.time.delayedCall(COLLECT_DELAY, () => this.callCollector(isPaidEarly));
  }

  /**
   * Раунд кончился (прокрутки кончились или долг отдали раньше): ввод закрыт, кон забирается сам — до того, как гаснут эффекты.
   * Порядок важен: свеча и ×3 тратятся в payPot, иначе свеча сбрасывалась бы, не дойдя до «забрать» (и не анимировалась).
   * Потом гаснут чеснок, бусты, флаги, кровь, удача клевера и ржавчина.
   */
  protected closeRound(): void {
    this.isRoundOver = true;
    this.isBloodNext = false; // кровь не переходит в следующий раунд
    this.luckyClovers = 0; // и удача клевера
    this.clearRust(); // и ржавчина
    if (this.pot > 0) {
      if (pactEffects(this.pacts, this.round).bankSurvivesSkull) {
        // Сделка №10 «набранное в раунде не идёт в цель»: автозабор не отдаёт кон — он сгорает, цель не растёт.
        const lost = this.pot;
        this.pot = 0;
        this.effects.popup(`−${lost}`, RED_TEXT);
        this.sfx.play('burn', 0.15);
        this.payout.burn();
      } else {
        this.sfx.play('chips');
        this.payPot(true); // кон забирается сам: серия остаётся на следующий раунд
      }
    }
    clearRoundEffects(this.itemEffects); // чеснок, вишни и прочее действуют только до конца раунда
    this.showItemEffects();
    this.itemShelf.refreshPulses(); // раунд кончился — всё снято, предметы на полке снова годны, пульс пересчитываем
    this.refreshHud(); // бусты сняты — экранчик доли черепов не должен показывать число с чесноком от прошлого раунда
  }
}
