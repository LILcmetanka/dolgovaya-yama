import type { Amulet, AmuletCounts } from './amulets';
import type { MachineSet, MachineState } from './machines';
import type { Item, ItemEffects } from './items';

/**
 * Кассета — откат к записи (шаг 45). Её продают в магазине за билеты: первая стоит 2, каждая следующая на билет дороже.
 * Купил — кассета ложится в отделение REC видеомагнитофона. Между прокрутками у автомата нажми на неё — она запишет всё как есть
 * (посреди раунда тоже); переписать нельзя. Запись переезжает в отделение PLAY. Нажми на неё между прокрутками
 * (у Коллектора и в последнем шансе уже поздно) — забег вернётся к записи, а автомат съест кассету: в магазине можно купить новую.
 * Запись живёт только в памяти: закрыл вкладку — забег начнётся заново. Без Phaser.
 */

export const TAPE_PRICE_START = 2; // первая кассета стоит столько билетов…
export const TAPE_PRICE_STEP = 1; // …и каждая следующая — на столько дороже: 2, 3, 4… (от долгов цена не зависит)

/** Где кассета: продаётся, чистая (лежит в REC видеомагнитофона) или записана (лежит в PLAY). Съеденную автоматом снова продают. */
export type TapeState = 'forSale' | 'blank' | 'recorded';

/** Что записано на кассету: забег как есть, в том числе посреди раунда. */
export interface RunSave {
  round: number;
  spinsLeft: number;
  pot: number;
  streak: number;
  isBloodNext: boolean;
  isLuckyNext: boolean;
  roundShields: number; // сколько черепов ещё отобьёт бронежилет в этом раунде
  isDebtNewsShown: boolean;
  debt: number; // долг этого раунда (на Счастливом автомате он больше обычного)
  balance: number;
  tickets: number;
  slots: number;
  shelf: (Item | null)[];
  effects: ItemEffects; // включённые предметы: щит и ×3 переходят в следующий раунд, бусты символов — нет (копия — copyEffects)
  sockets: number;
  amulets: Amulet[]; // уникальные амулеты по гнёздам
  amuletCounts: AmuletCounts; // сколько копий каждого амулета (шаг 62б: копии не занимают гнёзда)
  bones: number;
  machine?: MachineState; // какой автомат стоит и как прокачан; в старых записях поля нет — тогда классический
  machineSet?: MachineSet; // все три автомата с уровнями и ветками: прокачка живёт весь забег, а не один магазин
  diceDrought: number;
  secondWindUsed?: boolean; // «второе дыхание» уже потрачено; в старых записях поля нет — считаем, что нет
  insuranceUsed?: boolean; // страховка уже сработала в этом раунде; в старых записях поля нет — считаем, что нет
}

/** Цена кассеты в билетах, когда за забег уже куплено bought кассет: 2, 3, 4… */
export function tapePrice(bought: number): number {
  return TAPE_PRICE_START + TAPE_PRICE_STEP * bought;
}
