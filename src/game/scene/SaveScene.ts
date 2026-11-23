import { readPacts } from '../dealerGame';
import { copyEffects } from '../items';
import { isPatternId } from '../progress';
import {
  amuletChipUsedOf,
  debtNextMulOf,
  deferUsedOf,
  freeGiftUsedOf,
  luckyCloversOf,
  rescueUsedOf,
  skullCancelUsedOf,
  tapePrice,
  type RunSave,
} from '../save';
import { streakAfterRewind, tapePriceAfter, ticketsAfterRewind } from '../upgrades';
import { ShopScene } from './ShopScene';

/**
 * Слой кассеты (шаг 45). В магазине кассета продаётся за билеты: 2, 3, 4… по купленным за забег.
 * Купил — она ложится в отделение REC видеомагнитофона. Нажми на неё между прокрутками — она запишет забег как есть
 * (посреди раунда тоже) и переедет в отделение PLAY; переписать нельзя. Нажми на записанную между прокрутками
 * (у Коллектора и в спасении уже поздно) — плёнка перематывается, сцена перезапускается с записью, а автомат
 * съедает кассету: в магазине можно купить новую. Запись живёт только в памяти: закрыл вкладку — забег заново.
 */
export abstract class SaveScene extends ShopScene {
  /**
   * Магазин открылся: у кассеты — её цена. keepDebt — раунд повторяется, долг не пересчитывается; replayRound — номер
   * магазина при повторе (ShopScene.openShop).
   */
  protected override openShop(keepDebt = false, replayRound?: number): void {
    super.openShop(keepDebt, replayRound);
    if (!this.isShopOpen) return; // магазин закрыт сделкой Дилера: панели нет, и ценника кассеты тоже
    this.showTapePrice();
  }

  /** Ценники магазина и кассеты — по новому числу фишек и билетов. */
  protected refreshShop(): void {
    super.refreshShop();
    this.showTapePrice();
  }

  /** Цена кассеты (если её сейчас продают); не хватает билетов — красная. Скидка магазина — сделка №2,
   *  улучшение №44 (28г) обнуляет ровно эту цену. */
  private showTapePrice(): void {
    if (this.tapeState !== 'forSale') return;
    const price = this.tapeCost();
    this.cassette.showPrice(price, price <= this.tickets);
  }

  /** Цена кассеты в билетах: 2, 3, 4… по купленным, скидка магазина — и 0 с улучшением №44 «Кассета бесплатно». */
  private tapeCost(): number {
    return tapePriceAfter(tapePrice(this.tapesBought, this.priceMul()), this.upgradeEffects.freeTape);
  }

