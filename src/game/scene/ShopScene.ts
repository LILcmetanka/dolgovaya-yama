import {
  addCopy,
  amuletPrice,
  countOf,
  insuranceCopyPrice,
  maxCopiesOf,
  MINI_CASE_PLACES,
  MINI_CASE_PURCHASES,
  miniCasePrice,
  randomAmuletOffer,
  socketPrice,
  withRareAmulet,
  type Amulet,
} from '../amulets';
import { amuletKey, itemKey, see, WHO_COLLECTOR } from '../codex';
import { DEBT_FREEZE_NEXT_MUL, pactEffects, shopDebt, shopRoundOf } from '../dealerGame';
import { canWin, DRUM_SECTORS, drumChips, drumPrice, prizeItem, randomSector, type DrumPrize } from '../drum';
import { itemPrice, MAX_SLOTS, offerReplacement, offerRowCount, randomOffer, slotPrice, TICKETS_PER_SHOP, ticketForChips, type ShopItem } from '../items';
import { t } from '../lang';
import { machineItemAllowed } from '../machines';
import { isTutorialDone, setTutorialStep, tutorialStep, type TutorialTrack } from '../progress';
import type { SoundName } from '../sound';
import { GOLD_TEXT } from '../theme';
import { VENDING_BIN } from '../layout';
import { FIRST_AMULET_LINES, firstItemLines, SHOP_EMPTY_LINES, type TutorialLine } from '../tutorial';
import { SOCKET_ROW, SLOT_ROW } from '../parts/miniShop';
import { DealerScene } from './DealerScene';

const PRIZE_POPUP_RISE = 20; // «+N» за фишки из барабана всплывает чуть выше сектора
const AMULET_DENY_HINT_TIME = 1500; // сколько висит подсказка отказа, мс

/** Звук приза барабана: билет шелестит, фишки стучат, предмет — как предмет. */
function prizeSound(prize: DrumPrize): SoundName {
  if (prize === 'ticket' || prize === 'chips') return prize;
  return 'item';
}

/**
 * Слой магазина: после расплаты сверху съезжает панель магазина (как жалюзи) и закрывает комнату. В торговом автомате —
 * предметы за фишки, в маленьком автомате рядом — место на полке за фишки и гнездо за билеты, в витрине над торговым —
 * амулеты за билеты, справа на панели — «барабан» за фишки и кассета.
 * Что открыто, решают закрытые долги (amuletsUnlocked и остальные): части показывают себя через setAvailable.
 * Ушёл из магазина — панель уезжает наверх, и новый раунд: автомат к этому моменту мог смениться сам.
 */
export abstract class ShopScene extends DealerScene {
  // Панель уезжает после leaveShop, и колбэк её хода ещё не сработал: раунд начнётся, только когда она уедет.
  private isLeavingShop = false;
  // Сколько билетов за фишки уже куплено в этом магазине: выше items.TICKETS_PER_SHOP не продают, ряд гаснет.
  private ticketsBoughtHere = 0;
  // Сколько покупок сделано за этот заход (предмет, амулет, билет, барабан): по нулю — пустой первый магазин.
  private purchasesThisVisit = 0;
  // Реплики Дилера после закрытия магазина: первый предмет и первый амулет запоминаются здесь, а говорятся уже
  // на экране автомата, когда жалюзи уехали (DONTLIKE, 25.11). Покупка в любом по счёту магазине сюда попадает.
  private pendingFirstItem: ShopItem | null = null;
  private pendingFirstAmulet = false;
  // Подсказка отказа висит AMULET_DENY_HINT_TIME; новый отказ снимает прошлый таймер.
  private amuletDenyHint: Phaser.Time.TimerEvent | null = null;

  /** Новый забег: в магазине ещё ничего не покупали — счётчик захода не переезжает через restart и откат кассеты. */
  protected resetState(): void {
    super.resetState();
    this.ticketsBoughtHere = 0; // рядом с ticketsBought: тот считает билеты за забег, этот — за один заход
    this.purchasesThisVisit = 0; // пустой первый магазин считается по нулю покупок за заход
    this.pendingFirstItem = null; // недоигранные реплики прошлой сцены в новый забег не переезжают
    this.pendingFirstAmulet = false;
  }

  /** Окна и новости ждут, пока панель магазина совсем не уедет: иначе они легли бы поверх жалюзи (DONTLIKE, 25.11). */
  protected override canShowPopups(): boolean {
    return super.canShowPopups() && !this.isLeavingShop;
  }

