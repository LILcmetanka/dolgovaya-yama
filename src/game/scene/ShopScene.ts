import { addCopy, amuletPrice, countOf, randomAmuletOffer, socketPrice } from '../amulets';
import { amuletKey, itemKey, see, WHO_COLLECTOR } from '../codex';
import { canWin, DRUM_SECTORS, drumChips, drumPrice, prizeItem, randomSector, type DrumPrize } from '../drum';
import { itemPrice, MAX_SLOTS, offerReplacement, randomOffer, slotPrice, type ShopItem } from '../items';
import {
  copyMachineState,
  isSameMachine,
  machineItemAllowed,
  machineUpgradePrice,
  newMachineState,
  upgradedMachine,
  MACHINES,
  type MachineBranch,
  type MachineId,
  type MachineState,
} from '../machines';
import { debtForRound } from '../rules';
import type { SoundName } from '../sound';
import { GOLD_TEXT } from '../theme';
import type { MachineRow } from '../parts/machinePicker';
import { SLOT_ROW, SOCKET_ROW } from '../parts/miniShop';
import { DealerScene } from './DealerScene';

const PRIZE_POPUP_RISE = 20; // «+N» за фишки из барабана всплывает чуть выше сектора

/** Звук приза барабана: билет шелестит, фишки стучат, предмет и место на полке — как предмет. */
function prizeSound(prize: DrumPrize): SoundName {
  if (prize === 'ticket' || prize === 'chips') return prize;
  return 'item';
}

/**
 * Слой магазина: после расплаты сверху съезжает панель магазина (как жалюзи) и закрывает комнату. В торговом автомате —
 * предметы за фишки, в маленьком автомате рядом — место на полке за фишки и гнездо за билеты, в витрине над торговым —
 * амулеты за билеты, справа на панели — «барабан» за фишки, кассета и выбор автомата с прокачкой.
 * Что открыто, решают закрытые долги (amuletsUnlocked и остальные): части показывают себя через setAvailable.
 * Ушёл из магазина — панель уезжает наверх, выбранный автомат встаёт на место, и новый раунд.
 */
export abstract class ShopScene extends DealerScene {
  // Какой автомат выбран в этом магазине и встанет на место в leaveShop — со следующего раунда.
  // Сами уровни всех трёх — в записи забега (BaseScene.machineStates): их не теряет ни примерка, ни выход из магазина.
  private machineNextId: MachineId = 'classic';
  // Каким автомат был на входе в магазин: по нему видно, показывать ли новый автомат после выхода.
  private machineAtEntry: MachineState = newMachineState();

  /**
   * Долг отдан (или пропущен): на записке следующий долг (записка переворачивается), сверху съезжает панель магазина.
   * Выбор автомата начинается с того, что стоит сейчас; другой автомат приходит с первого уровня.
   */
  protected openShop(): void {
    this.round += 1;
    this.debt = debtForRound(this.round);
    this.machineNextId = this.machineId; // начинаем с того, что стоит
    this.machineAtEntry = copyMachineState(this.machineState);
    this.updateRecord();
    this.collector.flipNote(this.debt, this.hasEnoughForDebt());
    // Оффер — под автомат, который будет играть этот раунд: «Удача» у «Тихого» бесполезна (клевера нет).
    const offer = randomOffer(this.round, (item) => machineItemAllowed(this.machineStates[this.machineNextId], item));
    this.offer = offer;
    // Чемодан открыт — витрина амулетов новая; закрыт — в магазине амулетов нет вовсе.
    const isAmulets = this.amuletsUnlocked();
    const amuletOffer = isAmulets ? randomAmuletOffer(this.amuletIds()) : [];
    this.amuletOffer = amuletOffer;
    this.seeInShop(offer.map((item) => itemKey(item.id)), amuletOffer.map((amulet) => amuletKey(amulet.id)));
    this.drumSpins = 0; // в новом магазине барабан снова дешёвый
    const prices = offer.map((item) => itemPrice(item, this.debt)); // цены — доля нового долга
    // Что открыто — по закрытым долгам: раунд уже увеличен, поэтому предикаты дают счёт этого магазина.
    this.amuletCase.setAvailable(isAmulets);
    this.drum.setAvailable(this.drumUnlocked());
    this.cassette.setAvailable(this.cassetteUnlocked());
    // Панель поехала: чемодан и маленький автомат прошлого захода сразу пусты, цены на панели — уже от нового долга.
    if (isAmulets) this.amuletCase.clear();
    this.miniShop.clear();
    this.panel.setPhaseSignsVisible(false); // знаки фазы 2 поверх панели магазина торчать не должны
    this.sfx.play('turn');
    this.shop.open(offer, prices, () => {
      // Панель опустилась: только теперь можно покупать, а чемодан наполняется уже на ней.
      this.isShopping = true;
      this.miniShop.open();
      if (isAmulets) this.amuletCase.fill({ amulets: amuletOffer, amuletPrices: amuletOffer.map(amuletPrice) });
      this.refreshShop();
    });
    this.refreshShop(); // пока панель едет: цены барабана и рядов — новые, прошлый заход не мелькает
  }

