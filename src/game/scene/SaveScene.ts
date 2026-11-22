import { readPacts, SECOND_WIND_MAX } from '../dealerGame';
import { copyEffects } from '../items';
import { isPatternId } from '../progress';
import { debtNextMulOf, luckyCloversOf, secondWindLeftOf, tapePrice, type RunSave } from '../save';
import { ShopScene } from './ShopScene';

/**
 * Слой кассеты (шаг 45). В магазине кассета продаётся за билеты: 2, 3, 4… по купленным за забег.
 * Купил — она ложится в отделение REC видеомагнитофона. Нажми на неё между прокрутками — она запишет забег как есть
 * (посреди раунда тоже) и переедет в отделение PLAY; переписать нельзя. Нажми на записанную между прокрутками
 * (у Коллектора и в спасении уже поздно) — плёнка перематывается, сцена перезапускается с записью, а автомат
 * съедает кассету: в магазине можно купить новую. Запись живёт только в памяти: закрыл вкладку — забег заново.
 */
export abstract class SaveScene extends ShopScene {
  /** Магазин открылся: у кассеты — её цена. */
  protected openShop(): void {
    super.openShop();
    if (!this.isShopOpen) return; // магазин закрыт сделкой Дилера: панели нет, и ценника кассеты тоже
    this.showTapePrice();
  }

  /** Ценники магазина и кассеты — по новому числу фишек и билетов. */
  protected refreshShop(): void {
    super.refreshShop();
    this.showTapePrice();
  }

  /** Цена кассеты (если её сейчас продают); не хватает билетов — красная. Скидка магазина — сделка №2. */
  private showTapePrice(): void {
    if (this.tapeState !== 'forSale') return;
    const price = tapePrice(this.tapesBought, this.shopDiscount());
    this.cassette.showPrice(price, price <= this.tickets);
  }

  /** Купить кассету (клик или 9): хватает билетов — она уезжает на видеомагнитофон, в отделение REC. Одна за раз. */
  protected buyTape(): void {
    if (!this.cassetteUnlocked()) return;
    if (!this.isShopping || this.tapeState !== 'forSale') return;
    const price = tapePrice(this.tapesBought, this.shopDiscount());
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
    // Пока висит решение по перемешке, canRecord/canRewind закрыты (canAct): кассета только трясётся, забег не откатывается.
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
      machineId: this.machineId,
      pacts: this.pacts.map((pact) => ({ ...pact })), // сделки Дилера: срок и выбранный символ — тоже часть снимка
      debtNextMul: this.debtNextMul, // «следующий долг +20%» ещё не применён — откат его не теряет
      diceDrought: this.diceDrought,
      patterns: [...this.patternSet], // стекло на плёнке: откат вернёт ровно этот набор
      secondWindLeft: this.secondWindLeft, // на записи счётчик такой, какой был: запись до провала — дыхание ещё есть
      breathTaken: this.breathTaken, // сделка №9 уже бралась — откат этого не забывает (иначе карту возьмут второй раз)
      insuranceSaves: this.insuranceSaves,
      devUsed: this.devUsedThisRun, // кассета помнит, что забег трогали в «ТЕСТ»: откат не делает такой рекорд честным
    };
    this.tapeState = 'recorded';
    this.tooltip.hide();
    this.sfx.play('save');
    this.cassette.record();
    this.refreshHud();
  }

  /**
   * Откатиться (PLAY): можно между прокрутками (canRewind); у Коллектора и в спасении — уже нельзя.
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
      secondWindLeft: Math.min(secondWindLeftOf(record), this.secondWindLeft),
      breathTaken: this.breathTaken || !!record.breathTaken, // липкий, как devUsed: карту №9 второй раз не взять
      // Откат не пополняет страховку: сработки из этого раунда и с плёнки берём по большей.
      insuranceSaves: Math.max(record.round === this.round ? this.insuranceSaves : 0, record.insuranceSaves ?? 0),
    };
    this.cassette.rewind(() => this.scene.restart({ tape, tapesBought, devUsed: this.devUsedThisRun, achievements: this.pendingAchievements() }));
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
    this.debtNextMul = debtNextMulOf(record); // «следующий долг +20%» с плёнки; в старой записи поля нет — 1
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
    // Запись без автомата (старая кассета) — остаётся тот, что стоит сейчас.
    if (record.machineId !== undefined) this.machineId = record.machineId;
    // Сделки Дилера с плёнки: неизвестные id отбрасываем, битый срок — 0 (dealerGame.readPacts);
    // в старой записи поля нет — сделок нет.
    this.pacts = readPacts(record.pacts);
    // Корпус его цвета и значок покажет MachineBadge — части строятся после.
    this.diceDrought = record.diceDrought;
    // Откат не пополняет ни дыхание, ни страховку: то, что уже потрачено, записью не возвращается.
    // Потолок — дело сцены: `secondWindLeftOf` читает запись терпимо (битые плёнки бывают), а два запаса — правило игры.
    this.secondWindLeft = Math.min(SECOND_WIND_MAX, secondWindLeftOf(record));
    this.breathTaken = this.breathTaken || !!record.breathTaken; // карта №9 одна на забег, даже после отката
    this.insuranceSaves = Math.max(this.insuranceSaves, record.insuranceSaves ?? 0);
    // След «трогали в ТЕСТ» липкий в обе стороны: накрученный до записи забег остаётся помеченным и после отката,
    // а старая кассета без поля (devUsed нет) ничего не помечает. resetState() этот флаг уже обнулил —
    // поэтому insertTape передаёт его в scene.restart отдельно (data.devUsed), и здесь он складывается с плёнкой.
    this.devUsedThisRun = this.devUsedThisRun || !!record.devUsed;
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
   * Спасение — ровно как на записи (loadTape): запись до нехватки — шанс ещё есть, после — израсходован.
   */
  protected playTape(): void {
    this.setPatternsOnGlass(); // стекло с записи: набор пришёл в loadTape
    this.itemShelf.setItems(this.shelf);
    this.amuletRack.setAmulets(this.amulets, this.amuletCounts);
    this.showItemEffects();
    this.showBones();
    this.collector.markNote(this.debt);
    this.cassette.showPlay();
    this.checkPhase();
    this.refreshHud();
  }
}
