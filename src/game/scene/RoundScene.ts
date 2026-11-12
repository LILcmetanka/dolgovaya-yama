import {
  amuletPatternWin,
  amuletsOnWin,
  amuletWeight,
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
import { freeSpinWeight } from '../bonus';
import { bloodBurn, BLOOD_WIN, cellsOf, diceWeight, spiderBite } from '../evil';
import {
  activeSlotEffects,
  boostWeight,
  CIGARETTE_SPINS,
  clearEffect,
  clearRoundEffects,
  EFFECT_SLOTS,
  GARLIC_SKULL_FACTOR,
  isItemOn,
  RISK_SKULL_FACTOR,
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
import { machineBonusSpins, machineSkullFactor, machineSymbolAllowed, machineWinFactor } from '../machines';
import { modeWeight, spinMode, winModeFactor, type SpinMode } from '../levers';
import { phaseWeight } from '../phases';
import { CENTER_X, cellX, cellY, DISPLAY, GRID_Y, PAYOUT_WINDOW, SPIN_LAMPS_Y } from '../layout';
import { evaluateGrid, lockedColumns, ticketCells, type SpinResult } from '../patterns';
import {
  GRID_ROWS,
  isSkull,
  JOKER,
  MAX_SPINS_PER_ROUND,
  randomSymbol,
  spinsAfterBonus,
  SPINS_PER_ROUND,
  streakAfterTake,
  symbolsUnlockedAt,
  TICKET_SCATTER,
  weightsForRound,
  type Grid,
  type SlotSymbol,
  type WeightOf,
} from '../rules';
import { effectPosition } from '../parts/itemShelf';
import { BLUE_TEXT, GOLD_TEXT, LAMP_BLUE, LAMP_GOLD, LAMP_GREEN, LAMP_RED, PURPLE_TEXT, RED_TEXT } from '../theme';
import { MachineScene } from './MachineScene';

const COLLECT_DELAY = 1300; // после последней прокрутки: пусть фишки долетят до табло, потом расплата, мс
const FREE_SPIN_PAUSE = 900; // бесплатные прокрутки идут сами: между ними — столько, чтобы разглядеть итог, мс
// Сколько бегущие огни горят другим цветом, мс.
const WIN_LAMPS_TIME = 900; // выигрыш — золотом
const SKULL_LAMPS_TIME = 700; // черепа — красным
const SHIELD_LAMPS_TIME = 700; // щит или бронежилет отбил черепа — синим
const NEW_ROUND_LAMPS_TIME = 1000; // новый раунд — зелёным
const DEBT_LAMPS_TIME = 1500; // фишек на табло стало хватать на долг — зелёным
const TICKET_BORDER = 0xf59e0b; // рамки на клетках с билетами, когда их три
const SPIDER_BORDER = 0xa855f7; // рамки на пауках, когда они съели часть кона
const REVEAL_NOTE_SPIN = 3; // после третьей прокрутки из тьмы проступает долг (первый забег)
const REROLL_WINDOW_TIME = 10_000; // сколько ждём выбора в окне перемешки и подмены, мс: прошло — сетка посчитана как есть

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
 * Выпал кубик — игра Дилера (слой DealerScene), прокрутки кончились — расплата (слой CollectorScene).
 * Короны, клевер и джекпот — слой BonusScene; бесплатные прокрутки за короны крутит этот слой (spinFree).
 * Автомат (классический, жадный, тихий) меняет веса символов и выплаты — его выбирают в магазине (machines.ts),
 * заржавевший столбец и смена автомата — слой MachineScene.
 */
export abstract class RoundScene extends MachineScene {
  /** Коллектор приходит за долгом — расплата; isPaidEarly — долг отдают раньше, банкомат сразу забирает. Её делает слой CollectorScene. */
  protected abstract callCollector(isPaidEarly: boolean): void;
  /** Выпал кубик — игра Дилера «больше или меньше»; кончилась — done(). Её делает слой DealerScene. */
  protected abstract startDealerGame(done: () => void): void;
  private spinsThisRun = 0; // сколько раз крутил за забег — на третьей прокрутке из тьмы проступает записка
  // Сетка, которая ждёт решения в окне перемешки и подмены (шаг 63б): итог ещё не посчитан. null — окно закрыто.
  private pendingReroll: { grid: Grid; weightOf: WeightOf; multiplier: number } | null = null;
  private rerollTimer?: Phaser.Time.TimerEvent; // через REROLL_WINDOW_TIME окно закроется само — пропуск
  // Режим текущей прокрутки, снимается в roll(); бесплатные прокрутки идут обычными.
  private spinModeNow: SpinMode = 'normal';

  /** Новый забег: прокруток ещё не было, окно перемешки не висит. */
  protected resetState(): void {
    super.resetState();
    this.spinsThisRun = 0;
    this.pendingReroll = null;
    this.rerollTimer = undefined;
    this.spinModeNow = 'normal';
  }

  // ---------- Прокрутка ----------

  /** Прокрутка (Пробел или рычаг): гаснет одна лампочка, столбцы встают. */
  protected spin(): void {
    if (!this.canAct()) return;
    this.spinsThisRun += 1;
    if (this.spinsThisRun === REVEAL_NOTE_SPIN) this.openRevealNote(); // записка впервые видна не с начала
    this.spinsLeft -= 1;
    this.panel.blinkSpinLamp(this.spinsLeft);
    this.roll(false);
  }

  /** Бесплатная прокрутка за короны: идёт сама, лампочки прокруток не гаснут — гаснет корона в их ряду. Она чистая: без черепов, кубика, пауков, замков и крови. */
  private spinFree(): void {
    this.freeSpins -= 1;
    this.roll(true);
  }

  /** Рычаг дёргается, столбцы мелькают и останавливаются слева направо. isFree — бесплатная прокрутка. */
  private roll(isFree: boolean): void {
    this.panel.pullLever();
    this.sfx.play('lever');
    this.sfx.play('roll', 0.1);
    this.isSpinning = true;
    this.spinModeNow = isFree ? 'normal' : spinMode(); // бесплатные прокрутки идут обычными
    const calm = this.spinModeNow === 'calm'; // спокойная: клевер и заевший столбец ждут обычной прокрутки
    const multiplier = this.multiplier(); // множитель запоминаем до прокрутки
    this.screen.clearHighlights();
    this.refreshHud();

    const base = weightsForRound(this.round, diceWeight(this.diceDrought)); // какие символы сейчас в автомате и с какими весами
    const weightOf = (symbol: SlotSymbol): number => this.symbolWeight(symbol, base, isFree);
    // Результат известен сразу (после клевера — с паттерном), анимация только показывает его.
    // В спокойной прокрутке ни черепов, ни кубика нет: старую сетку после клевера и ржавый столбец в неё не пускаем.
    const grid = this.rollGrid(weightOf, !calm, !calm);
    this.screen.spin(grid, weightOf, () => this.finishSpin(grid, weightOf, multiplier, isFree));
  }

  /**
   * Вес символа в этой прокрутке: обычный вес раунда, его меняют амулеты (огранка, череп в кармане), автомат,
   * бусты предметов (чеснок, вишни…), риск и фарт, режим прокрутки (шаг 70) и фаза. В бесплатной прокрутке нет черепов,
   * кубика, пауков, замков и крови.
   */
  private symbolWeight(symbol: SlotSymbol, base: WeightOf, isFree: boolean): number {
    // Автомат: у «Тихого» нет паука, замка, крови и клевера, у «Жадного» черепа тяжелее, ветка 3-го уровня — легче.
    if (!machineSymbolAllowed(this.machineState, symbol)) return 0;
    const skullFactor = isSkull(symbol) ? machineSkullFactor(this.machineState) : 1;
    const machined = amuletWeight(symbol, base(symbol), this.amuletIds()) * skullFactor;
    let weight = boostWeight(symbol, machined, this.itemEffects); // чеснок: череп легче, вишни: вишня тяжелее
    if (this.itemEffects.risk && isSkull(symbol)) weight *= RISK_SKULL_FACTOR; // риск: черепа втрое чаще
    if (this.itemEffects.luckSpin && isSkull(symbol)) weight = 0; // фарт: на этой прокрутке черепов нет
    weight = modeWeight(symbol, weight, this.spinModeNow); // режим: «риск» — черепа чаще, «спокойно» — без черепов и кубика
    const phased = phaseWeight(symbol, weight, this.phase);
    return isFree ? freeSpinWeight(symbol, phased) : phased;
  }

  /**
   * Сетка встала. Платная прокрутка с заряженной перемешкой или подменой — сначала окно выбора (openReroll), итог потом;
   * иначе итог сразу (evaluateSpin). Бесплатная прокрутка окна не открывает: заряженное ждёт платной.
   * Спокойная прокрутка окна тоже не открывает: в ней нет выплат, переделывать сетку незачем, заряд ждёт обычной.
   */
  private finishSpin(grid: Grid, weightOf: WeightOf, multiplier: number, isFree: boolean): void {
    this.isSpinning = false;
    if (!isFree && this.spinModeNow !== 'calm' && (this.itemEffects.shuffle || this.itemEffects.swap)) {
      this.openReroll(grid, weightOf, multiplier);
      return;
    }
    this.evaluateSpin(grid, multiplier);
  }

  /**
   * Итог прокрутки: паттерн из черепов — onSkulls, иначе серия растёт, выигрыш или копилка — на кон, пауки едят кон.
   * Кровь на экране — следующая прокрутка кровавая; короны, клевер и джекпот — collectBonuses. Выпал кубик — сначала игра Дилера, потом дальше.
   * Спокойная прокрутка (режим «спокойно»): серия растёт, выплат нет — ни выигрыша, ни копилки, ни билетов, ни корон,
   * а заряженные предметы (риск, молот, фарт) ждут обычной прокрутки. Черепов и кубика в ней нет по весам,
   * а кровь она не оставляет: следующая прокрутка не станет кровавой.
   * Единственный вход в подсчёт: и обычная прокрутка, и сетка после перемешки или подмены приходят сюда.
   */
  private evaluateSpin(grid: Grid, multiplier: number): void {
    const calm = this.spinModeNow === 'calm'; // спокойная прокрутка: серия растёт, выплат нет
    const result = evaluateGrid(grid, { ignoreLocks: this.itemEffects.hammer }); // молот: замки не блокируют
    const isBloody = this.isBloodNext; // кровь была в прошлой прокрутке — эта кровавая
    // В спокойной прокрутке кровь не оставляем: выплат в ней нет, и ×3 на следующую прокрутку пропало бы зря.
    if (!calm) this.isBloodNext = cellsOf(grid, 'blood').length > 0;
    if (!calm && result.tickets >= TICKET_SCATTER) this.collectTicketSymbols(grid);
    const locked = this.itemEffects.hammer ? [] : [...lockedColumns(grid)]; // при молоте столбцы не затемняются
    this.screen.dimColumns(locked); // замок заблокировал свои столбцы
    if (locked.length > 0) this.sfx.play('lock');
    if (this.isBloodNext && !calm) this.sfx.play('blood');
    // Спокойная прокрутка не может кончить кон черепами: веса черепа и кубика в ней нулевые.
    // Защита на случай сетки не из наших весов (старый заряд): черепа и Дилер в calm не запускаются.
    if (!calm && result.kind === 'skull') {
      this.onSkulls(result, isBloody);
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без паттерна из черепов, даже без выигрыша
      this.panel.pulseMultiplier(); // множитель в окошке вырос
      if (!calm) {
        if (result.kind === 'win') this.addToPot(result, multiplier, isBloody);
        else this.feedPiggy(multiplier);
        this.feedSpiders(grid);
      }
    }
    if (!calm) this.collectBonuses(grid, result);
    this.rustAfterSpin(grid); // ржавый автомат: столбец может заржаветь к следующей прокрутке
    if (!calm) {
      // Риск, молот и фарт действуют на одну прокрутку — она прошла, гаснут. В спокойной заряды ждут обычной прокрутки.
      this.itemEffects.risk = false;
      this.itemEffects.hammer = false;
      this.itemEffects.luckSpin = false;
    }
    // Перемешка и подмена здесь не гаснут: окно выбора их уже погасило (applyShuffle/applySwap), а пропуск
    // оставляет заряд на следующую платную прокрутку — до конца раунда его снимет clearRoundEffects.
    this.showItemEffects();
    this.refreshHud();
    if (!calm && cellsOf(grid, 'dice').length > 0) {
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
   * Платная прокрутка встала, а на полке заряжена перемешка или подмена: окно выбора на месте окошка выплаты.
   * Итог ждёт (pendingReroll), ввод заблокирован (isRerolling). Один предмет заряжен — режим выбирается сам:
   * спрашивать «какой предмет» незачем. Через REROLL_WINDOW_TIME окно закроется пропуском.
   */
  private openReroll(grid: Grid, weightOf: WeightOf, multiplier: number): void {
    this.pendingReroll = { grid, weightOf, multiplier };
    this.isRerolling = true;
    const armed: RerollId[] = [];
    if (this.itemEffects.shuffle) armed.push('shuffle');
    if (this.itemEffects.swap) armed.push('swap');
    this.rerollMenu.open(armed);
    if (armed.length === 1) this.chooseReroll(armed[0]);
    this.rerollTimer = this.time.delayedCall(REROLL_WINDOW_TIME, () => this.skipReroll());
    this.refreshHud();
  }

  /** Выбрали предмет в окне: теперь клик по сетке — столбец (перемешка) или клетка (подмена). */
  protected chooseReroll(id: RerollId): void {
    this.rerollMenu.ask(id);
    this.screen.beginPick(id === 'shuffle' ? 'column' : 'cell', (row, col) => {
      if (id === 'shuffle') this.applyShuffle(col);
      else this.applySwap(row, col);
    });
  }

  /**
   * Перемешка: столбец col перекручивается целиком новыми символами этой прокрутки, потом — итог по новой сетке.
   * Предмет тратится; защита от двойного клика — pendingReroll.
   */
  private applyShuffle(col: number): void {
    const pending = this.pendingReroll;
    if (!pending) return;
    for (let row = 0; row < GRID_ROWS; row++) pending.grid[row][col] = randomSymbol(pending.weightOf);
    this.itemEffects.shuffle = false;
    this.itemShelf.spend('shuffle', cellX(col), GRID_Y);
    this.isSpinning = true; // сетка перекручивается: приборы гаснут до итога
    this.closeReroll();
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
    this.isSpinning = true;
    this.closeReroll();
    this.screen.revealCell(row, col, JOKER, () => {
      this.isSpinning = false;
      this.evaluateSpin(pending.grid, pending.multiplier);
    });
  }

  /** Пропуск (✕, Пробел, Enter или время вышло): сетка считается как есть, предмет остаётся заряженным. */
  protected skipReroll(): void {
    const pending = this.pendingReroll;
    if (!pending) return;
    this.closeReroll();
    this.evaluateSpin(pending.grid, pending.multiplier);
  }

  /** Окно закрылось: таймер снят, выбор на сетке кончился, подсказка ✕ убрана, приборы снова по canAct(). */
  private closeReroll(): void {
    this.rerollTimer?.remove();
    this.rerollTimer = undefined;
    this.pendingReroll = null;
    this.isRerolling = false;
    this.tooltip.hide(); // подсказка ✕ не должна висеть, когда полосы уже нет
    this.screen.endPick();
    this.rerollMenu.close();
    this.showItemEffects();
    this.refreshHud();
  }

  /**
   * После итога (и игры Дилера, если она была): впереди бесплатные прокрутки — следующая сама, прокрутки кончились — конец раунда,
   * иначе спокойный момент — может начаться новая фаза.
   */
  private afterSpin(): void {
    if (this.freeSpins > 0) this.time.delayedCall(FREE_SPIN_PAUSE, () => this.spinFree());
    else if (this.spinsLeft === 0) this.endOfSpins();
    else this.checkPhase();
    this.refreshHud();
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

  /** Паттерн из черепов: первым его отбивает бронежилет, потом щит, иначе кон сгорает. Коллекционер костей их считает. */
  private onSkulls(result: SpinResult, isBloody: boolean): void {
    this.bones += 1;
    if (owns(this.amuletIds(), 'bones')) this.amuletRack.trigger('bones');
    this.showBones();
    if (this.roundShields > 0) {
      this.roundShields -= 1;
      this.amuletRack.trigger('vest');
      this.blockSkulls(result);
    } else if (this.itemEffects.shields > 0) {
      this.itemEffects.shields -= 1;
      this.itemShelf.spend('shield', CENTER_X, GRID_Y); // щит летит на сетку и тает
      this.blockSkulls(result);
    } else {
      this.burnPot(result);
      if (isBloody) this.burnBoard();
    }
  }

  /** Кровавая прокрутка с черепами: сгорает ещё и часть фишек на табло. */
  private burnBoard(): void {
    const burned = bloodBurn(this.balance);
    if (burned === 0) return;
    this.balance -= burned;
    this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `−${burned}`, RED_TEXT);
    this.panel.pulseBoard();
    this.markDebt();
  }

  /**
   * Черепа сжигают кон вместе с выигрышем этой прокрутки, серия обрывается. Страховка возвращает на табло
   * `INSURANCE_SHARE` сгоревшего — и сгорает сама: в раунде она спасает кон только раз (`insuranceUsed`).
   */
  private burnPot(result: SpinResult): void {
    const lost = this.pot;
    const refund = this.insuranceUsed ? 0 : insuranceRefund(lost, this.amuletIds());
    this.pot = 0;
    this.streak = 0;
    this.sfx.play('skulls');
    this.screen.highlightSkulls(result.hits);
    this.effects.flashAndShake();
    this.screen.flashLamps(LAMP_RED, SKULL_LAMPS_TIME);
    this.panel.flashMultiplierRed();
    if (refund > 0) {
      this.insuranceUsed = true; // страховка одноразовая: сработала — сгорела до следующего раунда
      this.amuletRack.trigger('insurance');
      this.balance += refund;
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
   * Колокольчик добавляет прокрутки (не выше потолка раунда).
   */
  private addToPot(result: SpinResult, multiplier: number, isBloody: boolean): void {
    const ids = this.amuletIds();
    const win = amuletPatternWin(result.hits, ids);
    const factor =
      winFactor(ids, this.bones) *
      (isBloody ? BLOOD_WIN : 1) * // кровавая прокрутка — ×3
      machineWinFactor(this.machineState) *
      (this.itemEffects.risk ? RISK_WIN_FACTOR : 1) * // риск: выигрыш ×10 (видно в подсказке как ×10)
      winModeFactor(this.spinModeNow); // режим «риск»: ×2, складывается с предметом 💀 ×10
    const gain = Math.round(win * multiplier * factor);
    this.pot += gain;
    // Колокольчик: прокрутки, но не выше потолка. Показываем, сколько добавилось на самом деле: у потолка бывает и 0.
    const extra = spinsAfterBonus(this.spinsLeft, bellSpins(result.hits, ids)) - this.spinsLeft;
    this.spinsLeft += extra;
    if (extra > 0) {
      this.effects.popupAt(CENTER_X, SPIN_LAMPS_Y - 20, `+${extra}`, GOLD_TEXT);
      this.panel.winkSpinLamps(this.spinsLeft);
    }
    for (const id of amuletsOnWin(result.hits, ids)) this.amuletRack.trigger(id);
    this.screen.highlightWin(result.hits);
    this.sfx.play(gain >= this.debt / 2 ? 'bigWin' : 'win'); // крупный выигрыш — громче и длиннее
    this.effects.popup(formatWin(win, multiplier, factor, gain), GOLD_TEXT);
    this.effects.burstFromGrid(gain);
    this.screen.flashLamps(LAMP_GOLD, WIN_LAMPS_TIME);
    this.payout.addWin(this.pot, this.debt);
  }

  /** Прокрутка без выигрыша: копилка кладёт на кон немного фишек (× множитель). */
  private feedPiggy(multiplier: number): void {
    const coins = piggyCoins(multiplier, this.amuletIds());
    if (coins === 0) return;
    this.pot += coins;
    this.sfx.play('coin');
    this.amuletRack.trigger('piggy');
    this.effects.popup(`+${coins}`, GOLD_TEXT);
    this.payout.addWin(this.pot, this.debt);
  }

  // ---------- Забрать ----------

  /** «Забрать»: кон уходит на табло. Бесплатно, но множитель уменьшается вдвое. */
  protected take(): void {
    if (!this.canAct() || this.pot === 0) return;
    this.payout.press();
    this.sfx.play('take');
    this.payPot();
    this.refreshHud();
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
    this.balance += amount;
    this.pot = 0;
    if (this.itemEffects.candle) {
      this.itemEffects.candle = false;
      this.itemShelf.spend('candle', PAYOUT_WINDOW.x, PAYOUT_WINDOW.y); // свеча сгорает: серия осталась
      this.showItemEffects();
    } else if (!isRoundEnd) {
      this.streak = streakAfterTake(this.streak); // не до ×1: на поздних раундах иначе долг не добить
      this.panel.dropMultiplier();
    }
    this.payout.takeAll(amount, () => {
      this.effects.burstFromBoard();
      this.panel.pulseBoard();
    });
    this.markDebt();
  }

  /**
   * Фишек на табло стало хватать на долг (или уже не хватает) — галочка на записке. Хватило впервые за раунд, а прокрутки ещё есть —
   * на стекле «НА ДОЛГ ХВАТАЕТ», огни мигают зелёным, оставшиеся лампочки подмигивают: дальше крутишь себе в плюс
   * или отдаёшь долг раньше (записка светится — refreshHud).
   */
  private markDebt(): void {
    if (this.isLastChance) return; // в последнем шансе раунд кончился: записку и новость не трогаем
    const isEnough = this.hasEnoughForDebt();
    this.collector.markNote(this.debt, isEnough);
    if (!isEnough || this.isDebtNewsShown || this.isRoundOver) return;
    this.isDebtNewsShown = true;
    this.screen.announceDebtCovered();
    this.screen.flashLamps(LAMP_GREEN, DEBT_LAMPS_TIME);
    this.panel.winkSpinLamps(this.spinsLeft);
    this.sfx.play('news', 0.3);
  }

  // ---------- Предметы ----------

  /** Включить предмет с места полки slot (клик по нему или клавиша). Только между прокрутками. */
  protected useItem(slot: number): void {
    const item = this.shelf[slot];
    if (!item) return;
    if (!this.canAct()) return;
    // Нельзя: такой предмет уже действует, риск с фартом несовместимы, а сигарета у потолка прокруток пропала бы впустую.
    if (isItemOn(item.id, this.itemEffects) || conflictsWith(item.id, this.itemEffects) || (item.id === 'cigarette' && this.spinsLeft >= MAX_SPINS_PER_ROUND)) {
      this.sfx.play('deny');
      this.itemShelf.deny(slot);
      return;
    }
    // Все места у экрана заняты: место освобождает сам игрок — кликом по включённому предмету, автозамены нет.
    if (takesEffectSlot(item.id) && activeSlotEffects(this.itemEffects).length >= EFFECT_SLOTS) {
      this.sfx.play('deny');
      this.itemShelf.deny(slot);
      this.tooltip.show(t('effectsFull'), '');
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
    this.refreshHud();
  }

  /**
   * Игрок кликнул по включённому предмету у экрана и освободил его место: предмет больше ничего не делает.
   * Значок к этому моменту уже погас (ItemShelf.fadeOut) — остаётся снять сам эффект и переставить столбик.
   * Не между прокрутками (крутится, Дилер, окно перемешки, последний шанс) — нельзя: значок вернётся на место.
   */
  protected discardEffect(id: SlotEffectId): void {
    if (!this.canAct()) {
      this.showItemEffects(); // значок возвращается: снимать было нельзя
      return;
    }
    clearEffect(id, this.itemEffects);
    this.sfx.play('item');
    this.showItemEffects();
    this.refreshHud();
  }

  /**
   * Что делает предмет. Сигарета — сразу; щит — в onSkulls, ×3 и свеча — в payPot, чеснок и бусты — в symbolWeight,
   * риск, молот и фарт — в symbolWeight и finishSpin (на одну прокрутку).
   */
  private activateItem(item: Item): void {
    switch (item.id) {
      case 'cigarette':
        this.spinsLeft = spinsAfterBonus(this.spinsLeft, CIGARETTE_SPINS);
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
        this.itemEffects.shuffle = true; // заряжена: окно откроется после следующей платной прокрутки
        break;
      case 'swap':
        this.itemEffects.swap = true;
        break;
    }
  }

  /** Включённые предметы у экрана и цвет огней вокруг экрана в покое (чеснок, кровь, фаза — calmLampColor). */
  protected showItemEffects(): void {
    this.itemShelf.showEffects(this.itemEffects);
    this.screen.setCalmColor(this.calmLampColor());
  }

  // ---------- Начало и конец раунда ----------

  /**
   * Новый раунд: прокрутки снова полные (лампочки загораются по очереди), огни бегут зелёным.
   * Амулеты: «Жадность» забирает прокрутки, «Бронежилет» снова готов.
   */
  protected startRound(): void {
    const ids = this.amuletIds();
    this.isRoundOver = false;
    this.isDebtNewsShown = this.hasEnoughForDebt(); // фишек хватает с начала раунда — новости нет, записка и так светится
    this.freeSpinsGiven = 0; // потолок бесплатных прокруток — на раунд
    clearRoundEffects(this.itemEffects); // бусты и флаги прошлого раунда не переходят в новый
    this.insuranceUsed = false; // страховка снова готова: одна на раунд
    this.isBloodNext = false; // кровь из последнего шанса не переходит в новый раунд
    this.showItemEffects(); // спокойные огни — по новому раунду (кровь погасла)
    this.spinsLeft = spinsPerRound(SPINS_PER_ROUND, ids) + machineBonusSpins(this.machineState); // +1 за ветку 3-го уровня
    this.roundShields = vestShields(ids);
    if (owns(ids, 'greed')) this.amuletRack.trigger('greed');
    this.announceNewSymbols();
    this.panel.popSpinLamps();
    this.screen.flashLamps(LAMP_GREEN, NEW_ROUND_LAMPS_TIME);
    this.sfx.play('roundStart');
    this.checkPhase(); // начало раунда — спокойный момент; после зелёных огней раунда, иначе они перекроют красную вспышку фазы
    this.refreshHud();
  }

  /** В автомат вошли новые символы — новость на экране, а на мониторе они появляются. Один раз за раунд: после последнего шанса номер раунда меньше, новости нет. */
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
   */
  private endOfSpins(isPaidEarly = false): void {
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
    this.isLuckyNext = false; // и удача клевера
    this.clearRust(); // и ржавчина
    if (this.pot > 0) {
      this.sfx.play('chips');
      this.payPot(true); // кон забирается сам: серия остаётся на следующий раунд
    }
    clearRoundEffects(this.itemEffects); // чеснок, вишни и прочее действуют только до конца раунда
    this.showItemEffects();
  }
}
