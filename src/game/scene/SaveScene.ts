import { tapePrice, type RunSave } from '../save';
import { ShopScene } from './ShopScene';

/**
 * Слой кассеты — один откат за забег. В магазине кассета продаётся за билеты, и с каждым закрытым долгом она дороже.
 * Купил — она ложится на видеомагнитофон у монитора, а когда уходишь из магазина, записывает забег: каким начнётся раунд.
 * Коллектор пришёл, а фишек не хватает, — кассета светится: вставь её (клик или 9) — плёнка перематывается,
 * сцена перезапускается с записью, и раунд из записи начинается заново. Запись живёт только в памяти: закрыл вкладку — забег заново.
 */
export abstract class SaveScene extends ShopScene {
  /** Магазин открылся (isAfterShot — после выстрела в автомат): у кассеты — её цена. */
  protected openShop(isAfterShot = false): void {
    super.openShop(isAfterShot);
    this.showTapePrice();
  }

  /** Ценники магазина и кассеты — по новому числу фишек и билетов. */
  protected refreshShop(): void {
    super.refreshShop();
    this.showTapePrice();
  }

  /** Цена кассеты (если её ещё продают); не хватает билетов — красная. */
  private showTapePrice(): void {
    if (this.tapeState !== 'forSale') return;
    const price = tapePrice(this.closedDebts());
    this.cassette.showPrice(price, price <= this.tickets);
  }

  /** Купить кассету (клик или 9): хватает билетов — она уезжает на видеомагнитофон, а запишет забег, когда уйдёшь из магазина. */
  protected buyTape(): void {
    if (!this.isShopping || this.tapeState !== 'forSale') return;
    const price = tapePrice(this.closedDebts());
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.cassette.deny();
      return;
    }
    this.tickets -= price;
    this.tapeState = 'bought';
    this.sfx.play('buy');
    this.tooltip.hide();
    this.cassette.sell();
    this.refreshHud();
    this.refreshShop();
  }

  /** Из магазина — к автомату. Кассету купили в этом магазине — она записывает забег: таким начнётся раунд. */
  protected leaveShop(): void {
    if (this.isShopping && this.tapeState === 'bought') this.recordTape();
    super.leaveShop();
  }

  /** Записать на кассету забег в начале следующего раунда (магазин уже позади): лампочка записи мигает. */
  private recordTape(): void {
    this.tapeRecord = {
      round: this.round,
      debt: this.debt,
      balance: this.balance,
      tickets: this.tickets,
      slots: this.slots,
      shelf: [...this.shelf],
      effects: { ...this.itemEffects },
      sockets: this.sockets,
      amulets: [...this.amulets],
      bones: this.bones,
      roulettes: this.roulettes,
      bulletsBought: this.bulletsBought,
      machine: this.machine,
      diceDrought: this.diceDrought,
    };
    this.tapeState = 'recorded';
    this.sfx.play('save');
    this.cassette.record();
  }

  /**
   * Вставить кассету (клик по ней или 9): можно, когда Коллектор пришёл, а фишек не хватает (canRewind).
   * Плёнка перематывается, вид гаснет — сцена перезапускается с записью (create её загрузит). Не сейчас — кассета трясётся.
   */
  protected insertTape(): void {
    const record = this.tapeRecord;
    if (this.tapeState !== 'recorded' || !record || this.isGameOver) return; // кассеты нет или забег кончился — вставлять нечего
    if (!this.canRewind()) {
      this.sfx.play('deny');
      this.cassette.denyInsert();
      return;
    }
    this.isChoosingDeal = false; // Коллектор больше ничего не предлагает: ни амулеты, ни рулетку
    this.isRewinding = true;
    this.tapeState = 'used';
    this.tapeRecord = null;
    this.tooltip.hide();
    this.refreshHud();
    this.sfx.play('rewind');
    this.cassette.rewind(() => this.scene.restart({ tape: record }));
  }

  /**
   * Сцена перезапустилась после отката: забег с кассеты. Зовётся до частей — они строятся по числу мест, гнёзд и долгу.
   * Кон, серия, прокрутки и фаза — как в начале любого раунда: их ставит startRound (фаза — по числу закрытых долгов;
   * забег уже в фазе 2 — снова новость «ФАЗА 2»). Кассета израсходована: её больше не продают.
   */
  protected loadTape(record: RunSave): void {
    this.round = record.round;
    this.debt = record.debt; // после выстрела в автомат он больше обычного
    this.balance = record.balance;
    this.tickets = record.tickets;
    this.slots = record.slots;
    this.shelf = [...record.shelf];
    this.itemEffects = { ...record.effects };
    this.sockets = record.sockets;
    this.amulets = [...record.amulets];
    this.bones = record.bones;
    this.roulettes = record.roulettes;
    this.bulletsBought = record.bulletsBought;
    this.machine = record.machine; // корпус его цвета и значок покажет MachineBadge — части строятся после
    this.diceDrought = record.diceDrought;
    this.tapeState = 'used';
    this.newsRound = record.round - 1; // новость этого раунда ещё не показывали
  }

  /** Части созданы: полка, амулеты и включённые предметы — как на кассете. Вид загорается, в углу «▶» — раунд начинается. */
  protected playTape(): void {
    this.itemShelf.setItems(this.shelf);
    this.amuletRack.setAmulets(this.amulets);
    this.showItemEffects();
    this.showBones();
    this.collector.markNote(this.debt, this.hasEnoughForDebt());
    this.cassette.showPlay();
    this.startRound();
  }
}
