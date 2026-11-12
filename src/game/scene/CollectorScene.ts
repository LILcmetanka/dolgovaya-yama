import { interestCoins, TICKETS_PER_DEBT } from '../amulets';
import { GOOD_LUCK_TIME, isLastChanceWon, LAST_CHANCE_SPINS } from '../lastChance';
import { DISPLAY } from '../layout';
import { finishRun } from '../progress';
import { GREEN_TEXT, LAMP_OFF, LAMP_RED } from '../theme';
import { SaveScene } from './SaveScene';

// Порядок событий, мс.
const RESTART_SPACE_DELAY = 800; // Пробел на экране KABOOM перезапускает игру не раньше, чем через столько
const KABOOM_WARN_TIME = 1800; // KABOOM мигает на экране автомата, потом взрыв
const KABOOM_AFTER_TIME = 900; // после взрыва — пауза, потом всё темнеет
const KABOOM_SHAKE_TIME = 700;
const KABOOM_SHAKE = 0.03;
const LAST_CHANCE_TENSION = 1; // в последнем шансе сердце в музыке бьётся быстрее всего

/**
 * Слой Коллектора: в конце раунда вид поворачивается. Хватает фишек — из темноты выезжает банкомат, отдаёшь долг, получаешь купон
 * (билет), дальше магазин. Не хватает — на экране банкомата GOOD LUCK, и автомат сходит с ума: сам крутит LAST_CHANCE_SPINS прокруток,
 * кон копится, у игрока одна кнопка «забрать». Забрал не меньше доли нехватки (lastChance.ts) — выжил: выезжает чемодан с фишками,
 * долг оплачен, фишки целы, билета нет, а счёт откатывается на один долг назад. Не добрал — автомат говорит KABOOM и взрывается:
 * конец забега. Шанс один за забег (lastChanceUsed): вторая нехватка кончает забег на GOOD LUCK, без прокруток.
 */
export abstract class CollectorScene extends SaveScene {
  private isStoppingLastChance = false; // нажали «забрать»: новые прокрутки не начинаются, кон банкуется

  /** Новый забег: последний шанс не идёт. */
  protected resetState(): void {
    super.resetState();
    this.isStoppingLastChance = false;
  }

  /** В последнем шансе сердце в музыке бьётся быстрее всего. */
  protected tension(): number {
    return this.isLastChance ? LAST_CHANCE_TENSION : super.tension();
  }

  /**
   * Прокрутки кончились (или долг отдают раньше — isPaidEarly): Коллектор идёт за долгом.
   * Фишек не хватает — сначала тревога и красные огни на GOOD_LUCK_TIME, потом последний шанс.
   */
  protected callCollector(isPaidEarly: boolean): void {
    this.finishTutorial(); // Коллектор пришёл — тьма рассеивается совсем (и обучение запоминается)
    if (!this.hasEnoughForDebt()) {
      this.sfx.play('warning');
      this.screen.flashLamps(LAMP_RED, GOOD_LUCK_TIME);
    }
    this.reachOut(isPaidEarly);
  }

  /**
   * Выезжает банкомат. Хватает фишек — ждём «отдать» (а если долг отдают раньше — isPaidEarly — банкомат сразу забирает:
   * игрок уже решил); не хватает — на его экране GOOD LUCK, потом последний шанс. Если шанс в этом забеге уже был —
   * GOOD LUCK догорает и забег кончается: KABOOM (единственная дорога провала).
   */
  private reachOut(isPaidEarly: boolean): void {
    const enough = this.hasEnoughForDebt();
    this.sfx.play('hand'); // банкомат выезжает
    this.collector.reachOut(this.debt, enough, () => {
      if (!enough) {
        if (this.lastChanceUsed) this.kaboom();
        else this.startLastChance();
        return;
      }
      this.isAwaitingPayment = true; // теперь можно кликнуть по банкомату или нажать Enter
      if (isPaidEarly) this.payDebt();
    });
  }

  /**
   * Отдать долг: фишки уходят с табло в банкомат, остаток остаётся на табло (с «Процентами» растёт),
   * за долг — билеты: они летят из купона на табло. Банкомат уедет — магазин.
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

  // ---------- Последний шанс ----------

  /** Фишек не хватило: автомат крутит сам. Шанс один за забег — отмечаем. Кон с нуля, серия с ×1, впереди LAST_CHANCE_SPINS прокруток. */
  private startLastChance(): void {
    this.lastChanceUsed = true;
    this.isLastChance = true;
    this.isStoppingLastChance = false;
    this.pot = 0;
    this.streak = 0;
    this.spinsLeft = LAST_CHANCE_SPINS;
    this.refreshHud(); // окошко выплаты показывает «× 0 / порог», лампочки — сколько прокруток впереди
    this.nextLastChanceSpin();
  }

  /** Следующая прокрутка последнего шанса: гаснет лампочка, автомат крутит сам и сам решает, когда остановиться. */
  private nextLastChanceSpin(): void {
    if (this.isStoppingLastChance || this.spinsLeft <= 0) {
      this.endLastChance();
      return;
    }
    this.spinsLeft -= 1;
    this.lastChanceRoll(() => this.nextLastChanceSpin());
  }

  /** «Забрать» в последнем шансе: кон банкуется. Пока сетка крутится — ждём её остановки (endLastChance позовёт оценка). */
  protected stopLastChance(): void {
    if (!this.isLastChance || this.isStoppingLastChance) return;
    this.isStoppingLastChance = true;
    this.payout.press();
    this.sfx.play('take');
    if (!this.isSpinning) this.endLastChance();
  }

  /**
   * Последний шанс кончился — одной дорогой: забрали сами или прокрутки кончились. Собранное сравнивается с порогом
   * (доля нехватки): добрал — выжил, не добрал — конец забега.
   */
  private endLastChance(): void {
    const collected = this.pot;
    const won = isLastChanceWon(collected, this.debt, this.balance);
    this.pot = 0;
    this.streak = 0;
    this.isLastChance = false;
    this.isStoppingLastChance = false;
    this.refreshHud();
    if (!won) {
      this.kaboom();
      return;
    }
    this.sfx.play('payment');
    this.collector.clearGoodLuck();
    this.chipCase.open(() => {
      this.round = Math.max(0, this.round - 2); // магазин прибавит единицу: раунд N − 1, а не N + 1
      this.openShop();
    });
  }

  // ---------- Конец забега ----------

  /** Конец забега: на экране автомата KABOOM, потом автомат взрывается, всё темнеет, и на нём — KABOOM, счёт, «ЗАНОВО». */
  private kaboom(): void {
    finishRun(); // один забег — одна смерть: счётчик забегов растёт (progress.ts)
    this.isGameOver = true;
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
        this.collector.clearGoodLuck(); // KABOOM погас: под экраном DEATH не должно остаться старого мигающего заголовка
        this.collector.blackout(() => {
          this.collector.showDeath(this.closedDebts(), this.record, () => this.restartGame(), 'KABOOM');
          this.time.delayedCall(RESTART_SPACE_DELAY, () => {
            this.canRestartWithSpace = true;
          });
        });
      });
    });
  }
}
