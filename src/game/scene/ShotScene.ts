import { t } from '../lang';
import { HOME_SCROLL, NOTE, REVOLVER, SHOT_HOLE, TURN_SCROLL, VIEW_WIDTH } from '../layout';
import { BULLET, bulletPrice, canShoot, SHOT_DEBT_TEXT } from '../shot';
import { LAMP_OFF, RED_TEXT } from '../theme';
import { CollectorScene } from './CollectorScene';

// Порядок событий, мс.
const SHOT_TURN_DELAY = 1100; // патрон включили: пусть кон долетит до табло, потом вид поворачивается к Коллектору
const DEMAND_TIME = 400; // рука протянута за долгом — столько видно «фишка × долг», потом на столе револьвер
const AFTER_HIT_TIME = 700; // пуля в экране — пауза: разглядеть дыру
const ANGER_TIME = 600; // Коллектор сжимает кулак — он это запомнит — и уходит
const DEBT_TEXT_DELAY = 300; // «×1,5» всплывает, когда вид уже поворачивается к магазину
const HAND_SOUND_DELAY = 0.6; // рука выдвигается, когда вид повернулся, с
// Где что.
const BULLET_EXIT = { x: HOME_SCROLL + VIEW_WIDTH + 30, y: 330 }; // патрон улетает с полки за правый край вида — к Коллектору
const BULLET_ENTRY = { x: TURN_SCROLL - 30, y: REVOLVER.y - 80 }; // у Коллектора он влетает в револьвер из-за левого края вида
const DEBT_TEXT_Y = NOTE.y + NOTE.height / 2 + 75; // «×1,5» всплывает под запиской и не залезает на сумму долга
const ANGER_SHAKE = 0.006; // Коллектор в ярости: вид дрожит

/**
 * Слой выстрела в автомат — аварийный выход. В магазине на стене патрон за билеты (каждый следующий дороже), он ложится на полку.
 * Понял, что долг не добить, — между прокрутками включи патрон: раунд кончается, вид поворачивается к Коллектору, патрон уходит
 * в его револьвер, ствол — на автомат, выстрел: экран разбит. Долг пропущен — раунд пройден (как откуп амулетом, без билета),
 * фишки остаются, а Коллектор запоминает: следующий долг ×1,5. Дальше магазин; вернулся — пришёл другой автомат,
 * со своим характером (MachineScene).
 */
export abstract class ShotScene extends CollectorScene {
  /** Магазин открылся (isAfterShot — после выстрела): у патрона — его цена. */
  protected openShop(isAfterShot = false): void {
    super.openShop(isAfterShot);
    this.showBulletPrice();
  }

  /** Ценники магазина и патрона — по новому числу фишек и билетов. */
  protected refreshShop(): void {
    super.refreshShop();
    this.showBulletPrice();
  }

  /** Цена патрона; не хватает билетов — красная. */
  private showBulletPrice(): void {
    const price = bulletPrice(this.bulletsBought);
    this.bulletStand.showPrice(price, price <= this.tickets);
  }

  /** Купить патрон (клик или «-»): билеты уходят с табло, патрон ложится на свободное место полки. Нет места — полка трясётся. */
  protected buyBullet(): void {
    if (!this.isShopping) return;
    const price = bulletPrice(this.bulletsBought);
    const slot = this.shelf.indexOf(null);
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.bulletStand.deny(); // не хватает билетов — ценник трясётся
      return;
    }
    if (slot < 0) {
      this.sfx.play('deny');
      this.itemShelf.shakeFull(); // на полке нет места
      return;
    }
    this.tickets -= price;
    this.bulletsBought += 1;
    this.shelf[slot] = BULLET;
    this.sfx.play('buy');
    this.tooltip.hide();
    this.bulletStand.sell((x, y) => this.itemShelf.putItem(slot, BULLET, x, y));
    this.refreshHud();
    this.refreshShop();
  }

  // ---------- Выстрел ----------

  /**
   * Включили патрон с места полки slot (между прокрутками — это проверил RoundScene.useItem). Фишек на табло вместе с коном
   * хватает на долг — патрон трясётся: стрелять незачем. Иначе раунд кончается: оставшиеся прокрутки гаснут, кон забирается сам,
   * патрон улетает к Коллектору, и вид поворачивается к нему.
   */
  protected shootMachine(slot: number): void {
    if (!canShoot(this.balance, this.pot, this.debt)) {
      this.sfx.play('deny');
      this.itemShelf.deny(slot);
      return;
    }
    this.tooltip.hide();
    this.shelf[slot] = null;
    this.sfx.play('item');
    this.itemShelf.takeItem(slot, BULLET_EXIT.x, BULLET_EXIT.y, () => {});
    this.panel.burnOutSpinLamps(this.spinsLeft); // оставшиеся прокрутки пропадают
    this.spinsLeft = 0;
    this.closeRound();
    this.refreshHud();
    this.time.delayedCall(SHOT_TURN_DELAY, () => this.aimAtMachine());
  }

  /** Рука Коллектора тянется за долгом — а на столе его револьвер: твой патрон влетает в него, ствол — на автомат, выстрел. */
  private aimAtMachine(): void {
    this.sfx.play('turn');
    this.sfx.play('hand', HAND_SOUND_DELAY);
    this.collector.reachOut(this.debt, false, () => {
      this.time.delayedCall(DEMAND_TIME, () => {
        this.collector.hideDemand();
        this.revolverTable.showRevolver();
        this.revolverTable.loadBullet(BULLET_ENTRY.x, BULLET_ENTRY.y, () =>
          this.revolverTable.shootMachine(SHOT_HOLE.x, SHOT_HOLE.y, () => this.hitMachine()),
        );
      });
    });
  }

  /** Пуля в экране: дыра, трещины, искры, экран и огни вокруг него гаснут. Коллектор сжимает кулак — он это запомнит — и уходит. */
  private hitMachine(): void {
    this.sfx.play('shatter');
    this.brokenScreen.shatter();
    this.screen.setCalmColor(LAMP_OFF);
    this.time.delayedCall(AFTER_HIT_TIME, () => {
      this.collector.grip(true);
      this.cameras.main.shake(ANGER_TIME, ANGER_SHAKE);
      this.sfx.play('blood'); // глухой удар: Коллектор в ярости
      this.time.delayedCall(ANGER_TIME, () => {
        this.revolverTable.hide();
        this.collector.goAway(() => this.openShopAfterShot());
      });
    });
  }

  /**
   * Долг пропущен — раунд пройден, билета нет. Пока ты в магазине, привозят другой автомат (changeMachine).
   * Магазин; следующий долг больше — под запиской всплывает «×1,5».
   */
  private openShopAfterShot(): void {
    this.changeMachine();
    this.openShop(true);
    this.time.delayedCall(DEBT_TEXT_DELAY, () => this.effects.popupAt(NOTE.x, DEBT_TEXT_Y, t(SHOT_DEBT_TEXT), RED_TEXT));
  }

  /**
   * Новый раунд. Автомат был разбит — пришёл другой: экран загорается, огни вокруг него снова горят,
   * корпус — цвета нового автомата, на стекле его значок и название.
   */
  protected startRound(): void {
    if (this.brokenScreen.isBroken()) {
      this.brokenScreen.repair();
      this.showItemEffects(); // огни вокруг экрана — снова своего цвета
      this.showNewMachine();
    }
    super.startRound();
  }
}