  /**
   * Долг отдан (или пропущен): на записке следующий долг (записка переворачивается), сверху съезжает панель магазина.
   * replayRound — номер раунда, перед которым встаёт магазин, когда раунд переигрывается: выжил в спасении или провалил
   * его со «вторым дыханием» (CollectorScene откатывает счёт на 1 и передаёт исходный номер). Обычный заход его не
   * передаёт — магазин встаёт перед следующим раундом (this.round + 1). Номер магазина считается ЗДЕСЬ и по нему же
   * проверяются сделки: иначе «магазин закрыт» в переигранном N искали бы в N − 1, и панель выезжала бы зря (или
   * закрывалась лишний раз).
   * keepDebt — раунд играется заново: долг остаётся ровно тем же числом, который был до ямы, а debtNextMul не тратится.
   * Считай долг заново здесь нельзя: разовые эффекты сделок (№2 «долг +8%», №12 «текущий долг −10%») уже сидят
   * в this.debt, и debtForRound их бы стёр.
   */
  protected openShop(keepDebt = false, replayRound?: number): void {
    const shopRound = shopRoundOf(this.round, replayRound); // раунд, перед которым встаёт магазин
    // Сделка «магазин закрыт» (dealerGame.pactEffects): панель не выезжает вовсе, покупок нет.
    if (pactEffects(this.pacts, shopRound).shopClosed) {
      this.skipClosedShop(keepDebt, shopRound);
      return;
    }
    this.round = shopRound;
    this.applyShopDebt(keepDebt);
    this.screen.setLampsVisible(false); // лампочки рамки не висят над панелью магазина
    this.isShopOpen = true; // панель на экране — и пока едет, и когда уже стоит
    this.isLeavingShop = false; // забег мог перезапуститься посреди выхода: панель снова на месте
    this.updateRecord();
    this.collector.flipNote(this.debt);
    // Оффер — под автомат, который стоит: «Удача» у «Тихого» бесполезна (клевера нет).
    // Сделка №27: в витрине на один предмет меньше; рядов не меньше одного. Витрина всегда 4 ряда (три предмета и билеты).
    const rowDelta = pactEffects(this.pacts, this.round - 1).itemOfferDelta;
    const rows = Math.max(1, offerRowCount(rowDelta));
    const offer = randomOffer(this.round, (item) => machineItemAllowed(this.machineId, item), rows);
    this.offer = offer;
    // Чемодан открыт — витрина амулетов новая; закрыт — в магазине амулетов нет вовсе.
    // Сделка №33: в этом забеге амулеты не продаются вовсе — чемодан закрыт.
    const isAmulets = this.amuletsUnlocked() && !pactEffects(this.pacts, this.round - 1).amuletsClosed;
    const amuletOffer = isAmulets ? this.amuletOfferForShop() : [];
    this.amuletOffer = amuletOffer;
    // Мини-чемодан за фишки (DONTLIKE п.7): два амулета, которых нет в основном чемодане, — за фишки.
    this.miniCaseOffer = isAmulets ? this.miniCaseOfferForShop(amuletOffer) : [];
    // Покупка в прошлом магазине значит «следующий»: чемодана здесь нет вовсе — ни корпуса, ни ценников, ни
    // подсказок, и его амулеты не открываются в кодексе. В магазине, где покупают, он остаётся (miniCaseShown).
    const miniShown = this.miniCaseShown();
    if (!miniShown) this.miniCaseOffer = [];
    this.seeInShop(
      offer.map((item) => itemKey(item.id)),
      [...amuletOffer, ...(miniShown ? this.miniCaseOffer : [])].filter((amulet): amulet is Amulet => amulet !== null).map((amulet) => amuletKey(amulet.id)),
    );
    this.drumSpins = 0; // в новом магазине барабан снова дешёвый
    this.ticketsBoughtHere = 0; // и билеты за фишки снова продаются — ряд в автомате загорится при открытии панели
    this.purchasesThisVisit = 0; // новый заход — новых покупок ещё нет
    const prices = offer.map((item) => this.itemPriceNow(item)); // цены — доля нового долга и скидки улучшений №22 и №36
    // Что открыто — по закрытым долгам: номер раунда уже номер этого магазина, поэтому предикаты дают его счёт.
    this.amuletCase.setAvailable(isAmulets);
    // Мини-чемодан за фишки: до двух амулетов за забег. В магазине, где берут, он остаётся видимым и после первой
    // покупки (второй амулет берут там же); в следующем магазине — пропадает до конца забега. Пустым не висит.
    this.miniCase.setAvailable(miniShown);
    this.drum.setAvailable(this.drumUnlocked());
    this.cassette.setAvailable(this.cassetteUnlocked());
    // Панель поехала: чемодан и маленький автомат прошлого захода сразу пусты, цены на панели — уже от нового долга.
    if (isAmulets) {
      this.amuletCase.clear();
      this.miniCase.clear();
    }
    this.miniShop.clear();
    this.panel.setPhaseSignsVisible(false); // знаки фазы 2 поверх панели магазина торчать не должны
    this.sfx.play('turn');
    // Улучшение №40 (28в): в первом магазине забега один случайный предмет бесплатно — если на полке есть место.
    const gift = this.takeFirstShopGift();
    this.shop.open(offer, prices, () => {
      // Панель опустилась: только теперь можно покупать, а чемодан наполняется уже на ней.
      if (this.isGameOver) return; // победа пришла, пока панель ехала: покупки закрыты, панель уже уезжает
      this.isShopping = true;
      this.miniShop.open();
      if (gift) {
        this.itemShelf.putItem(gift.slot, gift.item, VENDING_BIN.x, VENDING_BIN.y); // подарок падает в лоток
        see(itemKey(gift.item.id));
        this.sfx.play('item');
      }
      if (isAmulets) {
        this.amuletCase.fill({ amulets: amuletOffer, prices: amuletOffer.map((amulet) => this.amuletPriceNow(amulet)) });
        // Мини-чемодан наполняется, только если ему есть что предложить: взятый амулет за фишки его не возвращает.
        if (miniShown) this.miniCase.fill({ amulets: this.miniCaseOffer, prices: this.miniCasePricesNow() });
      }
      this.refreshShop();
    });
    this.refreshShop(); // пока панель едет: цены барабана и рядов — новые, прошлый заход не мелькает
  }

  /**
   * Улучшение №40 (28в): подарок первого магазина. Один случайный предмет из пула этого раунда ложится на свободное
   * место полки; нет места — подарка нет (мест на полке фиксированное число, расширения нет).
   * Выдаётся один раз за забег: после отката кассетой к записи, где подарка ещё не было, повторно не выдаём.
   */
  private takeFirstShopGift(): { slot: number; item: ShopItem } | null {
    if (!this.upgradeEffects.freeItemFirstShop || this.freeGiftGiven || this.closedDebts() !== 1) return null;
    const slot = this.shelf.indexOf(null);
    if (slot < 0) return null;
    const [item] = randomOffer(this.round, (next) => machineItemAllowed(this.machineId, next), 1);
    if (!item) return null;
    this.shelf[slot] = item;
    this.freeGiftGiven = true;
    return { slot, item };
  }

