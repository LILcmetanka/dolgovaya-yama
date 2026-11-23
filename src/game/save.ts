import { ticketPrice, type Amulet, type AmuletCounts } from './amulets';
import type { Pact } from './dealerGame';
import type { MachineId } from './machines';
import type { Item, ItemEffects } from './items';

/**
 * Кассета — откат к записи (шаг 45). Её продают в магазине за билеты: первая стоит 2, каждая следующая на билет дороже.
 * Купил — кассета ложится в отделение REC видеомагнитофона. Между прокрутками у автомата нажми на неё — она запишет всё как есть
 * (посреди раунда тоже); переписать нельзя. Запись переезжает в отделение PLAY. Нажми на неё между прокрутками
 * (у Коллектора и в спасении уже поздно) — забег вернётся к записи, а автомат съест кассету: в магазине можно купить новую.
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
  // Второго дыхания больше нет (шаг 34): провал спасения — сразу KABOOM. Старые плёнки могли записать
  // secondWindLeft/secondWindUsed — поля больше не объявлены и просто игнорируются при чтении, формат не ломается.
  insuranceSaves?: number; // сколько раз страховка сработала в этом раунде; в старых записях поля нет — считаем 0
  devUsed?: boolean; // забег трогали во вкладке «ТЕСТ» до записи: откат этого не забывает, рекорд фишек не пишется; в старых записях поля нет — считаем, что нет
  rescueUsed?: boolean; // спасение в этом забеге уже было: второе не прощают; откат кассетой флаг не снимает; в старых записях поля нет — считаем, что не было
  deferUsed?: boolean; // улучшение №10 «отсрочка» в этом забеге уже потрачено (шаг 28); тоже липкое; в старых записях поля нет — считаем, что нет
  amuletChipUsed?: boolean; // мини-чемодан за фишки (DONTLIKE п.7): амулет за фишки уже брали; липкое, откат не возвращает
  freeGiftGiven?: boolean; // улучшение №40 (28в): подарок первого магазина уже выдан; липкое, откат второй не даёт
  skullCancelUsed?: boolean; // улучшение №50 (28г): отмена черепа уже потрачена; липкая, откат вторую не даёт
  pactAmuletBurns?: boolean; // сделка №34: следующий купленный амулет сгорит; едет с плёнкой, иначе откат снимал бы сделку
  startSymbol?: string; // улучшение №33 (28в): выбранный первый символ забега
  startGridGiven?: boolean; // первая сетка уже получила джокера (№32) и выбранный символ (№33)
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

/**
 * Липкий флаг «отсрочка уже была» (улучшение №10, шаг 28): откат кассетой его не снимает — иначе перемотка
 * возвращала бы отсрочку каждый забег. Устроен как rescueUsedOf: текущий OR с плёнкой, старой плёнке без поля — нет.
 */
export function deferUsedOf(record: { deferUsed?: unknown }, current = false): boolean {
  return current || record.deferUsed === true;
}

/**
 * Липкий флаг «амулет за фишки уже брали» (мини-чемодан, DONTLIKE п.7): откат кассетой не возвращает вторую покупку.
 * Как deferUsedOf: текущий OR с плёнкой, старой плёнке без поля — «не было».
 */
export function amuletChipUsedOf(record: { amuletChipUsed?: unknown }, current = false): boolean {
  return current || record.amuletChipUsed === true;
}

/**
 * Липкий флаг «подарок первого магазина выдан» (улучшение №40, шаг 28в): откат к записи до магазина второй
 * подарок не даёт. Правило одно на запись и чтение — как у спасения и отсрочки.
 */
export function freeGiftUsedOf(record: { freeGiftGiven?: unknown }, current = false): boolean {
  return current || record.freeGiftGiven === true;
}

/**
 * Липкий флаг «отмена черепа уже потрачена» (улучшение №50, шаг 28г): откат кассетой её не возвращает, иначе
 * перемотка давала бы отмену каждый забег. Как rescueUsedOf: текущий OR с плёнкой, старой плёнке без поля — нет.
 */
export function skullCancelUsedOf(record: { skullCancelUsed?: unknown }, current = false): boolean {
  return current || record.skullCancelUsed === true;
}

/**
 * Липкий флаг «спасение уже было»: откат кассетой его не снимает, иначе яму фармили бы перемоткой (как devUsed).
 * Правило одно для записи и чтения, поэтому оно здесь, а не в сцене: `insertTape` складывает текущий флаг с плёнкой,
 * `loadTape` читает результат. Старая плёнка без поля — «не было»; плёнка «до ямы» + текущий true — true.
 * Вторую нехватку фишек с этим флагом закрывает rescueAllowed (lastChance.ts) — сразу KABOOM, без спасения.
 */
export function rescueUsedOf(record: { rescueUsed?: unknown }, current = false): boolean {
  return current || record.rescueUsed === true;
}