  /** В магазине показали предметы и амулеты (и Коллектор уже приходил): всё это теперь на экране на стене; впервые — там мигает «NEW». */
  private seeInShop(...keys: string[][]): void {
    const isNew = [WHO_COLLECTOR, ...keys.flat()].map(see).some(Boolean); // see — для каждого ключа, поэтому без короткого замыкания
    if (isNew) this.monitor.notify('new');
  }

  /** Купить ряд торгового автомата row: предмет — на свободное место полки. */
  protected buy(row: number): void {
    if (!this.isShopping) return;
    this.buyItem(row);
  }

  /** Купить ряд маленького автомата row: место на полке или гнездо амулета. */
  protected buyMini(row: number): void {
    if (!this.isShopping) return;
    if (row === SLOT_ROW) this.buySlot();
    else this.buySocket();
  }

  /** Купить предмет: фишки уходят с табло, предмет падает в лоток и летит на свободное место полки. */
  private buyItem(row: number): void {
    const item = this.offer[row];
    if (!item) return;
    const price = itemPrice(item, this.debt);
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
    this.shop.sell(row, (x, y) => {
      this.itemShelf.putItem(slot, item, x, y);
      this.refillRow(row, item);
    });
    this.afterPurchase();
  }

  /**
   * Купили предмет — в его ряду появляется другой из пула (не тот, что купили, и не тот, что стоит в других рядах):
   * витрина не пустеет за заход. Появляется, когда покупка уже упала в лоток, с той же анимацией появления;
   * остальные ряды не трогаются.
   */
  private refillRow(row: number, bought: ShopItem): void {
    if (!this.isShopping) return; // ушли из магазина, пока покупка падала
    const item = offerReplacement([...this.offer, bought], this.round, (next) => machineItemAllowed(this.machineStates[this.machineNextId], next));
    if (!item) return; // в пуле больше нет предметов — ряд остаётся пустым
    this.offer[row] = item;
    this.shop.refill(row, item, itemPrice(item, this.debt));
    see(itemKey(item.id)); // новый предмет уже встречен — во вкладке «Предметы» он не «???»
    this.refreshShop();
  }

  /** Купить место на полке: с новой клетки слетают доски. */
  private buySlot(): void {
    const price = slotPrice(this.slots, this.debt);
    if (price === null) return; // мест больше не продают
    if (price > this.balance) {
      this.sfx.play('deny');
      this.miniShop.deny(SLOT_ROW);
      return;
    }
    this.balance -= price;
    const slot = this.addSlot();
    this.miniShop.sell(SLOT_ROW, () => this.itemShelf.openSlot(slot));
    this.afterPurchase();
  }

  /** Ещё одно место на полке — следующая клетка за открытыми; вернуть её номер. Доски с неё снимает itemShelf.openSlot. */
  private addSlot(): number {
    this.slots += 1;
    this.shelf.push(null);
    return this.slots - 1;
  }

  /** Купить место чемодана с амулетами: в витрине только амулеты за билеты. */
  protected buyFromCase(place: number): void {
    if (!this.amuletsUnlocked()) return;
    if (!this.isShopping || !this.amuletCase.isOpen) return; // чемодан ещё закрыт — покупать нечего
    this.buyAmulet(place);
  }