  /**
   * Магазин закрыт сделкой Дилера: жалюзи не выезжают, покупок нет — только записка с новым долгом и новый раунд.
   * Долг и счёт раунда двигаются так же, как в openShop, иначе следующий долг посчитался бы от старого.
   * shopRound — номер магазина, уже посчитанный в openShop (обычный заход — следующий раунд, повтор — тот же самый).
   * keepDebt — то же, что в openShop: раунд повторяется, долг остаётся прежним числом.
   */
  private skipClosedShop(keepDebt: boolean, shopRound: number): void {
    this.round = shopRound;
    this.applyShopDebt(keepDebt);
    this.screen.setLampsVisible(false); // лампочки рамки не висят над панелью магазина
    this.isShopOpen = false;
    this.isShopping = false;
    this.isLeavingShop = false;
    this.updateRecord();
    this.collector.flipNote(this.debt);
    this.screen.announceNews(t('shopClosedByPact'));
    this.sfx.play('deny');
    if (this.isGameOver) return; // победа пришла, пока банкомат уезжал: раунд начнёт «ДАЛЬШЕ»
    this.startRound();
  }

  /**
   * Долг магазина по одному правилу (dealerGame.shopDebt): новый раунд — rules.debtForRound плюс разовый
   * «следующий долг +20%» (сделка №12, debtNextMul), повтор раунда — ровно прежнее число без траты множителя.
   * Улучшение №7 (шаг 28) — рост долга ×3,4 вместо ×3,6 (growthMul), улучшение №10 — к новому долгу прибавляется
   * отложенный в прошлом раунде (debtCarry). Отсрочка при повторе раунда не тратится: число остаётся прежним.
   */
  private applyShopDebt(keepDebt: boolean): void {
    // Сделка №44: долг этого раунда не растёт — следующий магазин оставляет то же число, а долг после него ×2.
    const freeze = !keepDebt && pactEffects(this.pacts, this.round - 1).debtNoGrowth;
    const next = shopDebt(this.debt, this.round, this.debtNextMul, keepDebt || freeze, this.upgradeEffects.debtGrowthMul);
    if (keepDebt || freeze) {
      this.debt = next.debt; // раунд повторяется: долг остаётся ровно прежним, выкуп ждёт следующего магазина
    } else {
      // «Долговая биржа» (действие №10, шаг 29): выкупленный заранее долг уменьшает следующий на свою долю.
      const cut = this.actionState.debtCut;
      this.debt = Math.max(0, next.debt + this.debtCarry - cut);
      this.debtCarry = 0; // отложенный долг уже в этом числе — второй раз не прибавляем
      if (cut > 0) this.actionState = { ...this.actionState, debtCut: 0 }; // выкуп одноразовый: второй раз не спишется
    }
    this.debtNextMul = freeze ? DEBT_FREEZE_NEXT_MUL : next.debtNextMul;
  }

  /**
   * Скидка сделки №2 «−20% цен» на этот магазин. Магазин открывается ПОСЛЕ раунда, а счёт уже увеличен (openShop),
   * поэтому смотрим срок сделки на прошлом раунде: так скидка покрывает ровно CHEAP_SHOP_ROUNDS магазинов.
   * Через эту одну дверь считаются все цены магазина — предметы, места, амулеты, гнёзда, барабан и кассета.
   */
  protected shopDiscount(): number {
    return pactEffects(this.pacts, this.round - 1).shopDiscount;
  }

  /**
   * Общий множитель цен магазина: скидка сделки №2 и скидка улучшения №36 (шаг 28в) перемножаются — как и прочие
   * множители улучшений. Через эту дверь считаются все цены: предметы, места, гнёзда, амулеты, билет, барабан, кассета.
   */
  protected priceMul(): number {
    return this.shopDiscount() * this.upgradeEffects.shopPriceMul;
  }

  /**
   * Цена предмета: доля долга, скидка сделки №2 и скидка улучшения №22 (шаг 28б) — перемножаются, округление и
   * нижняя граница те же (roundPrice). Все места, где показана или списана цена предмета, идут через эту дверь.
   */
  private itemPriceNow(item: ShopItem): number {
    // Сделка №27: предметы −20% — множитель к общей скидке магазина.
    const pactMul = pactEffects(this.pacts, this.round - 1).itemPriceMul;
    return itemPrice(item, this.debt, this.priceMul() * this.upgradeEffects.itemPriceMul * pactMul);
  }

  /**
   * Цена места на полке. Улучшение предметов мест не даёт (№21 удалён), поэтому здесь правило игры без изменений.
   * Через эту дверь её читает и витрина маленького автомата.
   */
  private slotPriceNow(): number | null {
    return slotPrice(this.slots, this.debt, this.priceMul());
  }

  /**
   * Цена гнезда: улучшение №28 (шаг 28б) делает первое гнездо забега (sockets = START_SOCKETS) бесплатным.
   * Правило о том, что гнездо «первое», — в amulets.socketPrice: второе и дальше стоят как обычно.
   */
  private socketPriceNow(): number | null {
    return socketPrice(this.sockets, this.priceMul(), this.upgradeEffects.firstSocketFree);
  }

  /**
   * Витрина амулетов магазина: потолок копий поднят улучшением №27 (шаг 28б). В первом магазине забега
   * (закрыт ровно первый долг) улучшение №29 гарантирует редкий амулет на витрине.
   */
  private amuletOfferForShop(): Amulet[] {
    const bonus = this.upgradeEffects.amuletMaxCopies;
    const effects = pactEffects(this.pacts, this.round - 1);
    // Сделка №35: в витрине всегда редкий амулет и только один амулет за магазин.
    let offer = randomAmuletOffer(this.amuletIds(), bonus).filter((amulet) => this.copiesLeft(amulet) > 0);
    if (effects.rareAmuletForced || (this.upgradeEffects.rareAmuletFirstShop && this.closedDebts() === 1)) {
      offer = withRareAmulet(offer, this.amuletIds(), bonus);
    }
    const limit = Number.isFinite(effects.amuletPerShop) && effects.amuletPerShop > 0 ? Math.floor(effects.amuletPerShop) : 0;
    return limit > 0 ? offer.slice(0, limit) : offer;
  }

