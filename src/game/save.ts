import type { Amulet } from './amulets';
import type { MachineCharacter } from './characters';
import type { Item, ItemEffects } from './items';

/**
 * Кассета — один откат за забег. Её продают в магазине за билеты, и с каждым закрытым долгом она дороже.
 * Купил — уйдёшь из магазина, и кассета запишет забег таким, каким начнётся следующий раунд.
 * Коллектор пришёл, а фишек не хватает, — вставь кассету в видеомагнитофон: забег вернётся к записи, кассета израсходована.
 * Запись живёт только в памяти: закрыл вкладку — забег начнётся заново. Без Phaser.
 */

export const TAPE_PRICE_START = 1; // кассета стоит столько билетов…
export const TAPE_PRICE_STEP = 1; // …и ещё столько за каждый закрытый долг: в первом магазине 2, потом 3, 4…

/** Где кассета: продаётся, куплена (запишет забег, когда уйдёшь из магазина), записана (лежит на видеомагнитофоне) или уже вставлена. */
export type TapeState = 'forSale' | 'bought' | 'recorded' | 'used';

/** Что записано на кассету: забег в начале раунда. */
export interface RunSave {
  round: number;
  debt: number; // долг раунда: после выстрела в автомат он больше обычного
  balance: number;
  tickets: number;
  slots: number;
  shelf: (Item | null)[];
  effects: ItemEffects; // включённые предметы, которые переходят в следующий раунд (щит, ×3)
  sockets: number;
  amulets: Amulet[];
  bones: number;
  roulettes: number; // сколько раз сыграл с Коллектором в рулетку — она одна за забег
  bulletsBought: number; // сколько патронов куплено — от этого их цена
  machine: MachineCharacter; // какой автомат стоит: после выстрела — с характером
  diceDrought: number;
}

/** Цена кассеты в билетах, когда закрыто closedDebts долгов: 2, 3, 4… */
export function tapePrice(closedDebts: number): number {
  return TAPE_PRICE_START + TAPE_PRICE_STEP * closedDebts;
}
