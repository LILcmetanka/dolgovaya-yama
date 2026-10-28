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
  startStreak,
  vestShields,
  winFactor,
} from '../amulets';
import { freeSpinWeight } from '../bonus';
import { characterWeight } from '../characters';
import { bloodBurn, BLOOD_WIN, cellsOf, diceWeight, spiderBite } from '../evil';
import { CIGARETTE_SPINS, garlicWeight, TRIPLE_TAKE_FACTOR, type Item } from '../items';
import { phaseWeight } from '../phases';
import { CENTER_X, cellX, cellY, DISPLAY, GRID_Y, PAYOUT_WINDOW, SPIN_LAMPS_Y } from '../layout';
import { evaluateGrid, lockedColumns, ticketCells, type SpinResult } from '../patterns';
import {
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

/** «+12», «+4 ×3 = +12» или с амулетами «+4 ×3 ×2 = +24». */
function formatWin(win: number, multiplier: number, factor: number, gain: number): string {
  const parts = [`+${win}`];
  if (multiplier > 1) parts.push(`×${multiplier}`);
  if (factor !== 1) parts.push(`×${Number(factor.toFixed(2))}`);
  return parts.length > 1 ? `${parts.join(' ')} = +${gain}` : `+${gain}`;
}

/**
 * Слой раунда: прокрутка → итог (выигрыш на кон, черепа его сжигают или их отбивает щит; злые символы: паук ест кон,
 * замок блокирует столбец, кровь делает следующую прокрутку кровавой) → «забрать» на табло,
 * предметы с полки и амулеты в гнёздах во время прокруток, начало и конец раунда.
 * Выпал кубик — игра Дилера (слой DealerScene), прокрутки кончились — расплата (слой CollectorScene),
 * патрон с полки — выстрел в автомат (слой ShotScene).
 * Короны, клевер и джекпот — слой BonusScene; бесплатные прокрутки за короны крутит этот слой (spinFree).
 * Характер автомата (Жадный, Фруктовый…) меняет веса символов и выплаты; заржавевший столбец — слой MachineScene.
 */
export abstract class RoundScene extends MachineScene {
  /** Вид поворачивается к Коллектору — расплата; isPaidEarly — долг отдают раньше, рука сразу забирает. Её делает слой CollectorScene. */
  protected abstract callCollector(isPaidEarly: boolean): void;
  /** Выпал кубик — игра Дилера «больше или меньше»; кончилась — done(). Её делает слой DealerScene. */
  protected abstract startDealerGame(done: () => void): void;
  /** Включили патрон с места полки slot — выстрел в автомат. Его делает слой ShotScene. */
  protected abstract shootMachine(slot: number): void;

  // ---------- Прокрутка ----------

  /** Прокрутка (Пробел или рычаг): гаснет одна лампочка, дальше — roll. */
  protected spin(): void {
    if (!this.canAct()) return;
    this.spinsLeft -= 1;
    this.panel.blinkSpinLamp(this.spinsLeft);
    this.roll(false);
  }

  /** Бесплатная прокрутка за короны: идёт сама, лампочки прокруток не гаснут — гаснет корона в их ряду. Черепов и кубика в ней нет. */
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
    const multiplier = this.multiplier(); // множитель запоминаем до прокрутки
    this.screen.clearHighlights();
    this.refreshHud();

    const base = weightsForRound(this.round, diceWeight(this.diceDrought)); // какие символы сейчас в автомате и с какими весами
    const weightOf = (symbol: SlotSymbol): number => this.symbolWeight(symbol, base, isFree);
    const grid = this.rollGrid(weightOf); // результат известен сразу (после клевера — с паттерном), анимация только показывает его
    this.screen.spin(grid, weightOf, () => this.finishSpin(grid, multiplier));
  }

  /**
   * Вес символа в этой прокрутке: обычный вес раунда, его меняют амулеты (огранка, череп в кармане), характер автомата,
   * чеснок и фаза. В бесплатной прокрутке черепов и кубика нет.
   */
  private symbolWeight(symbol: SlotSymbol, base: WeightOf, isFree: boolean): number {
    const machined = characterWeight(symbol, amuletWeight(symbol, base(symbol), this.amuletIds()), this.machine);
    const weight = garlicWeight(symbol, machined, this.itemEffects);
    const phased = phaseWeight(symbol, weight, this.phase);
    return isFree ? freeSpinWeight(symbol, phased) : phased;
  }

  /**
   * Итог прокрутки: паттерн из черепов — onSkulls, иначе серия растёт, выигрыш или копилка — на кон, пауки едят кон.
   * Кровь на экране — следующая прокрутка кровавая; короны, клевер и джекпот — collectBonuses. Выпал кубик — сначала игра Дилера, потом дальше.
   */
  private finishSpin(grid: Grid, multiplier: number): void {
    this.isSpinning = false;
    const result = evaluateGrid(grid);
    const isBloody = this.isBloodNext; // кровь была в прошлой прокрутке — эта кровавая
    this.isBloodNext = cellsOf(grid, 'blood').length > 0;
    if (result.tickets >= TICKET_SCATTER) this.collectTicketSymbols(grid);
    const locked = [...lockedColumns(grid)];
    this.screen.dimColumns(locked); // замок заблокировал свои столбцы
    if (locked.length > 0) this.sfx.play('lock');
    if (this.isBloodNext) this.sfx.play('blood');
    if (result.kind === 'skull') {
      this.onSkulls(result, isBloody);
    } else {
      this.streak += 1; // серия растёт с каждой прокруткой без паттерна из черепов, даже без выигрыша
      this.panel.pulseMultiplier(); // множитель в окошке вырос
      if (result.kind === 'win') this.addToPot(result, multiplier, isBloody);
      else this.feedPiggy(multiplier);
      this.feedSpiders(grid);
    }
    this.collectBonuses(grid, result);
    this.rustAfterSpin(grid); // ржавый автомат: столбец может заржаветь к следующей прокрутке
    this.showItemEffects();
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
    this.payout.addWin(this.pot, this.debt); // огоньки и сумма в окошке — по новому кону
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

  /** Черепа сжигают кон вместе с выигрышем этой прокрутки, серия обрывается. Со страховкой кон уходит на табло. */
  private burnPot(result: SpinResult): void {
    const lost = this.pot;
    const refund = insuranceRefund(lost, this.amuletIds());
    this.pot = 0;
    this.streak = 0;
    this.sfx.play('skulls');
    this.screen.highlightSkulls(result.hits);
    this.effects.flashAndShake();
    this.screen.flashLamps(LAMP_RED, SKULL_LAMPS_TIME);
    this.panel.flashMultiplierRed();
    if (refund > 0) {
      this.amuletRack.trigger('insurance'); // страховка: кон не сгорает, а уходит на табло
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
   * Выигрыш паттернов (с амулетами) × множитель серии × множитель амулетов и автомата идёт на кон. Колокольчик добавляет прокрутки.
   */
  private addToPot(result: SpinResult, multiplier: number, isBloody: boolean): void {
    const ids = this.amuletIds();
    const win = amuletPatternWin(result.hits, ids);
    const factor = winFactor(ids, this.bones) * (isBloody ? BLOOD_WIN : 1) * this.machine.winFactor; // кровавая прокрутка — ×3
    const gain = Math.round(win * multiplier * factor);
    this.pot += gain;
    this.spinsLeft += bellSpins(result.hits, ids);
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

  /** Кон переходит на табло (с включённым ×3 — втройне): фишки из окошка летят туда, серия уменьшается — окошко множителя сжимается. */
  private payPot(): void {
    let amount = this.pot;
    if (this.itemEffects.tripleTakes > 0) {
      this.itemEffects.tripleTakes -= 1;
      amount *= TRIPLE_TAKE_FACTOR;
      this.itemShelf.spend('triple', PAYOUT_WINDOW.x, PAYOUT_WINDOW.y); // ×3 влетает в окошко выплаты
      this.showItemEffects();
    }
    this.balance += amount;
    this.pot = 0;
    this.streak = streakAfterTake(this.streak); // не до ×1: на поздних раундах иначе долг не добить
    this.panel.dropMultiplier();
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
    if (!item || !this.canAct()) return;
    if (item.id === 'bullet') {
      this.shootMachine(slot); // патрон — не предмет у экрана, а выстрел в автомат
      return;
    }
    if (item.id === 'garlic' && this.itemEffects.isGarlicOn) {
      this.itemShelf.deny(slot); // чеснок уже действует — второй ничего не даст
      return;
    }
    this.tooltip.hide();
    this.shelf[slot] = null;
    this.sfx.play('item');
    this.activateItem(item);
    // Сигарета летит к лампочкам прокруток, остальные — на своё место у экрана.
    const target = item.id === 'cigarette' ? { x: CENTER_X, y: SPIN_LAMPS_Y } : effectPosition(item.id);
    this.itemShelf.takeItem(slot, target.x, target.y, () => this.showItemEffects());
    this.refreshHud();
  }

  /** Что делает предмет. Сигарета — сразу, остальные ждут своего момента: щит — в onSkulls, ×3 — в payPot, чеснок — в symbolWeight. */
  private activateItem(item: Item): void {
    switch (item.id) {
      case 'cigarette':
        this.spinsLeft += CIGARETTE_SPINS;
        break;
      case 'shield':
        this.itemEffects.shields += 1;
        break;
      case 'garlic':
        this.itemEffects.isGarlicOn = true;
        break;
      case 'triple':
        this.itemEffects.tripleTakes += 1;
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
   * Амулеты: «Жадность» забирает прокрутки, «Фальстарт» начинает с ×3, «Бронежилет» снова готов.
   */
  protected startRound(): void {
    const ids = this.amuletIds();
    this.isRoundOver = false;
    this.isDebtNewsShown = this.hasEnoughForDebt(); // фишек хватает с начала раунда — новости нет, записка и так светится
    this.streak = startStreak(ids);
    this.spinsLeft = spinsPerRound(SPINS_PER_ROUND, ids);
    this.roundShields = vestShields(ids);
    if (this.streak > 0) this.amuletRack.trigger('falseStart');
    if (owns(ids, 'greed')) this.amuletRack.trigger('greed');
    this.announceNewSymbols();
    this.panel.popSpinLamps();
    this.screen.flashLamps(LAMP_GREEN, NEW_ROUND_LAMPS_TIME);
    this.sfx.play('roundStart');
    this.checkPhase(); // начало раунда — спокойный момент; после зелёных огней раунда, иначе они перекроют красную вспышку фазы
    this.refreshHud();
  }

  /** В автомат вошли новые символы — новость на экране, а на мониторе они появляются. Один раз за раунд: после рулетки раунд тот же, новости нет. */
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
   * (лампочки гаснут, за EARLY_PAY_MIN_SPINS и больше из них вылетает билет), и сразу приходит Коллектор — рука сама забирает долг.
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

  /** Раунд кончился (прокрутки или выстрел в автомат): ввод закрыт, чеснок, кровь, удача и ржавчина гаснут, кон забирается сам. */
  protected closeRound(): void {
    this.isRoundOver = true;
    this.itemEffects.isGarlicOn = false; // чеснок действует только до конца раунда
    this.isBloodNext = false; // кровь тоже не переходит в следующий раунд
    this.isLuckyNext = false; // и удача клевера
    this.clearRust(); // и ржавчина
    this.showItemEffects();
    if (this.pot > 0) {
      this.sfx.play('chips');
      this.payPot();
    }
    this.streak = 0; // серия кончилась вместе с раундом — в окошке снова ×1
  }
}