  /** Потолок копий с учётом сделки №20: страховку можно держать только одну. */
  private copiesLeft(amulet: Amulet): number {
    const max = maxCopiesOf(amulet, this.upgradeEffects.amuletMaxCopies);
    const cap = pactEffects(this.pacts, this.round - 1).insuranceMaxOne && amulet.id === 'insurance' ? 1 : max;
    return Math.max(0, cap - countOf(this.amuletCounts, amulet.id));
  }

  /**
   * Цена амулета в витрине: скидка магазина (№2), «вдвое дороже» за копию страховки (№5) и −1 билет (№26).
   * Сделки шага 30: №17 — полцены и вторая копия вдвое дороже, №20 — страховка бесплатно, №32 — все дороже на 1 билет.
   */
  private amuletPriceNow(amulet: Amulet): number {
    const effects = pactEffects(this.pacts, this.round - 1);
    if (effects.amuletFreeInsurance && amulet.id === 'insurance') return 0;
    const mul = this.priceMul() * effects.amuletPriceMul;
    const price = amuletPrice(amulet, mul, this.upgradeEffects.amuletTicketsOff) + effects.amuletPriceAdd;
    if (effects.amuletCopiesDouble) return insuranceCopyPrice(price, countOf(this.amuletCounts, amulet.id));
    if (!effects.insuranceDoubles || amulet.id !== 'insurance') return price;
    return insuranceCopyPrice(price, countOf(this.amuletCounts, 'insurance'));
  }

  /** В магазине показали предметы и амулеты (и Коллектор уже приходил): всё это теперь на экране на стене. NEW не поднимаем — он только за новые символы барабана. */
  private seeInShop(...keys: string[][]): void {
    for (const key of [WHO_COLLECTOR, ...keys.flat()]) see(key); // see — для каждого ключа: от него зависят вкладки «Предметы» и «Кто есть кто»
  }

  /** Купить ряд торгового автомата row: предмет — на свободное место полки, ряд билетов — билет за фишки. */
  protected buy(row: number): void {
    if (!this.isShopping) return;
    if (this.tutorialBlocks()) return; // идёт текст обучения — покупки ждут
    if (row === this.shop.ticketRow) this.buyTicket();
    else this.buyItem(row);
  }

  /** Купить ряд маленького автомата row: место на полке за фишки или гнездо амулета за билеты. */
  protected buyMini(row: number): void {
    if (!this.isShopping) return;
    if (this.tutorialBlocks()) return; // идёт текст обучения — покупки ждут
    if (row === SLOT_ROW) this.buySlot();
    else if (row === SOCKET_ROW) this.buySocket();
  }

  /** Купить предмет: фишки уходят с табло, предмет падает в лоток и летит на свободное место полки. */
  private buyItem(row: number): void {
    // Своя проверка: двойной клик до landed не должен продать уже заменённый предмет второй раз.
    if (!this.isShopping) return;
    const item = this.offer[row];
    if (!item) return;
    const price = this.itemPriceNow(item);
    const slot = this.shelf.indexOf(null);
    if (price > this.balance) {
      this.sfx.play('deny');
      this.shop.deny(row); // не хватает фишек — ценник трясётся
      return;
    }
    if (slot < 0) {
      this.sfx.play('deny');
      this.itemShelf.shakeFull(); // на полке нет места — трясутся предметы на полке
      return;
    }
    this.balance -= price;
    this.offer[row] = null;
    this.shelf[slot] = item;
    this.purchasesThisVisit += 1; // покупка за заход: пустой первый магазин считается по нулю
    // Замена считается сразу, а не через ~1,1 с в колбэке падения покупки: уход из магазина в этот момент
    // не должен оставить ряд пустым (DONTLIKE б.5). Следующий openShop всё равно строит оффер заново.
    const replacement = offerReplacement([...this.offer, item], this.round, (next) => machineItemAllowed(this.machineId, next));
    this.offer[row] = replacement;
    this.shop.sell(row, (x, y) => {
      this.itemShelf.putItem(slot, item, x, y);
      this.refillRow(row, replacement);
    });
    this.afterPurchase();
    this.tutorialFirstItem(item); // первый купленный предмет: короткая реплика Дилера
  }

  /**
   * Купили предмет — в его ряду появляется другой из пула (не тот, что купили, и не тот, что стоит в других рядах):
   * витрина не пустеет за заход. Здесь только показ: какой предмет встанет, уже решено в buyItem — поэтому
   * вышедший из магазина игрок не оставит ряд пустым. Появляется, когда покупка упала в лоток, с подскоком;
   * остальные ряды не трогаются. item === null — в пуле больше нет предметов, ряд остаётся пустым.
   */
  private refillRow(row: number, item: ShopItem | null): void {
    if (!item) return; // в пуле больше нет предметов — ряд остаётся пустым
    this.shop.refill(row, item, this.itemPriceNow(item));
    see(itemKey(item.id)); // новый предмет уже встречен — во вкладке «Предметы» он не «???»
    this.refreshShop();
  }

  /**
   * Купить билет за фишки (шаг 13): цена — доля фишек на руках, и с каждой покупкой за забег доля растёт
   * (items.ticketForChips). За один заход в магазин продают не больше items.TICKETS_PER_SHOP — когда потолок выбран,
   * ряд гаснет до следующего магазина. Цена в кассету не пишется (как drumSpins): откат не удешевляет следующую покупку.
   */
  private buyTicket(): void {
    if (!this.isShopping) return;
    if (TICKETS_PER_SHOP > 0 && this.ticketsBoughtHere >= TICKETS_PER_SHOP) {
      this.sfx.play('deny');
      this.showTicketLimit(); // почему ряд погас — подсказкой, как отказ амулету
      return;
    }
    const price = ticketForChips(this.balance, this.ticketsBought, this.priceMul() * pactEffects(this.pacts, this.round - 1).ticketChipsMul, this.upgradeEffects.ticketShareStart);
    if (price > this.balance) {
      this.sfx.play('deny');
      this.shop.deny(this.shop.ticketRow); // не хватает фишек — ценник билета трясётся
      return;
    }
    this.balance -= price;
    this.tickets += 1;
    this.ticketsBought += 1;
    this.ticketsBoughtHere += 1;
    this.purchasesThisVisit += 1; // билет — тоже покупка за заход
    this.shop.sellTicket();
    this.afterPurchase();
    // Потолок за заход выбран — ряд гаснет до следующего магазина, а подсказка говорит, почему.
    if (TICKETS_PER_SHOP > 0 && this.ticketsBoughtHere >= TICKETS_PER_SHOP) {
      this.shop.soldOutTickets();
      this.showTicketLimit();
    }
  }

