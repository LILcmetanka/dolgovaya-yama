import { amuletPrice, randomAmuletOffer, socketPrice, ticketPrice } from '../amulets';
import { characterDebt } from '../characters';
import { canWin, DRUM_SECTORS, drumChips, drumPrice, prizeItem, randomSector, type DrumPrize } from '../drum';
import { itemPrice, MAX_SLOTS, randomOffer, slotPrice } from '../items';
import { debtForRound } from '../rules';
import { debtAfterShot } from '../shot';
import type { SoundName } from '../sound';
import { GOLD_TEXT } from '../theme';
import { SOCKET_PLACE, TICKET_PLACE } from '../parts/amuletCase';
import { SLOT_ROW } from '../parts/shop';
import { DealerScene } from './DealerScene';

const PRIZE_POPUP_RISE = 20; // «+N» за фишки из барабана всплывает чуть выше сектора

/** Звук приза барабана: билет шелестит, фишки стучат, предмет и место на полке — как предмет. */
function prizeSound(prize: DrumPrize): SoundName {
  if (prize === 'ticket' || prize === 'chips') return prize;
  return 'item';
}

/**
 * Слой магазина: после расплаты вид поворачивается влево. В торговом автомате — предметы и место на полке за фишки,
 * в витрине над ним — амулеты и гнездо за билеты и билет за фишки, справа на стене — «барабан» за фишки.
 * Ушёл из магазина — новый раунд.
 */
export abstract class ShopScene extends DealerScene {
  /**
   * Долг отдан (или пропущен выстрелом в автомат — isAfterShot: тогда следующий долг ×1,5): на записке следующий долг
   * (записка переворачивается), вид поворачивается к магазину. Иначе долг — как на этом автомате: на Счастливом он больше.
   */
  protected openShop(isAfterShot = false): void {
    this.round += 1;
    const debt = debtForRound(this.round);
    this.debt = isAfterShot ? debtAfterShot(debt) : characterDebt(debt, this.machine);
    this.updateRecord();
    this.collector.flipNote(this.debt, this.hasEnoughForDebt());
    const offer = randomOffer();
    this.offer = offer;
    const amuletOffer = randomAmuletOffer(this.amuletIds());
    this.amuletOffer = amuletOffer;
    this.isTicketForSale = true;
    this.drumSpins = 0; // в новом магазине барабан снова дешёвый
    this.amuletCase.fill({
      amulets: amuletOffer,
      amuletPrices: amuletOffer.map(amuletPrice),
      ticketPrice: ticketPrice(this.debt),
      socketPrice: socketPrice(this.sockets),
    });
    const prices = offer.map((item) => itemPrice(item, this.debt)); // цены — доля нового долга
    this.sfx.play('turn');
    this.shop.open(offer, prices, slotPrice(this.slots, this.debt), () => {
      this.isShopping = true;
      this.refreshShop();
    });
  }

  /** Купить ряд торгового автомата row: предмет — на свободное место полки, нижний ряд — ещё одно место. */
  protected buy(row: number): void {
    if (!this.isShopping) return;
    if (row === SLOT_ROW) this.buySlot();
    else this.buyItem(row);
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
    this.shop.sell(row, (x, y) => this.itemShelf.putItem(slot, item, x, y));
    this.afterPurchase();
  }

  /** Купить место на полке: с новой клетки слетают доски. */
  private buySlot(): void {
    const price = slotPrice(this.slots, this.debt);
    if (price === null) return; // мест больше не продают
    if (price > this.balance) {
      this.sfx.play('deny');
      this.shop.deny(SLOT_ROW);
      return;
    }
    this.balance -= price;
    const slot = this.addSlot();
    this.shop.sell(SLOT_ROW, () => this.itemShelf.openSlot(slot));
    this.afterPurchase();
  }

  /** Ещё одно место на полке — следующая клетка за открытыми; вернуть её номер. Доски с неё снимает itemShelf.openSlot. */
  private addSlot(): number {
    this.slots += 1;
    this.shelf.push(null);
    return this.slots - 1;
  }

  /** Купить место витрины амулетов: амулет, билет за фишки или гнездо. */
  protected buyFromCase(place: number): void {
    if (!this.isShopping) return;
    if (place === TICKET_PLACE) this.buyTicket();
    else if (place === SOCKET_PLACE) this.buySocket();
    else this.buyAmulet(place);
  }

