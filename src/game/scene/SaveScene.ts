import { copyEffects } from '../items';
import { copyMachineSet, copyMachineState, machineStatesFrom } from '../machines';
import { isPatternId } from '../progress';
import { luckyCloversOf, tapePrice, type RunSave } from '../save';
import { ShopScene } from './ShopScene';

/**
 * Слой кассеты (шаг 45). В магазине кассета продаётся за билеты: 2, 3, 4… по купленным за забег.
 * Купил — она ложится в отделение REC видеомагнитофона. Нажми на неё между прокрутками — она запишет забег как есть
 * (посреди раунда тоже) и переедет в отделение PLAY; переписать нельзя. Нажми на записанную между прокрутками
 * (у Коллектора и в последнем шансе уже поздно) — плёнка перематывается, сцена перезапускается с записью, а автомат
 * съедает кассету: в магазине можно купить новую. Запись живёт только в памяти: закрыл вкладку — забег заново.
 */
export abstract class SaveScene extends ShopScene {
  /** Магазин открылся: у кассеты — её цена. */
  protected openShop(): void {
    super.openShop();
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
    if (!this.cassetteUnlocked()) return;
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
   * Записать забег как есть (REC): раунд, прокрутки, кон, серию, фишки, билеты, предметы, амулеты с копиями, автомат.
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
      luckyClovers: this.luckyClovers,
      roundShields: this.roundShields,
      isDebtNewsShown: this.isDebtNewsShown,
      debt: this.debt,
      balance: this.balance,
      earned: this.earned, // цель забега — тоже часть снимка: откат возвращает и её
      chipGoal: this.chipGoal, // и ступень цели: после «ДАЛЬШЕ» кассета не возвращает миллион
      tickets: this.tickets,
      slots: this.slots,
      shelf: [...this.shelf],
      effects: copyEffects(this.itemEffects), // глубокая копия: symbolBoost — тоже объект
      sockets: this.sockets,
      amulets: [...this.amulets],
      amuletCounts: { ...this.amuletCounts },
      bones: this.bones,
      machine: copyMachineState(this.machineState),
      machineSet: copyMachineSet(this.machineStates), // уровни всех трёх: прокачка не пропадает после отката
      diceDrought: this.diceDrought,
      patterns: [...this.patternSet], // стекло на плёнке: откат вернёт ровно этот набор
      secondWindUsed: this.secondWindUsed, // на записи флаг такой, какой был: запись до провала — дыхание ещё есть
      insuranceUsed: this.insuranceUsed,
    };
    this.tapeState = 'recorded';
    this.tooltip.hide();
    this.sfx.play('save');
    this.cassette.record();
    this.refreshHud();
  }

  /**
   * Откатиться (PLAY): можно между прокрутками (canRewind); у Коллектора и в последнем шансе — уже нельзя.
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
    this.isRewinding = true;
    this.tapeRecord = null;
    this.tooltip.hide();
    this.refreshHud();
    this.sfx.play('rewind');
    const tapesBought = this.tapesBought; // купленные кассеты откат не откатывает — иначе цена вернулась бы
    // Откат не пополняет ни «второе дыхание», ни страховку: что уже потрачено, записью не возвращается.
    // Страховка живёт в раунде: к записи из прошлого раунда её трата не относится.
    const tape: RunSave = {
      ...record,
      secondWindUsed: this.secondWindUsed || (record.secondWindUsed ?? false),
      insuranceUsed: (record.round === this.round ? this.insuranceUsed : false) || (record.insuranceUsed ?? false),
    };
    this.cassette.rewind(() => this.scene.restart({ tape, tapesBought }));
  }

  /**
   * Сцена перезапустилась после отката: забег с кассеты. Зовётся до частей — они строятся по числу мест, гнёзд и долгу.
   * Прокрутки, кон, серия, кровь, клевер, щит бронежилета, амулеты с их копиями — как на записи (раунд идёт с того же места).
   * Ржавчина не записывается. Кассету съел автомат: её снова продают.
   */
  protected loadTape(record: RunSave, tapesBought: number): void {
    this.round = record.round;
    this.spinsLeft = record.spinsLeft;
    this.pot = record.pot;
    this.streak = record.streak;
    this.isBloodNext = record.isBloodNext;
    this.luckyClovers = luckyCloversOf(record);
    this.roundShields = record.roundShields;
    this.isDebtNewsShown = record.isDebtNewsShown;
    this.debt = record.debt; // долг этого раунда: на Счастливом автомате он больше
    this.balance = record.balance;
    this.earned = record.earned ?? this.earned; // набранное за забег — как на плёнке (в старой записи поля нет)
    // Ступень цели — тоже с плёнки: запись после «ДАЛЬШЕ» не возвращает миллион (нет поля — цель остаётся текущей).
    if (record.chipGoal !== undefined) this.chipGoal = record.chipGoal;
    this.tickets = record.tickets;
    this.slots = record.slots;
    this.shelf = [...record.shelf];
    this.itemEffects = copyEffects(record.effects);
    this.sockets = record.sockets;
    this.amulets = [...record.amulets];
    this.amuletCounts = { ...record.amuletCounts };
    this.bones = record.bones;
    // Запись без набора автоматов (старая кассета) знала только один — остальные с первого уровня.
    this.machineStates = record.machineSet ? copyMachineSet(record.machineSet) : machineStatesFrom(record.machine ?? this.machineState);
    this.machineId = record.machine?.id ?? this.machineId;
    // Корпус его цвета и значок покажет MachineBadge — части строятся после.
    this.diceDrought = record.diceDrought;
    // Откат не пополняет ни дыхание, ни страховку: то, что уже потрачено, записью не возвращается.
    this.secondWindUsed = this.secondWindUsed || (record.secondWindUsed ?? false);
    this.insuranceUsed = this.insuranceUsed || (record.insuranceUsed ?? false);
    this.tapesBought = tapesBought;
    this.tapeState = 'forSale';
    // Стекло как на записи: открытые позже этого места паттерны кассета не возвращает. В старой записи набора нет —
    // тогда остаётся набор, который уже собрался в прогрессе (он же стоит в resetState).
    if (Array.isArray(record.patterns)) this.patternSet = record.patterns.filter((id) => isPatternId(id));
    this.newsRound = record.round; // новость этого раунда на записи уже была
  }

  /**
   * Части созданы: полка, амулеты с копиями, включённые предметы, лампочки, кон и записка — как на кассете. Вид загорается, в углу «▶».
   * Раунд идёт с того же места, новый (startRound) не начинается; фазу проверяем, как в начале раунда.
   * Последний шанс — ровно как на записи (loadTape): запись до нехватки — шанс ещё есть, после — израсходован.
   */
  protected playTape(): void {
    this.setPatternsOnGlass(); // стекло с записи: набор пришёл в loadTape
    this.itemShelf.setItems(this.shelf);
    this.amuletRack.setAmulets(this.amulets, this.amuletCounts);
    this.showItemEffects();
    this.showBones();
    this.collector.markNote(this.debt, this.hasEnoughForDebt());
    this.cassette.showPlay();
    this.checkPhase();
    this.refreshHud();
  }
}