  /** Подсказка «за заход билетов больше не продают»: висит AMULET_DENY_HINT_TIME, новый отказ снимает прошлый таймер. */
  private showTicketLimit(): void {
    this.tooltip.show(t('shopTicket'), t('shopTicketSold'));
    this.amuletDenyHint?.remove();
    this.amuletDenyHint = this.time.delayedCall(AMULET_DENY_HINT_TIME, () => {
      this.amuletDenyHint = null;
      this.tooltip.hide();
    });
  }

  /** Купить место на полке: с новой клетки слетают доски, дверца с кодом уезжает. */
  private buySlot(): void {
    const price = this.slotPriceNow();
    if (price === null) return; // мест больше не продают
    if (price > this.balance) {
      this.sfx.play('deny');
      this.miniShop.deny(SLOT_ROW);
      return;
    }
    this.balance -= price;
    this.purchasesThisVisit += 1; // покупка за заход
    const slot = this.addSlot();
    this.miniShop.sell(SLOT_ROW, () => this.itemShelf.openSlot(slot));
    this.afterPurchase();
  }

  /** Ещё одно место на полке — следующая клетка за открытыми; вернуть её номер. Дверцу с неё снимает itemShelf.openSlot. */
  private addSlot(): number {
    this.slots += 1;
    this.shelf.push(null);
    return this.slots - 1;
  }

  /** Купить место основного чемодана: в нём только амулеты за билеты (за фишки — мини-чемодан, DONTLIKE п.7). */
  protected buyFromCase(place: number): void {
    if (!this.amuletsUnlocked()) return;
    if (!this.isShopping || !this.amuletCase.isOpen) return; // чемодан ещё закрыт — покупать нечего
    if (this.tutorialBlocks()) return; // идёт текст обучения — покупки ждут
    this.buyAmulet(place);
  }

  /**
   * Купить амулет за билеты: он летит из витрины в гнездо. Новый — в свободное гнездо, копия уже стоящего —
   * в его гнездо.
   */
  private buyAmulet(place: number): void {
    const amulet = this.amuletOffer[place];
    if (!amulet) return;
    if (this.copiesLeft(amulet) <= 0) {
      this.sfx.play('deny');
      this.amuletCase.deny(place); // копий уже под потолок — ценник трясётся
      return;
    }
    const socket = this.amulets.findIndex((owned) => owned.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
    if (socket < 0 && this.amulets.length >= this.sockets) {
      this.sfx.play('deny');
      this.amuletCase.deny(place); // амулет новый, а свободного гнезда нет — ценник трясётся
      return;
    }
    const price = this.amuletPriceNow(amulet);
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.amuletCase.deny(place); // не хватает билетов — ценник трясётся
      return;
    }
    this.spendRunTickets(price); // №45 (28г): трата после записи вернётся откатом
    this.purchasesThisVisit += 1; // покупка за заход: сгоревший от сделки амулет — тоже покупка
    this.amuletOffer[place] = null;
    const isNew = socket < 0;
    let index = socket;
    if (isNew) {
      index = this.amulets.length;
      this.amulets.push(amulet); // гнездо занято сразу: второй быстрый клик его уже не получит
    }
    addCopy(this.amuletCounts, amulet.id);
    // Сделка №34: следующий купленный амулет сгорает сразу — билеты за него не возвращаются.
    if (this.pactAmuletBurns) {
      this.pactAmuletBurns = false;
      this.amuletCounts[amulet.id] = Math.max(0, countOf(this.amuletCounts, amulet.id) - 1);
      if (isNew) this.amulets.pop();
      this.amuletOffer[place] = null;
      this.sfx.play('burn', 0.2);
      this.shop.announce(t('pactAmuletBurned'));
      this.afterPurchase();
      return;
    }
    const count = countOf(this.amuletCounts, amulet.id); // сколько копий станет после этой покупки
    this.amuletCase.sell(place, (x, y) => {
      // Гнездо за панелью: амулет гаснет, пройдя первые ~200 px к нему, — будто уходит за жалюзи, а не летит через витрину.
      if (isNew) this.amuletRack.putAmulet(index, amulet, count, x, y); // анимация — только когда амулет долетел
      else this.amuletRack.putCopy(index, amulet, count, x, y);
      this.showBones();
    });
    this.afterPurchase();
    this.tutorialFirstAmulet(); // первый купленный амулет: короткая реплика Дилера
  }

  /**
   * Видно ли мини-чемодан за фишки (DONTLIKE п.7). До MINI_CASE_PURCHASES покупок за забег, причём все они — в этом
   * же магазине: как только берут хотя бы один амулет, следующий магазин показывает панель уже без чемодана до конца
   * забега (miniCaseShopRound < this.round). Пустое предложение (все амулеты уже есть) тоже не висит. Зовётся при
   * каждом открытии панели и на каждом refresh: танцы с setAvailable здесь же, чтобы в «спрятанном» состоянии не
   * оставалось ни подсказок, ни нажатий. Откат кассетой возвращает числа с плёнки — как на записи.
   */
  private miniCaseShown(): boolean {
    if (!this.amuletsUnlocked()) return false;
    if (pactEffects(this.pacts, this.round - 1).amuletsClosed) return false; // сделка №33: амулеты в этом раунде закрыты
    if (this.miniCaseBought >= MINI_CASE_PURCHASES) return false; // обе покупки забега сделаны
    if (this.miniCaseBought > 0 && this.miniCaseShopRound < this.round) return false; // брали в прошлом магазине
    return this.miniCaseOffer.some((amulet) => amulet !== null && this.copiesLeft(amulet) > 0);
  }