  /** Купить амулет за билеты: он летит из витрины в гнездо. Новый амулет — в свободное гнездо, копия уже стоящего — в его гнездо. */
  private buyAmulet(place: number): void {
    const amulet = this.amuletOffer[place];
    if (!amulet) return;
    if (countOf(this.amuletCounts, amulet.id) >= amulet.maxCopies) {
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
    const price = amuletPrice(amulet);
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.amuletCase.deny(place); // не хватает билетов — ценник трясётся
      return;
    }
    this.tickets -= price;
    this.amuletOffer[place] = null;
    const isNew = socket < 0;
    let index = socket;
    if (isNew) {
      index = this.amulets.length;
      this.amulets.push(amulet); // гнездо занято сразу: второй быстрый клик его уже не получит
    }
    addCopy(this.amuletCounts, amulet.id);
    const count = countOf(this.amuletCounts, amulet.id); // сколько копий станет после этой покупки
    this.amuletCase.sell(place, (x, y) => {
      // Гнездо за панелью: амулет гаснет, пройдя первые ~200 px к нему, — будто уходит за жалюзи, а не летит через витрину.
      if (isNew) this.amuletRack.putAmulet(index, amulet, count, x, y); // анимация — только когда амулет долетел
      else this.amuletRack.putCopy(index, amulet, count, x, y);
      this.showBones();
    });
    this.afterPurchase();
  }

