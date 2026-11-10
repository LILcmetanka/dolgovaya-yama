import { tapePrice, type RunSave } from '../save';
import { hasCassette } from '../progress';
import { ShopScene } from './ShopScene';

/**
 * Слой кассеты (шаг 45). В магазине кассета продаётся за билеты: 2, 3, 4… по купленным за забег.
 * Купил — она ложится в отделение REC видеомагнитофона. Нажми на неё между прокрутками — она запишет забег как есть
 * (посреди раунда тоже) и переедет в отделение PLAY; переписать нельзя. Нажми на записанную между прокрутками
 * или у Коллектора (не в рулетке) — плёнка перематывается, сцена перезапускается с записью, а автомат съедает кассету:
 * в магазине можно купить новую. Запись живёт только в памяти: закрыл вкладку — забег заново.
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

  /** Цена кассеты (если её сейчас продают); не хватает билетов — красная. */
  private showTapePrice(): void {
    if (this.tapeState !== 'forSale') return;
    const price = tapePrice(this.tapesBought);
    this.cassette.showPrice(price, price <= this.tickets);
  }

  /** Купить кассету (клик или 9): хватает билетов — она уезжает на видеомагнитофон, в отделение REC. Одна за раз. */
  protected buyTape(): void {
    if (!hasCassette()) return;
    if (!this.isShopping || this.tapeState !== 'forSale') return;
    const price = tapePrice(this.tapesBought);
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.cassette.deny();
      return;
    }
    this.tickets -= price;
    this.tapesBought += 1;
    this.tapeState = 'blank';
    this.sfx.play('buy');
    this.tooltip.hide();
    this.cassette.sell();
    this.refreshHud();
    this.refreshShop();
  }

  /** Клик по кассете на видеомагнитофоне или 9 вне магазина: чистая — записать, записанная — откатиться. */
  protected useTape(): void {
    if (this.isGameOver) return;
    if (this.tapeState === 'blank') this.recordTape();
    else if (this.tapeState === 'recorded') this.insertTape();
  }

  /**
   * Записать забег как есть (REC): раунд, прокрутки, кон, серию, фишки, билеты, предметы, амулеты, автомат, рулетку.
   * Только между прокрутками у автомата; не сейчас — кассета трясётся. Переписать нельзя: запись одна, пока кассету не съест автомат.
   * Заморозка столбца и прошлая сетка в снимок не попадают: после отката первая прокрутка начинается без них.
   */
  private recordTape(): void {
    if (!this.canRecord()) {
      this.sfx.play('deny');
      this.cassette.denyUse();
      return;
    }
    this.tapeRecord = {
      round: this.round,
      spinsLeft: this.spinsLeft,
      pot: this.pot,
      streak: this.streak,
      isBloodNext: this.isBloodNext,
      isLuckyNext: this.isLuckyNext,
      roundShields: this.roundShields,
      isDebtNewsShown: this.isDebtNewsShown,
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
    this.tooltip.hide();
    this.sfx.play('save');
    this.cassette.record();
    this.refreshHud();
  }

  /**
   * Откатиться (PLAY): можно между прокрутками и у Коллектора, когда он ждёт (canRewind), в рулетке — нельзя.
   * Плёнка перематывается, автомат съедает кассету, вид гаснет — сцена перезапускается с записью (create её загрузит).
   * Не сейчас — кассета трясётся.
   */
  private insertTape(): void {
    const record = this.tapeRecord;
    if (!record || !this.canRewind()) {
      this.sfx.play('deny');
      this.cassette.denyUse();
      return;
    }
    this.isChoosingDeal = false; // Коллектор больше ничего не предлагает: ни амулеты, ни рулетку
    this.isRewinding = true;
    this.tapeRecord = null;
    this.tooltip.hide();
    this.refreshHud();
    this.sfx.play('rewind');
    const tapesBought = this.tapesBought; // купленные кассеты откат не откатывает — иначе цена вернулась бы
    this.cassette.rewind(() => this.scene.restart({ tape: record, tapesBought }));
  }

  /**
   * Сцена перезапустилась после отката: забег с кассеты. Зовётся до частей — они строятся по числу мест, гнёзд и долгу.
   * Прокрутки, кон, серия, кровь, клевер, щит бронежилета — как на записи (раунд идёт с того же места).
   * Ржавчина не записывается. Кассету съел автомат: её снова продают.
   */
  protected loadTape(record: RunSave, tapesBought: number): void {
    this.round = record.round;
    this.spinsLeft = record.spinsLeft;
    this.pot = record.pot;
    this.streak = record.streak;
    this.isBloodNext = record.isBloodNext;
    this.isLuckyNext = record.isLuckyNext;
    this.roundShields = record.roundShields;
    this.isDebtNewsShown = record.isDebtNewsShown;
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
    this.tapesBought = tapesBought;
    this.tapeState = 'forSale';
    this.newsRound = record.round; // новость этого раунда на записи уже была
  }

  /**
   * Части созданы: полка, амулеты, включённые предметы, лампочки, кон и записка — как на кассете. Вид загорается, в углу «▶».
   * Раунд идёт с того же места, новый (startRound) не начинается; фазу проверяем, как в начале раунда.
   */
  protected playTape(): void {
    this.itemShelf.setItems(this.shelf);
    this.amuletRack.setAmulets(this.amulets);
    this.showItemEffects();
    this.showBones();
    this.collector.markNote(this.debt, this.hasEnoughForDebt());
    this.cassette.showPlay();
    this.checkPhase();
    this.refreshHud();
  }
}
