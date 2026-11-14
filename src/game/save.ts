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
  luckyClovers: number; // сколько клеверов висело на сетке: от этого числа удача выбирает паттерн
  roundShields: number; // сколько черепов ещё отобьёт бронежилет в этом раунде
  isDebtNewsShown: boolean;
  debt: number; // долг этого раунда (на Счастливом автомате он больше обычного)
  balance: number;
  earned?: number; // сколько игра отдала за забег на момент записи: цель забега тоже откатывается кассетой
  chipGoal?: number; // какая ступень цели была на записи (1 000 000 или 10 000 000 после «ДАЛЬШЕ»); в старых записях поля нет
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
  patterns?: string[]; // какие паттерны были открыты на момент записи: откат возвращает стекло как на плёнке
  secondWindUsed?: boolean; // «второе дыхание» уже потрачено; в старых записях поля нет — считаем, что нет
  insuranceUsed?: boolean; // страховка уже сработала в этом раунде; в старых записях поля нет — считаем, что нет
}

/** Цена кассеты в билетах, когда за забег уже куплено bought кассет: 2, 3, 4… */
export function tapePrice(bought: number): number {
  return TAPE_PRICE_START + TAPE_PRICE_STEP * bought;
}

/**
 * Сколько клеверов висело на момент записи. Кассета не сериализуется: запись передаётся в `scene.restart`
 * параметром и применяется в `loadTape`, а сама кассета сбрасывается `resetState`; после перезагрузки страницы
 * кассеты нет — поэтому старого формата не бывает, на чтении только проверка счётчика.
 * Дробное округляем вниз, не число/NaN/Infinity/≤0 — ноль, иначе степень в весе паттерна дала бы NaN или минус.
 */
export function luckyCloversOf(record: { luckyClovers?: unknown }): number {
  const clovers = record.luckyClovers;
  if (typeof clovers !== 'number' || !Number.isFinite(clovers) || clovers <= 0) return 0;
  return Math.floor(clovers);
}