  /** Купить гнездо за билеты: с гнезда на корпусе слетает заглушка. */
  private buySocket(): void {
    const price = socketPrice(this.sockets);
    if (price === null) return; // гнёзд больше не продают
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.miniShop.deny(SOCKET_ROW);
      return;
    }
    const socket = this.sockets; // новое гнездо — следующее по порядку
    this.tickets -= price;
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
    if (!this.isShopping) return;
    const price = drumPrice(this.drumSpins, this.debt);
    if (price > this.balance) {
      this.sfx.play('deny');
      this.drum.deny(); // не хватает фишек — ценник трясётся
      return;
    }
    const sector = randomSector(this.drumSectors());
    this.balance -= price;
    this.drumSpins += 1;
    this.isShopping = false;
    this.afterPurchase('chips');
    this.drum.spin(sector, (x, y) => this.winDrum(DRUM_SECTORS[sector], x, y, price));
  }

  /** Какие сектора барабана могут выпасть: предмету нужно свободное место на полке, месту — чтобы полки ещё не были полными. */
  private drumSectors(): boolean[] {
    const hasFreeSlot = this.shelf.includes(null);
    const canAddSlot = this.slots < MAX_SLOTS;
    return DRUM_SECTORS.map((prize) => canWin(prize, hasFreeSlot, canAddSlot));
  }

  /** Колесо встало: приз вылетает из сектора (x, y) — предмет на свободное место полки, билет и фишки в шапку панели, место — доски слетают. paid — цена этой прокрутки: «фишки» выплачивают её ×2. */
  private winDrum(prize: DrumPrize, x: number, y: number, paid: number): void {
    const item = prizeItem(prize);
    if (item) {
      const slot = this.shelf.indexOf(null); // место есть: иначе предмет не мог выпасть
      this.shelf[slot] = item;
      this.itemShelf.putItem(slot, item, x, y);
    } else if (prize === 'ticket') {
      this.tickets += 1;
      this.shop.flyTicket(x, y);
    } else if (prize === 'slot') {
      this.itemShelf.openSlot(this.addSlot());
    } else {
      const chips = drumChips(paid);
      this.balance += chips;
      this.effects.popupAt(x, y - PRIZE_POPUP_RISE, `+${chips}`, GOLD_TEXT);
      this.drum.payOut(x, y, () => this.shop.pulseChips());
    }
    this.isShopping = true; // колесо встало — снова можно покупать
    this.afterPurchase(prizeSound(prize));
  }

  /** После покупки (sound — её звук): табло, галочка на записке и ценники — по новому числу фишек и билетов. */
  private afterPurchase(sound: SoundName = 'buy'): void {
    this.sfx.play(sound);
    this.tooltip.hide();
    this.collector.markNote(this.debt, this.hasEnoughForDebt());
    this.refreshHud();
    this.refreshShop();
  }

  /**
   * Ценники: хватает ли фишек и билетов, есть ли место на полке и гнездо, сколько стоят следующие место, гнездо
   * и прокрутка барабана; на колесе затемнены сектора, которые выпасть не могут.
   */
  protected refreshShop(): void {
    this.shop.refresh(this.balance, this.shelf.includes(null));
    // Амулет в витрине готов, если есть свободное гнездо (для нового) или он уже стоит (копию докупаем в то же гнездо).
    const amuletReady = this.amuletOffer.map((amulet) => amulet !== null && (this.amulets.length < this.sockets || countOf(this.amuletCounts, amulet.id) > 0));
    this.amuletCase.refresh(this.tickets, amuletReady);
    this.miniShop.refresh(this.balance, this.tickets, slotPrice(this.slots, this.debt), socketPrice(this.sockets));
    const drumCost = drumPrice(this.drumSpins, this.debt);
    this.drum.showPrice(drumCost, drumCost <= this.balance);
    this.drum.showAvailable(this.drumSectors());
    this.machinePicker.show(this.machineRows(), this.tickets);
  }

  // ---------- Автомат: выбор и прокачка ----------

  /** Строки выбора: у каждого автомата свой уровень и ветка из записи забега. */
  private machineRows(): MachineRow[] {
    return MACHINES.map((spec) => {
      const state = this.machineStates[spec.id];
      return {
        id: spec.id,
        level: state.level,
        branch: state.branch,
        price: machineUpgradePrice(state),
        selected: spec.id === this.machineNextId,
      };
    });
  }

  /**
   * Выбрали автомат: это бесплатно, уровни всех трёх остаются в записи забега — прокачал, примерил другой,
   * вернулся, уровень цел. Встанет на место со следующего раунда (leaveShop).
   */
  protected pickMachine(id: MachineId): void {
    if (!this.isShopping || id === this.machineNextId) return;
    this.machineNextId = id;
    this.sfx.play('item');
    this.swapBannedOffers(); // у нового автомата витрина без того, что ему не подходит
    this.refreshShop();
  }

  /**
   * Сменили автомат: предметы, которые ему бесполезны («Удача» у «Тихого» — клевера там нет), заменяются другими
   * в своих рядах, как после покупки. Ряд не трогаем, только если в пуле совсем ничего не осталось.
   */
  private swapBannedOffers(): void {
    const state = this.machineStates[this.machineNextId];
    this.offer.forEach((item, row) => {
      if (!item || machineItemAllowed(state, item)) return;
      const replacement = offerReplacement(this.offer, this.round, (next) => machineItemAllowed(state, next));
      if (!replacement) return; // других предметов в пуле нет — ряд остаётся как есть
      this.offer[row] = replacement;
      this.shop.refill(row, replacement, itemPrice(replacement, this.debt));
      see(itemKey(replacement.id)); // новый предмет уже встречен — во вкладке «Предметы» он не «???»
    });
  }

  /** Прокачать выбранный автомат за билеты: ур.1→2 — 1 билет, ур.2→3 — 3. Не хватает — тряска его строки. */
  protected upgradeMachine(id: MachineId): void {
    if (!this.isShopping) return;
    if (id !== this.machineNextId) return; // ценник — только у выбранной строки
    const state = this.machineStates[id];
    const price = machineUpgradePrice(state);
    if (price === null) return; // последний уровень: прокачивать некуда
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.machinePicker.deny(id);
      return;
    }
    this.tickets -= price;
    const upgraded = upgradedMachine(state);
    // Третий уровень без ветки — это покупка без бонуса: ставим ветку черепа, другую игрок выберет кнопкой.
    this.machineStates[id] = upgraded.level === 3 && upgraded.branch === null ? { ...upgraded, branch: 'skull' } : upgraded;
    this.afterPurchase(); // билеты ушли: табло, ценники, строки выбора
  }

  /** Ветка третьего уровня: что автомат даёт сверх выплат. Выбор бесплатный, можно менять до ухода из магазина. */
  protected chooseMachineBranch(branch: MachineBranch): void {
    const state = this.machineStates[this.machineNextId];
    if (!this.isShopping || state.level < 3 || state.branch === branch) return;
    state.branch = branch;
    this.sfx.play('item');
    this.refreshShop();
  }

  /**
   * Из магазина — назад к игровому автомату: панель уезжает наверх, выбранный автомат встаёт на место
   * (эффекты его уровня — со следующего раунда), и начинается новый раунд.
   */
  protected leaveShop(): void {
    if (!this.isShopping) return;
    this.isShopping = false;
    this.tooltip.hide();
    this.sfx.play('turn');
    const next = this.machineStates[this.machineNextId];
    const isChanged = !isSameMachine(this.machineAtEntry, next); // уровень мог смениться у того же автомата
    this.machineId = this.machineNextId; // запись забега общая: уровень уже в ней, копировать нечего
    this.shop.close(() => {
      this.panel.setPhaseSignsVisible(true); // панели больше нет — знаки фазы 2 снова видны
      if (isChanged) this.showNewMachine(); // корпус, значок и новость на стекле — новый автомат или новый уровень
      this.startRound();
    });
  }
}