  /**
   * Мини-чемодан за фишки (DONTLIKE п.7): два амулета, которых нет в основном (из тех, что ещё можно докупить).
   * Своей панели и окна выбора «за фишки / за билеты» нет: амулет тут сразу стоит в фишках.
   */
  private miniCaseOfferForShop(taken: (Amulet | null)[]): Amulet[] {
    const exclude = taken.filter((amulet): amulet is Amulet => amulet !== null).map((amulet) => amulet.id);
    return randomAmuletOffer(this.amuletIds(), this.upgradeEffects.amuletMaxCopies, MINI_CASE_PLACES, exclude).filter(
      (amulet) => this.copiesLeft(amulet) > 0,
    );
  }

  /**
   * Цены мини-чемодана: амулет за фишки — доля фишек на руках (amulets.miniCasePrice), поэтому цену пересчитывают
   * при каждой покупке. Улучшение №39 делает её вдвое меньше (miniCasePriceMul).
   */
  private miniCasePricesNow(): number[] {
    const price = miniCasePrice(this.balance, this.upgradeEffects.miniCasePriceMul);
    return this.miniCaseOffer.map((amulet) => (amulet ? price : 0));
  }

  /**
   * Клик по месту мини-чемодана — сразу покупка за фишки, без окна выбора валюты (DONTLIKE п.7). До двух амулетов
   * за забег (MINI_CASE_PURCHASES): амулет новый — нужно свободное гнездо, копия — в своё. В магазине, где берут,
   * чемодан остаётся и после первой покупки; в следующем его уже нет (miniCaseShown). Отказ — строкой на панели
   * магазина (над чемоданами), без всплывающих окон; ценник при этом трясётся.
   */
  protected buyFromMiniCase(place: number): void {
    if (!this.amuletsUnlocked()) return;
    if (!this.isShopping || !this.miniCase.isOpen) return; // чемодан ещё закрыт — покупать нечего
    if (this.tutorialBlocks()) return; // идёт текст обучения — покупки ждут
    const amulet = this.miniCaseOffer[place];
    if (!amulet) return;
    if (this.miniCaseBought >= MINI_CASE_PURCHASES) {
      // Обе покупки забега сделаны (или брали в прошлом магазине): обычно сюда не попасть — спрятанного чемодана
      // на панели нет (miniCaseShown), отказ оставлен на случай гонки кликов.
      this.refuseMiniCase(place, t('miniCaseUsed'));
      return;
    }
    if (this.copiesLeft(amulet) <= 0) {
      this.refuseMiniCase(place, t('miniCaseNoCopies'));
      return;
    }
    const socket = this.amulets.findIndex((owned) => owned.id === amulet.id); // гнездо этого амулета; −1 — такого ещё нет
    if (socket < 0 && this.amulets.length >= this.sockets) {
      this.refuseMiniCase(place, t('miniCaseNoSocket')); // гнездо продаётся отдельно за билеты
      return;
    }
    const price = miniCasePrice(this.balance, this.upgradeEffects.miniCasePriceMul);
    if (price > this.balance) {
      this.refuseMiniCase(place, t('miniCaseNoChips'));
      return;
    }
    this.balance -= price; // покупка, не доход: earned не растёт (earn() сюда не зовём)
    this.miniCaseBought += 1; // за забег берут не больше MINI_CASE_PURCHASES
    this.miniCaseShopRound = this.round; // в каком магазине брали: следующий его уже не покажет
    this.purchasesThisVisit += 1; // покупка за заход: сгоревший от сделки амулет — тоже покупка
    this.miniCaseOffer[place] = null;
    const isNew = socket < 0;
    let index = socket;
    if (isNew) {
      index = this.amulets.length;
      this.amulets.push(amulet); // гнездо занято сразу: второй быстрый клик его уже не получит
    }
    addCopy(this.amuletCounts, amulet.id);
    // Сделка №34: следующий купленный амулет сгорает сразу — за фишки он тоже сгорает, фишки не возвращаются.
    // Раньше эта ветка была только в buyAmulet, и мини-чемодан обходил сделку (баг шага 43).
    if (this.pactAmuletBurns) {
      this.pactAmuletBurns = false;
      this.amuletCounts[amulet.id] = Math.max(0, countOf(this.amuletCounts, amulet.id) - 1);
      if (isNew) this.amulets.pop();
      this.sfx.play('burn', 0.2);
      this.shop.announce(t('pactAmuletBurned'));
      // Попытка потрачена: чемодан остаётся только если до второй покупки ещё есть запас (miniCaseShown в refresh).
      this.afterPurchase();
      return;
    }
    const count = countOf(this.amuletCounts, amulet.id); // сколько копий станет после этой покупки
    this.miniCase.sell(place, (x, y) => {
      if (isNew) this.amuletRack.putAmulet(index, amulet, count, x, y);
      else this.amuletRack.putCopy(index, amulet, count, x, y);
      this.showBones();
      // Чемодан не прячем: в этом магазине можно взять второй амулет — прячет его только miniCaseShown
      // (оба куплены, брали в прошлом магазине или предлагать больше нечего).
    });
    this.afterPurchase();
    this.tutorialFirstAmulet(); // первый купленный амулет: короткая реплика Дилера
  }

  /** Отказ мини-чемодана: ценник трясётся, причина — строкой на панели магазина над чемоданами, окно не открывается. */
  private refuseMiniCase(place: number, message: string): void {
    this.sfx.play('deny');
    this.miniCase.deny(place);
    this.shop.announce(message);
  }

