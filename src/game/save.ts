import { ticketPrice, type Amulet, type AmuletCounts } from './amulets';
import type { Pact } from './dealerGame';
import type { MachineId } from './machines';
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
  machineId?: MachineId; // какой автомат стоял на записи; в старых записях поля нет — остаётся текущий
  pacts?: Pact[]; // сделки Дилера с их сроком (dealerGame.Pact); в старых записях поля нет — считаем, что сделок нет
  debtNextMul?: number; // сделка №12: следующий долг дороже во столько раз (1 — обычный); в старых записях поля нет
  diceDrought: number;
  patterns?: string[]; // какие паттерны были открыты на момент записи: откат возвращает стекло как на плёнке
  secondWindLeft?: number; // сколько «вторых дыханий» осталось; в старых записях поля нет — secondWindUsed
  secondWindUsed?: boolean; // старые записи: дыхание уже потрачено; новые пишут счётчик, но чтение терпит и флаг
  breathTaken?: boolean; // сделка №9 «+1 запас дыхания» уже бралась в этом забеге; откат этой памяти не снимает
  insuranceSaves?: number; // сколько раз страховка сработала в этом раунде; в старых записях поля нет — считаем 0
  devUsed?: boolean; // забег трогали во вкладке «ТЕСТ» до записи: откат этого не забывает, рекорд фишек не пишется; в старых записях поля нет — считаем, что нет
}

/** Цена кассеты в билетах, когда за забег уже куплено bought кассет: 2, 3, 4… mul — скидка магазина (сделка №2). */
export function tapePrice(bought: number, mul = 1): number {
  return ticketPrice(TAPE_PRICE_START + TAPE_PRICE_STEP * bought, mul);
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

/**
 * Множитель следующего долга с кассеты (сделка №12 «следующий долг +20%»). В старых записях поля нет — 1.
 * Не число, NaN, 0 и минус — 1: испорченное поле не должно обнулить или опрокинуть долг.
 */
export function debtNextMulOf(record: { debtNextMul?: unknown }): number {
  const mul = record.debtNextMul;
  if (typeof mul !== 'number' || !Number.isFinite(mul) || mul <= 0) return 1;
  return mul;
}

/** Сколько «вторых дыханий» у забега без сделок Дилера: одно, как было до счётчика (DONTLIKE б.12). */
export const SECOND_WIND_START = 1;

/**
 * Сколько «вторых дыханий» осталось по записи. Новые плёнки пишут счётчик (secondWindLeft), старые — флаг
 * secondWindUsed: потрачен → 0, поля нет или флаг снят → SECOND_WIND_START. Дробное вниз, мусор — к флагу.
 * Чтение нарочно терпимое: потолок (SECOND_WIND_MAX) ставит сцена в loadTape — save.ts про него не знает.
 */
export function secondWindLeftOf(record: { secondWindLeft?: unknown; secondWindUsed?: unknown }): number {
  const left = record.secondWindLeft;
  if (typeof left === 'number' && Number.isFinite(left)) return Math.max(0, Math.floor(left));
  return record.secondWindUsed === true ? 0 : SECOND_WIND_START;
}