  /** Купить амулет за билеты: он летит из витрины в следующее свободное гнездо и действует со следующей прокрутки. */
  private buyAmulet(place: number): void {
    const amulet = this.amuletOffer[place];
    if (!amulet) return;
    const price = amuletPrice(amulet);
    if (price > this.tickets || this.amulets.length >= this.sockets) {
      this.sfx.play('deny');
      this.amuletCase.deny(place); // не хватает билетов или нет свободного гнезда — ценник трясётся
      return;
    }
    const socket = this.amulets.length; // гнёзда заполняются по порядку
    this.tickets -= price;
    this.amulets.push(amulet);
    this.amuletOffer[place] = null;
    this.amuletCase.sell(place, (x, y) => {
      this.amuletRack.putAmulet(socket, amulet, x, y);
      this.showBones();
    });
    this.afterPurchase();
  }

  /** Купить билет за фишки (один за посещение): он летит из витрины на табло. */
  private buyTicket(): void {
    if (!this.isTicketForSale) return;
    const price = ticketPrice(this.debt);
    if (price > this.balance) {
      this.sfx.play('deny');
      this.amuletCase.deny(TICKET_PLACE);
      return;
    }
    this.balance -= price;
    this.tickets += 1;
    this.isTicketForSale = false;
    this.amuletCase.sell(TICKET_PLACE, (x, y) => this.panel.flyTickets(1, x, y));
    this.afterPurchase();
  }

  /** Купить гнездо за билеты: с гнезда на корпусе слетает заглушка. */
  private buySocket(): void {
    const price = socketPrice(this.sockets);
    if (price === null) return; // гнёзд больше не продают
    if (price > this.tickets) {
      this.sfx.play('deny');
      this.amuletCase.deny(SOCKET_PLACE);
      return;
    }
    const socket = this.sockets; // новое гнездо — следующее по порядку
    this.tickets -= price;
    this.sockets += 1;
    this.amuletCase.sell(SOCKET_PLACE, () => this.amuletRack.openSocket(socket));
    this.afterPurchase();
  }

  // ---------- Барабан ----------

  /**
   * Крутить барабан (клик по колесу или 0): цена уходит с табло, следующая прокрутка вдвое дороже.
   * Какой сектор выпадет, решается сразу; пока колесо крутится, покупать и уходить нельзя (isShopping).
   */
  protected spinDrum(): void {
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
    this.drum.spin(sector, (x, y) => this.winDrum(DRUM_SECTORS[sector], x, y));
  }

  /** Какие сектора барабана могут выпасть: предмету нужно свободное место на полке, месту — чтобы полки ещё не были полными. */
  private drumSectors(): boolean[] {
    const hasFreeSlot = this.shelf.includes(null);
    const canAddSlot = this.slots < MAX_SLOTS;
    return DRUM_SECTORS.map((prize) => canWin(prize, hasFreeSlot, canAddSlot));
  }

  /** Колесо встало: приз вылетает из сектора (x, y) — предмет на свободное место полки, билет и фишки на табло, место — доски слетают. */
  private winDrum(prize: DrumPrize, x: number, y: number): void {
    const item = prizeItem(prize);
    if (item) {
      const slot = this.shelf.indexOf(null); // место есть: иначе предмет не мог выпасть
      this.shelf[slot] = item;
      this.itemShelf.putItem(slot, item, x, y);
    } else if (prize === 'ticket') {
      this.tickets += 1;
      this.panel.flyTickets(1, x, y);
    } else if (prize === 'slot') {
      this.itemShelf.openSlot(this.addSlot());
    } else {
      const chips = drumChips(this.debt);
      this.balance += chips;
      this.effects.popupAt(x, y - PRIZE_POPUP_RISE, `+${chips}`, GOLD_TEXT);
      this.drum.payOut(x, y, () => this.panel.pulseBoard());
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
    this.shop.refresh(this.balance, this.shelf.includes(null), slotPrice(this.slots, this.debt));
    this.amuletCase.refresh(this.balance, this.tickets, this.amulets.length < this.sockets, socketPrice(this.sockets));
    const drumCost = drumPrice(this.drumSpins, this.debt);
    this.drum.showPrice(drumCost, drumCost <= this.balance);
    this.drum.showAvailable(this.drumSectors());
  }

  /** Из магазина — назад к игровому автомату, и новый раунд. */
  protected leaveShop(): void {
    if (!this.isShopping) return;
    this.isShopping = false;
    this.tooltip.hide();
    this.sfx.play('turn');
    this.shop.close(() => this.startRound());
  }
}