  /** Купить гнездо за билеты: с гнезда на корпусе слетает заглушка. Первое гнездо забега — по улучшению №28 бесплатно. */
  private buySocket(): void {
    const price = this.socketPriceNow();
    if (price === null) return; // гнёзд больше не продают
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.miniShop.deny(SOCKET_ROW);
      return;
    }
    const socket = this.sockets; // новое гнездо — следующее по порядку
    this.spendRunTickets(price); // №45 (28г): трата после записи вернётся откатом
    this.sockets += 1;
    this.miniShop.sell(SOCKET_ROW, () => this.amuletRack.openSocket(socket));
    this.afterPurchase();
  }

  // ---------- Барабан ----------

  /**
   * Крутить барабан (клик по колесу или 0): цена уходит с табло, следующая прокрутка вдвое дороже.
   * Какой сектор выпадет, решается сразу; пока колесо крутится, покупать и уходить нельзя (isShopping).
   */
  protected spinDrum(): void {
    if (!this.drumUnlocked()) return;
    if (this.tutorialBlocks()) return; // идёт текст обучения — барабан ждёт
    // Забег кончен или победа ждёт конца действия: колесо за экраном не крутим (winDrum включил бы покупки).
    if (!this.isShopping || this.isGameOver || this.isVictoryPending) return;
    const price = drumPrice(this.drumSpins, this.debt, this.priceMul());
    if (price > this.balance) {
      this.sfx.play('deny');
      this.drum.deny(); // не хватает фишек — ценник трясётся
      return;
    }
    const sector = randomSector(this.drumSectors());
    this.balance -= price;
    this.drumSpins += 1;
    this.purchasesThisVisit += 1; // прокрутка барабана — тоже покупка за заход
    this.isShopping = false;
    this.afterPurchase('chips');
    this.drum.spin(sector, (x, y) => this.winDrum(DRUM_SECTORS[sector], x, y, price));
  }

  /** Какие сектора барабана могут выпасть: предмету нужно свободное место на полке. */
  private drumSectors(): boolean[] {
    const hasFreeSlot = this.shelf.includes(null);
    return DRUM_SECTORS.map((prize) => canWin(prize, hasFreeSlot));
  }

  /** Колесо встало: приз вылетает из сектора (x, y) — предмет на свободное место полки, билет и фишки в шапку панели. paid — цена этой прокрутки: «фишки» выплачивают её ×2. */
  private winDrum(prize: DrumPrize, x: number, y: number, paid: number): void {
    const item = prizeItem(prize);
    if (item) {
      const slot = this.shelf.indexOf(null); // место есть: иначе предмет не мог выпасть
      this.shelf[slot] = item;
      this.itemShelf.putItem(slot, item, x, y);
    } else if (prize === 'ticket') {
      // Билет приходит только когда долетел до шапки: пока идёт анимация, число на табло прежнее (DONTLIKE).
      this.shop.flyTicket(x, y, () => {
        this.tickets += 1;
        this.refreshHud();
      });
    } else {
      const chips = drumChips(paid);
      this.earn(chips); // фишки барабана — доход забега (решение автора)
      this.effects.popupAt(x, y - PRIZE_POPUP_RISE, `+${chips}`, GOLD_TEXT);
      this.drum.payOut(x, y, () => this.shop.pulseChips());
    }
    // Колесо встало — снова можно покупать. Но если фишки барабана взвели победу, покупать нечего:
    // забег кончен или победа ждёт конца действия, панель уже уезжает, и покупки включать нельзя.
    if (!this.isGameOver && !this.isVictoryPending) this.isShopping = true;
    this.afterPurchase(prizeSound(prize));
  }

  /** После покупки (sound — её звук): табло, записка долга и ценники — по новому числу фишек и билетов. */
  private afterPurchase(sound: SoundName = 'buy'): void {
    this.sfx.play(sound);
    this.tooltip.hide();
    this.collector.markNote(this.debt);
    this.refreshHud();
    this.refreshShop();
  }

  /**
   * Ценники: хватает ли фишек и билетов, есть ли место на полке и гнездо, сколько стоят следующие место, гнездо
   * и прокрутка барабана; на колесе затемнены сектора, которые выпасть не могут.
   */
  protected refreshShop(): void {
    // Третий аргумент — цена билета: ряд билетов в торговом автомате живёт по фишкам на руках и покупкам за забег.
    this.shop.refresh(this.balance, this.shelf.includes(null), ticketForChips(this.balance, this.ticketsBought, this.priceMul() * pactEffects(this.pacts, this.round - 1).ticketChipsMul, this.upgradeEffects.ticketShareStart));
    // Амулет в витрине готов, если есть свободное гнездо (для нового) или он уже стоит (копию докупаем в то же гнездо).
    const amuletReady = this.amuletOffer.map((amulet) => {
      if (amulet === null) return false;
      return this.amulets.length < this.sockets || countOf(this.amuletCounts, amulet.id) > 0;
    });
    this.amuletCase.refresh(this.tickets, this.amuletOffer.map((amulet) => (amulet ? this.amuletPriceNow(amulet) : null)), amuletReady);
    // Мини-чемодан (DONTLIKE п.7): цены в фишках пересчитываются от фишек на руках, поэтому идут в каждом refresh.
    // Амулет за фишки уже взят (или предлагать больше нечего) — чемодана на панели нет до конца забега: прячем целиком.
    if (!this.miniCaseShown()) {
      this.miniCase.setAvailable(false);
    } else {
      const miniReady = this.miniCaseOffer.map((amulet) => {
        if (amulet === null) return false;
        return this.amulets.length < this.sockets || countOf(this.amuletCounts, amulet.id) > 0;
      });
      const miniPrices = this.miniCasePricesNow().map((price, place) => (this.miniCaseOffer[place] ? price : null));
      this.miniCase.refresh(this.balance, miniPrices, miniReady);
    }
    this.miniShop.refresh(this.balance, this.tickets, this.slotPriceNow(), this.socketPriceNow());
    const drumCost = drumPrice(this.drumSpins, this.debt, this.priceMul());
    this.drum.showPrice(drumCost, drumCost <= this.balance);
    this.drum.showAvailable(this.drumSectors());
  }

  /**
   * Первый купленный предмет в витрине: реплика Дилера запоминается и прозвучит после закрытия магазина,
   * на экране автомата (не поверх панели). Подарок первого магазина и предмет из барабана сюда не идут — они не покупки.
   * Имя предмета берётся из данных на текущем языке — строки собираются при показе.
   * Дорожка не зависит от того, в каком по счёту магазине покупка: только шаг дорожки решает, говорить ли (баг 25.11).
   */
  private tutorialFirstItem(item: ShopItem): void {
    if (tutorialStep('firstItem') !== 0) return; // реплику уже говорили
    this.pendingFirstItem ??= item; // первый предмет: второй в этом же заходе имя не затирает
  }

  /**
   * Первый купленный амулет: чемодан или мини-чемодан. Сгоревший от сделки №34 сюда не доходит —
   * его ветка выходит раньше, амулета у игрока не осталось. Говорится тоже после закрытия магазина.
   */
  private tutorialFirstAmulet(): void {
    if (tutorialStep('firstAmulet') !== 0) return; // реплику уже говорили
    this.pendingFirstAmulet = true;
  }

  /**
   * Пора ли спросить про пустой магазин: первый заход (закрыт один долг), за заход ничего не куплено,
   * реплику ещё не говорили и обучение не пройдено целиком.
   */
  private shopEmptyTutorialPending(): boolean {
    return !isTutorialDone() && tutorialStep('shopEmpty') === 0 && this.closedDebts() === 1 && this.purchasesThisVisit === 0;
  }

  /**
   * Реплики Дилера после магазина: панель уже уехала, текст идёт на экране автомата, и только потом следующий раунд.
   * Сюда входят первый предмет, первый амулет и вопрос пустого первого магазина — по очереди, без наложения на панель.
   */
  private shopFarewellThen(finish: () => void): void {
    const talks: { lines: readonly TutorialLine[]; track: TutorialTrack }[] = [];
    if (this.pendingFirstItem) talks.push({ lines: firstItemLines(t(this.pendingFirstItem.name)), track: 'firstItem' });
    if (this.pendingFirstAmulet) talks.push({ lines: FIRST_AMULET_LINES, track: 'firstAmulet' });
    if (this.shopEmptyTutorialPending()) talks.push({ lines: SHOP_EMPTY_LINES, track: 'shopEmpty' });
    this.pendingFirstItem = null;
    this.pendingFirstAmulet = false;
    if (talks.length === 0) {
      finish();
      return;
    }
    talks.forEach((talk, index) => {
      this.tutorialSay(talk.lines, () => {
        setTutorialStep(talk.track, 1);
        if (index === talks.length - 1) finish();
      });
    });
  }

  /**
   * Из магазина — назад к игровому автомату: панель уезжает наверх, и начинается новый раунд
   * (в нём автомат может смениться сам — RoundScene.startRound).
   * Панель едет ~480 мс: пока она едет, раунд не начат (isLeavingShop) — победа в этом окне начнёт его сама (continueRun).
   * Пустой первый магазин и реплики о первой покупке: панель уже уехала, и только потом Диллер говорит — текст идёт
   * на экране автомата, а не поверх открытой панели (DONTLIKE, 25.11).
   */
  protected leaveShop(): void {
    // После победы магазин уже закрыт, нового раунда нет; пока панель едет — второй раз не уходим.
    if (!this.isShopping || !this.isShopOpen || this.isLeavingShop || this.isGameOver) return;
    if (this.tutorialBlocks()) return; // идёт текст обучения — выход ждёт его конца
    this.isShopping = false;
    this.isShopOpen = false;
    this.isLeavingShop = true;
    this.tooltip.hide();
    this.miniShop.clear(); // дверца маленького автомата закрывается и на выходе, а не только на входе
    this.sfx.play('turn');
    this.shop.close(() => {
      // Победа могла перехватить выход, пока панель ехала (suspendShop): тогда раунд начнёт «ДАЛЬШЕ».
      if (!this.isLeavingShop) return;
      this.screen.setLampsVisible(true); // лампочки — только когда панель уехала, иначе они на миг видны поверх магазина
      this.shopFarewellThen(() => {
        if (!this.isLeavingShop) return; // победа перехватила и этот миг
        this.isLeavingShop = false;
        this.pumpPopups(); // отложенные ачивки и новости — после магазина и после текста, а не поверх панели
        this.enterNextRound();
      });
    });
  }

  /**
   * Победа застала магазин на экране (идёт барабан, панель уже опущена): покупки закрыты, подсказка убрана,
   * панель уезжает без нового раунда. Вернёт true — «ДАЛЬШЕ» потом доиграет выход из магазина (resumeAfterShop).
   * Панель может и уезжать от leaveShop — тогда её колбэк снимается новым close и раунд начнёт «ДАЛЬШЕ».
   */
  protected suspendShop(): boolean {
    if (!this.isShopOpen && !this.isLeavingShop) return false;
    this.isLeavingShop = false;
    this.isShopOpen = false;
    this.isShopping = false;
    this.tooltip.hide();
    this.miniShop.clear(); // дверца маленького автомата закрывается и на прерванном победой выходе тоже
    this.shop.close(() => {
      this.screen.setLampsVisible(true); // как и в leaveShop: после того, как панель уехала
    });
    return true;
  }

  /** «ДАЛЬШЕ» после победы: магазин, который она прервала, доигрывается — и новый раунд. */
  protected resumeAfterShop(): void {
    this.isShopOpen = false;
    // Реплики о первых покупках, что не успели прозвучать до победы, говорятся здесь — на экране автомата.
    this.shopFarewellThen(() => {
      this.pumpPopups();
      this.enterNextRound();
    });
  }

  /** Панель уехала: начинается новый раунд (leaveShop и «ДАЛЬШЕ» после победы). Автомат мог смениться сам — это в startRound. */
  private enterNextRound(): void {
    // Победа пришла, пока панель ехала: раунд за экраном не начинаем — его начнёт «ДАЛЬШЕ» (continueRun).
    if (this.isGameOver) return;
    this.panel.setPhaseSignsVisible(true); // панели больше нет — знаки фазы 2 снова видны
    this.startRound();
  }
}
