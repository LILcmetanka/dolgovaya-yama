import { amuletPrice, interestCoins, TICKETS_PER_DEBT, type Amulet } from '../amulets';
import {
  canTradeAmulet,
  collectorTarget,
  loadCylinder,
  nextBullet,
  randomLiveCount,
  ROULETTES_PER_RUN,
  shooterAfterBlank,
  type Bullet,
  type Side,
} from '../collectorGame';
import { DISPLAY, MAGNIFIER_SPOT } from '../layout';
import { GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
import { SaveScene } from './SaveScene';

// Порядок событий, мс.
const GOOD_LUCK_TIME = 1600; // фишек не хватает: столько горит GOOD LUCK на экране автомата, потом вид поворачивается к Коллектору
const HAND_WAIT_TIME = 1200; // фишек не хватает: рука ждёт столько, потом на столе появляется игра
const DEAL_PAUSE = 1400; // откупиться нечем — рулетка начинается сама через столько: успеть разглядеть патроны
const COLLECTOR_THINK_TIME = 700; // ход Коллектора: пауза, прежде чем он возьмёт дробовик
const RESTART_SPACE_DELAY = 800; // Пробел на экране DEATH перезапускает игру не раньше, чем через столько
const HAND_SOUND_DELAY = 0.6; // рука выдвигается, когда вид повернулся, с
const KABOOM_WARN_TIME = 1800; // KABOOM мигает на экране автомата, потом взрыв
const KABOOM_AFTER_TIME = 900; // после взрыва — пауза, потом всё темнеет
const KABOOM_SHAKE_TIME = 700;
const KABOOM_SHAKE = 0.03;
const ROULETTE_TENSION = 1; // во время рулетки сердце в музыке бьётся быстрее всего

/**
 * Слой Коллектора: в конце раунда вид поворачивается. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг, получаешь купон
 * (билет), дальше магазин. Не хватает — на экране автомата GOOD LUCK, потом тёмная комната с Коллектором в тени и дробовиком:
 * откупиться амулетом или рулетка — один раз за забег; есть кассета — можно вставить её и откатиться (слой SaveScene).
 * Выжил в рулетке — выезжает чемодан с фишками, долг оплачен, а счёт откатывается на один долг назад.
 * Боевой в тебя — DEATH. Не хватило снова, а откупиться нечем и кассеты нет, — автомат говорит KABOOM и взрывается: конец забега.
 */
export abstract class CollectorScene extends SaveScene {
  private cylinder: Bullet[] = []; // патроны в барабане по порядку выстрелов; пусто — рулетка не идёт
  private liveRounds = 0; // сколько боевых зарядит Коллектор — их видно на столе ещё до игры
  private hasPeeked = false; // в этот ход уже посмотрел в лупу

  /** Новый забег: рулетка не идёт. */
  protected resetState(): void {
    super.resetState();
    this.cylinder = [];
    this.liveRounds = 0;
    this.hasPeeked = false;
  }

  /** Во время рулетки сердце в музыке бьётся быстрее всего. */
  protected tension(): number {
    return this.cylinder.length > 0 ? ROULETTE_TENSION : super.tension();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): Коллектор идёт за долгом.
   * Фишек не хватает, а игра с ним ещё есть, — сначала на экране автомата загорается GOOD LUCK.
   */
  protected callCollector(isPaidEarly: boolean): void {
    if (this.hasEnoughForDebt()) {
      this.reachOut(isPaidEarly);
      return;
    }
    if (!this.canDeal()) {
      this.kaboom(); // не хватило, а выхода нет: автомат взрывается
      return;
    }
    this.sfx.play('warning');
    this.screen.flashLamps(LAMP_RED, GOOD_LUCK_TIME);
    this.collector.warnGoodLuck();
    this.time.delayedCall(GOOD_LUCK_TIME, () => this.reachOut(false));
  }

  /**
   * Вид поворачивается, тянется рука. Хватает фишек — ждём «отдать» (а если долг отдают раньше — isPaidEarly — рука сразу забирает:
   * игрок уже решил), не хватает — рука ждёт, потом игра с Коллектором.
   */
  private reachOut(isPaidEarly: boolean): void {
    const enough = this.hasEnoughForDebt();
    this.sfx.play('turn');
    this.sfx.play('hand', HAND_SOUND_DELAY);
    this.collector.reachOut(this.debt, enough, () => {
      if (!enough) {
        this.time.delayedCall(HAND_WAIT_TIME, () => this.offerDeal());
        return;
      }
      this.isAwaitingPayment = true; // теперь можно кликнуть по руке или нажать Enter
      if (isPaidEarly) this.payDebt();
    });
  }

  /**
   * Отдать долг: фишки уходят с табло в ладонь, остаток остаётся на табло (с «Процентами» растёт),
   * за долг — билеты: они летят из ладони на табло. Рука уйдёт — магазин.
   */
  protected payDebt(): void {
    if (!this.isAwaitingPayment) return;
    this.isAwaitingPayment = false;
    this.balance -= this.debt;
    const interest = interestCoins(this.balance, this.amuletIds());
    if (interest > 0) {
      this.balance += interest;
      this.amuletRack.trigger('interest');
      this.effects.popupAt(DISPLAY.x, DISPLAY.y + 50, `+${interest}`, GREEN_TEXT); // проценты капают на табло
    }
    this.tickets += TICKETS_PER_DEBT;
    this.refreshHud();
    this.sfx.play('payment');
    this.collector.takePayment(
      (x, y) => this.panel.flyTickets(TICKETS_PER_DEBT, x, y),
      () => this.openShop(),
    );
  }

  // ---------- Игра с Коллектором ----------

  /** Рулетку в этом забеге ещё не играли. */
  private canPlayRoulette(): boolean {
    return this.roulettes < ROULETTES_PER_RUN;
  }

  /** Есть чем откупиться: хоть одного амулета хватит на долг. */
  private canBuyOff(): boolean {
    return this.amulets.some((amulet) => this.canGive(amulet));
  }

  /** Есть ли кассета с записью: её можно вставить вместо игры с Коллектором. */
  private hasTape(): boolean {
    return this.tapeState === 'recorded';
  }

  /** Есть ли игра с Коллектором: рулетка ещё не сыграна, есть чем откупиться или есть кассета. Нет — конец забега. */
  private canDeal(): boolean {
    return this.canPlayRoulette() || this.canBuyOff() || this.hasTape();
  }

  /**
   * Фишек не хватило: на столе — патроны и дробовик (если рулетку ещё не играли), в лотке — копии твоих амулетов,
   * кассета на видеомагнитофоне светится. Отдай амулет, сыграй или вставь кассету; откупиться нечем и кассеты нет —
   * рулетка начинается сама. Нет ничего — DEATH.
   */
  private offerDeal(): void {
    if (!this.canDeal()) {
      this.kaboom();
      return;
    }
    const canPlay = this.canPlayRoulette();
    if (canPlay) this.liveRounds = randomLiveCount();
    this.shotgunTable.show(canPlay ? this.liveRounds : null, this.amulets, this.amulets.map((amulet) => this.canGive(amulet)));
    this.isChoosingDeal = true;
    this.refreshHud(); // кассета на видеомагнитофоне светится, если она есть
    if (canPlay && !this.canBuyOff() && !this.hasTape()) this.time.delayedCall(DEAL_PAUSE, () => this.playRoulette()); // выбора нет — сразу рулетка
  }

  /** Хватит ли амулета вместе с фишками на табло, чтобы Коллектор закрыл долг. */
  private canGive(amulet: Amulet): boolean {
    return canTradeAmulet(amuletPrice(amulet), this.balance, this.debt);
  }

  /**
   * Отдать амулет index: он летит в ладонь, за ним — все фишки с табло, Коллектор уходит.
   * Долг закрыт — без билетов, дальше магазин. Амулета не хватает на долг — он трясётся.
   */
  protected giveAmulet(index: number): void {
    const amulet = this.amulets[index];
    if (!this.isChoosingDeal || !amulet) return;
    if (!this.canGive(amulet)) {
      this.sfx.play('deny');
      this.shotgunTable.denyAmulet(index);
      return;
    }
    this.sfx.play('payment');
    this.isChoosingDeal = false;
    this.amulets.splice(index, 1);
    this.amuletRack.setAmulets(this.amulets); // остальные амулеты сдвигаются к табло
    this.showBones();
    const hadChips = this.balance > 0;
    this.balance = 0;
    this.refreshHud();
    this.collector.clearGoodLuck(); // откупился — экран автомата снова горит
    this.collector.stretchHand(); // из темноты выходит рука — принять амулет
    const palm = this.collector.palmPosition();
    this.shotgunTable.giveAmulet(index, palm.x, palm.y, () => {
      if (hadChips) this.collector.takePayment(() => {}, () => this.openShop());
      else this.collector.goAway(() => this.openShop());
    });
  }

  // ---------- Рулетка ----------

  /** Сыграть (клик по дробовику, Пробел или Enter): Коллектор заряжает барабан и крутит его, ты стреляешь первым. Один раз за забег. */
  protected playRoulette(): void {
    if (!this.isChoosingDeal || !this.canPlayRoulette()) return;
    this.isChoosingDeal = false;
    this.roulettes += 1;
    this.cylinder = loadCylinder(this.liveRounds);
    this.refreshHud(); // сердце бьётся чаще
    this.shotgunTable.spin(() => this.playerTurn());
  }

  /** Твой ход: кнопки-цели — в Коллектора (↑) или в себя (↓); есть лупа — она на столе, можно посмотреть следующий патрон. */
  private playerTurn(): void {
    this.isAiming = true;
    this.hasPeeked = false;
    this.shotgunTable.showAim(true);
    this.shotgunTable.showMagnifier(this.magnifierSlot() >= 0);
  }

  /** Место первой лупы на полке; лупы нет — −1. */
  protected magnifierSlot(): number {
    return this.shelf.findIndex((item) => item?.id === 'magnifier');
  }

  /**
   * Лупа с места полки slot (клик по ней на столе или её клавиша): в твой ход рулетки показывает следующий патрон,
   * лупа тратится (летит с полки на стол). Не твой ход или уже посмотрел — лупа на полке трясётся.
   */
  protected useMagnifier(slot: number): void {
    if (slot < 0) return;
    if (!this.isAiming || this.hasPeeked) {
      this.sfx.play('deny');
      this.itemShelf.deny(slot);
      return;
    }
    this.hasPeeked = true;
    this.shelf[slot] = null;
    this.sfx.play('item');
    this.tooltip.hide();
    this.itemShelf.takeItem(slot, MAGNIFIER_SPOT.x, MAGNIFIER_SPOT.y, () => {});
    this.shotgunTable.reveal(nextBullet(this.cylinder));
  }

  /** Ты стреляешь в target: кнопка-цель, ↑ или ↓. */
  protected shoot(target: Side): void {
    if (!this.isAiming) return;
    this.isAiming = false;
    this.fire('player', target);
  }

  /** shooter стреляет в target следующим патроном из барабана. Коллектор сначала берёт дробовик в кулак. */
  private fire(shooter: Side, target: Side): void {
    const bullet = this.cylinder.shift() ?? 'live'; // боевой в барабане есть всегда: до пустого барабана не дойдёт
    if (shooter === 'collector') this.collector.grip(true);
    this.shotgunTable.shoot(shooter, target, bullet, this.collector.palmPosition(), () => this.afterShot(target, bullet));
  }

  /**
   * После выстрела. Боевой: в тебя — DEATH, в Коллектора — ты выжил. Холостой: стреляет тот, в кого стреляли, —
   * ты (стрелял в себя) снова ходишь сам, Коллектор решает, в кого стрелять (collectorTarget).
   */
  private afterShot(target: Side, bullet: Bullet): void {
    if (bullet === 'live') {
      if (target === 'player') this.death();
      else this.surviveRoulette();
      return;
    }
    this.collector.grip(false);
    if (shooterAfterBlank(target) === 'player') this.playerTurn();
    else this.time.delayedCall(COLLECTOR_THINK_TIME, () => this.fire('collector', collectorTarget(this.cylinder)));
  }

  /**
   * Ты выжил: Коллектор ранен — глаза гаснут, вид возвращается к автомату. Выезжает чемодан с фишками: они летят на записку,
   * долг оплачен (твои фишки на табло целы, билета нет), а счёт откатывается на один долг назад: следующий раунд — на номер меньше
   * (первый остаётся первым). Дальше магазин.
   */
  private surviveRoulette(): void {
    this.cylinder = [];
    this.shotgunTable.hide();
    this.collector.clearGoodLuck();
    this.refreshHud();
    this.collector.recoil(() => {
      this.sfx.play('payment');
      this.chipCase.open(() => {
        this.round = Math.max(0, this.round - 2); // магазин прибавит единицу: раунд N − 1, а не N + 1
        this.openShop();
      });
    });
  }

  /** Конец забега без выстрела: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  private kaboom(): void {
    this.isGameOver = true;
    this.cylinder = [];
    this.refreshHud();
    this.sfx.play('warning');
    this.screen.flashLamps(LAMP_RED, KABOOM_WARN_TIME);
    this.collector.warnGoodLuck('KABOOM');
    this.time.delayedCall(KABOOM_WARN_TIME, () => {
      this.sfx.play('shatter');
      this.sfx.play('death');
      this.collector.explode();
      this.cameras.main.shake(KABOOM_SHAKE_TIME, KABOOM_SHAKE);
      this.brokenScreen.shatter();
      this.screen.setCalmColor(LAMP_OFF);
      this.time.delayedCall(KABOOM_AFTER_TIME, () => {
        this.collector.clearGoodLuck();
        this.collector.blackout(() => {
          this.collector.showDeath(this.closedDebts(), this.record, () => this.restartGame(), 'KABOOM');
          this.time.delayedCall(RESTART_SPACE_DELAY, () => {
            this.canRestartWithSpace = true;
          });
        });
      });
    });
  }

  /** Конец забега: экран гаснет, а когда загорается — на автомате DEATH, счёт и «ЗАНОВО». */
  private death(): void {
    this.isGameOver = true;
    this.cylinder = [];
    this.refreshHud();
    this.sfx.play('death');
    this.collector.blackout(() => {
      this.shotgunTable.hide();
      this.collector.showDeath(this.closedDebts(), this.record, () => this.restartGame());
      this.time.delayedCall(RESTART_SPACE_DELAY, () => {
        this.canRestartWithSpace = true;
      });
    });
  }
}