  /** Купить кассету (клик или T): хватает билетов — она уезжает на видеомагнитофон, в отделение REC. Одна за раз. */
  protected buyTape(): void {
    if (!this.cassetteUnlocked()) return;
    if (!this.isShopping || this.tapeState !== 'forSale') return;
    const price = this.tapeCost();
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.cassette.deny();
      return;
    }
    this.spendRunTickets(price);
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
      insuranceSaves: this.insuranceSaves,
      devUsed: this.devUsedThisRun, // кассета помнит, что забег трогали в «ТЕСТ»: откат не делает такой рекорд честным
      rescueUsed: this.rescueUsedThisRun, // и что спасение уже было: откат яму второй раз не выпросит
      deferUsed: this.deferredThisRun, // и что отсрочка (улучшение №10) уже потрачена: откат её не возвращает
      amuletChipUsed: this.amuletChipUsedThisRun, // и что амулет за фишки в мини-чемодане уже брали: откат не возвращает
      freeGiftGiven: this.freeGiftGiven, // и что подарок первого магазина (№40) уже выдан
      skullCancelUsed: this.skullCancelUsedThisRun, // и что отмена черепа (№50) уже потрачена
      startSymbol: this.startSymbolId ?? undefined, // №33: выбранный символ переживает откат
      startGridGiven: this.startGridGiven, // и первая сетка уже получила джокера/символ
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
    // Откат не пополняет страховку: что уже потрачено, записью не возвращается.
    // Страховка живёт в раунде: к записи из прошлого раунда её трата не относится.
    const tape: RunSave = {
      ...record,
      // Спасение тоже липкое: откат к записи до ямы вторую яму не открывает — иначе её фармили бы перемоткой.
      rescueUsed: rescueUsedOf(record, this.rescueUsedThisRun),
      // Отсрочка липкая так же: запись до неё не возвращает вторую попытку.
      deferUsed: deferUsedOf(record, this.deferredThisRun),
      // Мини-чемодан/№40: вторая покупка за фишки и второй подарок откатом не возвращаются.
      amuletChipUsed: amuletChipUsedOf(record, this.amuletChipUsedThisRun),
      freeGiftGiven: freeGiftUsedOf(record, this.freeGiftGiven),
      // №50 (28г): отмена черепа липкая — откат второй не даёт.
      skullCancelUsed: skullCancelUsedOf(record, this.skullCancelUsedThisRun),
      // №42 (28г): откат не сбрасывает серию — берём большую из текущей и записанной.
      streak: streakAfterRewind(record.streak, this.streak, this.upgradeEffects.rewindKeepsStreak),
      // №45 (28г): откат возвращает билеты, потраченные после записи, — к снимку с плёнки.
      tickets: ticketsAfterRewind(record.tickets, this.ticketsSpentOnTape, this.upgradeEffects.rewindRefundsTickets),
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
    // Откат не пополняет страховку: то, что уже потрачено, записью не возвращается.
    this.insuranceSaves = Math.max(this.insuranceSaves, record.insuranceSaves ?? 0);
    // След «трогали в ТЕСТ» липкий в обе стороны: накрученный до записи забег остаётся помеченным и после отката,
    // а старая кассета без поля (devUsed нет) ничего не помечает. resetState() этот флаг уже обнулил —
    // поэтому insertTape передаёт его в scene.restart отдельно (data.devUsed), и здесь он складывается с плёнкой.
    this.devUsedThisRun = this.devUsedThisRun || !!record.devUsed;
    // Спасение липкое так же: запись до ямы его не возвращает. resetState флаг обнулил, а insertTape
    // сложил текущий с плёнкой — здесь остаётся только прочитать (правило — save.rescueUsedOf; старая кассета без поля — не было).
    this.rescueUsedThisRun = rescueUsedOf(record, this.rescueUsedThisRun);
    // Отсрочка (улучшение №10) — по тому же правилу: текущий флаг с плёнкой, назад её не возвращает.
    this.deferredThisRun = deferUsedOf(record, this.deferredThisRun);
    // Мини-чемодан и №40 — липкие так же: откат к записи до них вторую покупку и подарок не возвращает.
    this.amuletChipUsedThisRun = amuletChipUsedOf(record, this.amuletChipUsedThisRun);
    this.freeGiftGiven = freeGiftUsedOf(record, this.freeGiftGiven);
    // №50 (28г): отмена черепа едет с плёнки; insertTape уже сложил текущее с записью.
    this.skullCancelUsedThisRun = skullCancelUsedOf(record, this.skullCancelUsedThisRun);
    // №42/№45 (28г): серия и билеты на плёнке уже посчитаны с улучшениями (insertTape), здесь просто читаются.
    // Откат съедает счётчик трат: эти билеты вернулись — второй раз их откат не начислит (кассеты уже нет).
    // №33: выбранный символ и признак «первая сетка уже с бонусом» едут с плёнкой.
    if (record.startSymbol !== undefined) this.startSymbolId = record.startSymbol;
    this.startGridGiven = record.startGridGiven === true;
    // Отложенного долга на плёнке нет: число на записи уже включает его, второй раз прибавлять нечего.
    this.debtCarry = 0;
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
   * Спасение не как на записи, а липкое: был ли он на плёнке или уже случился в этом забеге — после отката его
   * больше нет (save.rescueUsedOf складывает оба флага, insertTape/loadTape его не снимают).
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
