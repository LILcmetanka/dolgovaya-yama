import type { Words } from './lang';
import { streakAfterSkull } from './rules';

/**
 * Сделка Дилера (решение автора 15.11.2026, QUESTIONS.md): на экране выпал кубик 🎲 — Дилер кладёт на сукно
 * три карты-сделки. В каждой две строки: что получаешь и чем платишь. Игрок берёт одну сделку или отказывается.
 * Сделки — связки из DONTLIKE.md «20 связок» (ответ автора: 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 19, 20).
 * Шаг 9 — каркас и три связки: №6 «билеты / магазин закрыт», №19 «раунд без черепов», №20 «шаг ×2 / череп в ×1».
 * Шаг 10 — ещё три: №4 «тише черепа / потолок серии», №14 «мягкий череп / −1 прокрутка», №17 «выигрыш +25% / черепа навсегда».
 * Остальные связки автора добавляются так же: поле в PactEffects и ветка в pactEffects + карта в PACTS.
 * Сделка живёт на кассете как запись { id, untilRound } — сколько раундов действует, столько и лежит.
 * Без Phaser — только числа и маленькие функции.
 */

export type PactId =
  | 'tickets-shop' | 'quiet-round' | 'double-step'
  | 'skull-calm' | 'soft-skull' | 'price-up';

/** Карта-сделка: id, сколько раундов живёт и две строки на карте — баф зелёным, дебаф красным. */
export interface PactSpec {
  id: PactId;
  rounds: number; // сколько раундов действует, считая раунд, в котором взяли (PACT_LAST_ROUNDS — до конца забега)
  bonus: Words; // «получаешь» — зелёная строка на карте
  cost: Words; // «платишь» — красная строка на карте
}

/** Запись на кассете: сделка и последний раунд, в котором она ещё действует. */
export interface Pact {
  id: PactId;
  untilRound: number;
}

/**
 * Что из сделок действует в раунде round — единственное место, где это решается: и прокрутка, и плашка доли,
 * и множитель, и сгорание серии, и магазин спрашивают отсюда.
 */
export interface PactEffects {
  noSkulls: boolean; // в автомате этого раунда нет черепов
  skullShareDelta: number; // доля черепов в этом раунде выше (+) или ниже (−) на столько; 0 — без поправки
  shopClosed: boolean; // магазин после этого раунда не открывается
  multiplierStepMul: number; // во сколько раз больше шаг множителя серии (1 — обычный, 2 — «шаг вдвое»)
  skullWipesStreak: boolean; // череп обнуляет серию, а не оставляет от неё треть (streakAfterSkull)
  multiplierCap: number; // множитель серии не выше этого (PACT_CAP; Infinity — без потолка)
  skullSoft: boolean; // череп снимает с серии одну ступень вместо трети
  spinsDelta: number; // столько прокруток прибавится (+) или убавится (−) в начале раунда
  winMul: number; // во сколько раз больше выигрыш паттернов (1 — без поправки)
}

/** Сколько карт Дилер кладёт на сукно. */
export const PACT_OFFER_COUNT = 3;
/**
 * «До конца забега» в раундах: конечное число, а не Infinity. Infinity переживает только память — в JSON она
 * становится null, и сделка на кассете молча теряла бы срок. Шаг 10 ставит столько раундов связкам «навсегда».
 */
export const PACT_LAST_ROUNDS = 999;
/** «+1 билет сразу»: выдаётся один раз, в момент сделки (в PactEffects его нет — это не эффект на раунд). */
export const PACT_TICKETS = 1;
/** №6: столько раундов магазин закрыт после сделки. */
export const TICKETS_SHOP_ROUNDS = 4;
/** №19: столько раундов живёт «тихий раунд» (первый — без черепов, второй — с поправкой доли). */
export const QUIET_ROUND_ROUNDS = 2;
/** №20: столько раундов шаг множителя удвоен. */
export const DOUBLE_STEP_ROUNDS = 3;
/** №4: столько раундов черепа тише и серия упирается в потолок. */
export const SKULL_CALM_ROUNDS = 1;
/** №14: столько раундов череп мягкий и прокруток в раунде меньше. */
export const SOFT_SKULL_ROUNDS = 1;
/** «Шаг множителя серии вдвое»: было ×1, ×2, ×3… стало ×1, ×3, ×5… */
export const PACT_STEP_FACTOR = 2;
/** «В следующем раунде доля черепов выше» на 9 п.п. (подобрано симулятором, шаг 9). */
export const QUIET_SKULL_DELTA = 0.09;
/** Поправка доли не должна довести её до 100 %: дальше сетка была бы из одних черепов. */
export const SKULL_SHARE_MAX = 0.9;
/** И не увести в ноль: вес черепа на нуле — это «нет черепов», а сделка обещала только «тише». */
export const SKULL_SHARE_MIN = 0.01;
// ---------- Связки шага 10 ----------
/** №4 «Тише черепа»: доля черепов ниже на 3 п.п., пока сделка жива. */
export const SKULL_CALM_DELTA = -0.03;
/** №4: множитель серии не поднимается выше ×3 (серия выше двух ступеней ничего не даёт). */
export const PACT_CAP = 3;
/** №14 «Мягкий череп»: −1 прокрутка в каждом раунде, пока сделка жива. */
export const SOFT_SKULL_SPINS = -1;
/** №17 «Цена вверх»: выигрыш паттернов +25 % — число автора из DONTLIKE.md, симулятором не подкручивается. */
export const PRICE_UP_WIN = 1.25;
/** …и доля черепов +0,5 п.п. до конца забега. */
export const PRICE_UP_SKULL_DELTA = 0.005;

/**
 * Число в тексте карты: целые без дробной части, дробные — с одним знаком (0,5 / 0.5).
 * Сначала округляем до десятых: 0,09 · 100 в JS — это 9.000000000000002, и без округления карта сказала бы «+9.0 п.п.».
 */
function cardNum(value: number, isEn: boolean): string {
  const tenths = Math.round(value * 10) / 10;
  const shown = Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
  return isEn ? shown : shown.replace('.', ',');
}

/**
 * Пул сделок. Тексты короткие: на карте две строки, каждая переносится по словам и влезает в ~40 символов.
 * Цифры в текстах берутся из констант рядом — в сцене их нет, и разъехаться они не могут.
 * Названия и описания предметов и амулетов лежат рядом с ними (items.ts, amulets.ts) — сделки тоже со своими текстами.
 */
export const PACTS: readonly PactSpec[] = [
  {
    id: 'tickets-shop',
    rounds: TICKETS_SHOP_ROUNDS,
    bonus: { ru: '+1 билет сразу', en: '+1 ticket right away' },
    cost: {
      ru: `магазин закрыт ${TICKETS_SHOP_ROUNDS} раунда`,
      en: `shop closed for ${TICKETS_SHOP_ROUNDS} rounds`,
    },
  },
  {
    id: 'quiet-round',
    rounds: QUIET_ROUND_ROUNDS,
    bonus: { ru: 'до конца раунда нет черепов', en: 'no skulls until the round ends' },
    cost: {
      ru: `в следующем черепа +${cardNum(QUIET_SKULL_DELTA * 100, false)} п.п.`,
      en: `next round skulls +${cardNum(QUIET_SKULL_DELTA * 100, true)} pp`,
    },
  },
  {
    id: 'double-step',
    rounds: DOUBLE_STEP_ROUNDS,
    bonus: { ru: 'шаг серии ×2: ×1, ×3, ×5', en: 'streak step ×2: ×1, ×3, ×5' },
    cost: { ru: 'череп роняет серию в ×1', en: 'a skull drops the streak to ×1' },
  },
  {
    id: 'skull-calm',
    rounds: SKULL_CALM_ROUNDS,
    bonus: {
      ru: `черепов на ${cardNum(-SKULL_CALM_DELTA * 100, false)} п.п. меньше`,
      en: `skulls ${cardNum(-SKULL_CALM_DELTA * 100, true)} pp rarer`,
    },
    cost: { ru: `серия не выше ×${PACT_CAP}`, en: `streak capped at ×${PACT_CAP}` },
  },
  {
    id: 'soft-skull',
    rounds: SOFT_SKULL_ROUNDS,
    bonus: { ru: 'череп снимает 1 ступень серии', en: 'a skull costs 1 streak step' },
    cost: {
      ru: `−${Math.abs(SOFT_SKULL_SPINS)} прокрутка в раунде`,
      en: `−${Math.abs(SOFT_SKULL_SPINS)} spin per round`,
    },
  },
  {
    id: 'price-up',
    rounds: PACT_LAST_ROUNDS,
    bonus: {
      ru: `выигрыш паттернов +${cardNum((PRICE_UP_WIN - 1) * 100, false)}%`,
      en: `pattern wins +${cardNum((PRICE_UP_WIN - 1) * 100, true)}%`,
    },
    cost: {
      ru: `черепа +${cardNum(PRICE_UP_SKULL_DELTA * 100, false)} п.п. навсегда`,
      en: `skulls +${cardNum(PRICE_UP_SKULL_DELTA * 100, true)} pp forever`,
    },
  },
];

/** Сделка по id: id типизирован, поэтому сделка есть всегда (цикл-проверка — для чужих данных кассеты). */
export function pactSpec(id: PactId): PactSpec {
  const spec = PACTS.find((pact) => pact.id === id);
  if (!spec) throw new Error(`неизвестная сделка: ${id}`);
  return spec;
}

/** Запись сделки для кассеты: взяли в раунде round — действует spec.rounds раундов, untilRound — последний из них. */
export function pactOf(id: PactId, round: number): Pact {
  return { id, untilRound: round + pactSpec(id).rounds - 1 };
}

/** Знакомый ли это id сделки (кассета могла прийти из другой версии игры). */
export function isPactId(value: unknown): value is PactId {
  return typeof value === 'string' && PACTS.some((pact) => pact.id === value);
}

/** Последний раунд сделки с кассеты: не число, NaN и Infinity — 0, то есть сделка уже кончилась. */
function pactRoundOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Сделки с кассеты: неизвестные id отбрасываем, битый untilRound — 0, то есть сделка уже кончилась.
 * В старых записях поля нет — считаем, что сделок нет.
 */
export function readPacts(list: unknown): Pact[] {
  if (!Array.isArray(list)) return [];
  const pacts: Pact[] = [];
  for (const value of list) {
    if (typeof value !== 'object' || value === null) continue;
    const record = value as { id?: unknown; untilRound?: unknown };
    if (!isPactId(record.id)) continue;
    pacts.push({ id: record.id, untilRound: pactRoundOf(record.untilRound) });
  }
  return pacts;
}

/** Первый раунд сделки: untilRound − (rounds − 1), пока сделки не сдвинуты — раунд, в котором её взяли. */
function firstRoundOf(pact: Pact): number {
  return pact.untilRound - pactSpec(pact.id).rounds + 1;
}

/**
 * Действует ли сделка в раунде round: untilRound — последний раунд её жизни.
 * Раунд до первого тоже не считается: после провала последнего шанса счёт идёт назад, и сделка, взятая
 * два раунда назад, не должна оживать в раунде, где её ещё не было (это важно магазину).
 */
function isPactActive(pact: Pact, round: number): boolean {
  return round > 0 && round <= pact.untilRound && round >= firstRoundOf(pact);
}

/** Живёт ли сделка id в раунде round: такую второй раз не берут — дубликат не даёт ни бафа, ни билетов. */
export function pactLive(pacts: readonly Pact[], id: PactId, round: number): boolean {
  return pacts.some((pact) => pact.id === id && isPactActive(pact, round));
}

/**
 * Сдвинуть сроки сделок на delta раундов — когда счёт раундов идёт назад (провал последнего шанса) или вперёд.
 * Сделка живёт не «до номера раунда», а столько раундов, сколько их реально сыграно: без сдвига откат счёта
 * спрятал бы сделку (firstRoundOf > round) — закрытый магазин открылся бы, а сделка потом «реанимировалась» сама.
 * Сроки, ушедшие за нулевой раунд, снимаются.
 */
export function shiftPacts(pacts: readonly Pact[], delta: number): Pact[] {
  const step = Number.isFinite(delta) ? Math.trunc(delta) : 0;
  const shifted: Pact[] = [];
  for (const pact of pacts) {
    const untilRound = pact.untilRound + step;
    if (untilRound > 0) shifted.push({ id: pact.id, untilRound });
  }
  return shifted;
}

/**
 * Что действует в раунде round. Все сделки складываются: две одинаковые не удваивают шаг (он «вдвое», а не «во сколько раз»),
 * а «нет черепов» и «черепов больше» — разные раунды одной сделки, поэтому друг друга не гасят.
 */
export function pactEffects(pacts: readonly Pact[], round: number): PactEffects {
  const effects: PactEffects = {
    noSkulls: false,
    skullShareDelta: 0,
    shopClosed: false,
    multiplierStepMul: 1,
    skullWipesStreak: false,
    multiplierCap: Number.POSITIVE_INFINITY, // потолка нет, пока сделка его не поставит
    skullSoft: false,
    spinsDelta: 0,
    winMul: 1,
  };
  for (const pact of pacts) {
    if (!isPactActive(pact, round)) continue;
    switch (pact.id) {
      case 'tickets-shop':
        // Магазин закрыт, пока сделка жива: все её раунды, считая тот, в котором её взяли.
        effects.shopClosed = true;
        break;
      case 'quiet-round': {
        // Первый раунд сделки — без черепов, последний — черепов больше на QUIET_SKULL_DELTA.
        if (round === firstRoundOf(pact)) effects.noSkulls = true;
        else if (round === pact.untilRound) effects.skullShareDelta += QUIET_SKULL_DELTA;
        break;
      }
      case 'double-step':
        effects.multiplierStepMul = PACT_STEP_FACTOR;
        effects.skullWipesStreak = true;
        break;
      case 'skull-calm':
        // Тише черепа: доля ниже на SKULL_CALM_DELTA, а серия всё время сделки упирается в ×PACT_CAP.
        effects.skullShareDelta += SKULL_CALM_DELTA;
        effects.multiplierCap = Math.min(effects.multiplierCap, PACT_CAP);
        break;
      case 'soft-skull':
        // Мягкий череп: ступень вместо трети, но в раунде на SOFT_SKULL_SPINS прокрутку меньше.
        effects.skullSoft = true;
        effects.spinsDelta += SOFT_SKULL_SPINS;
        break;
      case 'price-up':
        // Выигрыш паттернов больше, черепа чаще — до конца забега (срок PACT_LAST_ROUNDS).
        effects.winMul *= PRICE_UP_WIN;
        effects.skullShareDelta += PRICE_UP_SKULL_DELTA;
        break;
    }
  }
  return effects;
}

/**
 * Во сколько раз тяжелее (легче, если delta < 0) сделать череп, чтобы его доля в автомате стала share + delta.
 * share — доля до поправки (0…1). Долю даёт k·share / (k·share + others), отсюда k = (s+δ)·(1−s) / (s·(1−s−δ)).
 * Двигается один вес черепа, поэтому и прокрутка, и плашка «💀 N%» показывают одно и то же число.
 * Поправка не выходит за SKULL_SHARE_MIN…SKULL_SHARE_MAX; двигать нечего (черепов нет, доля уже у границы,
 * delta 0 или мусор) — 1.
 */
export function skullShareWeightMul(share: number, delta: number): number {
  if (!Number.isFinite(share) || !(share > 0) || !Number.isFinite(delta) || delta === 0) return 1;
  const target = Math.min(SKULL_SHARE_MAX, Math.max(SKULL_SHARE_MIN, share + delta));
  if (!(target > 0) || target >= 1 || target === share) return 1;
  if (delta > 0 ? !(target > share) : !(target < share)) return 1; // доля уже у границы — двигать некуда
  const mul = (target * (1 - share)) / (share * (1 - target));
  return Number.isFinite(mul) && mul > 0 ? mul : 1;
}

/**
 * Серия после паттерна из черепов с учётом сделок: «череп в ×1» обнуляет, «мягкий череп» снимает одну ступень
 * множителя, иначе от серии остаётся треть (rules.streakAfterSkull). Одно место для сцены и симулятора.
 * Ступень — это одно очко серии: множитель = 1 + серия × шаг, поэтому при шаге 2 ступень дороже в шкале (×19 → ×17),
 * но из серии всё равно уходит ровно 1 — «одна ступень» не зависит от шага.
 */
export function skullStreakAfter(streak: number, effects: PactEffects): number {
  if (effects.skullWipesStreak) return 0;
  const safe = Number.isFinite(streak) ? Math.max(0, Math.floor(streak)) : 0;
  if (!effects.skullSoft) return streakAfterSkull(safe);
  return Math.max(0, safe - 1);
}

/**
 * Три карты на сукно: count разных сделок из пула, кроме exclude (им шаг 10 уберёт те, что уже на столе).
 * Порядок случайный — игрок видит карты в разном порядке, как их положил Дилер.
 */
export function offerPacts(count = PACT_OFFER_COUNT, exclude: readonly PactId[] = []): PactSpec[] {
  const offers = PACTS.filter((pact) => !exclude.includes(pact.id));
  for (let index = offers.length - 1; index > 0; index--) {
    const swap = Math.floor(Math.random() * (index + 1));
    [offers[index], offers[swap]] = [offers[swap], offers[index]];
  }
  return offers.slice(0, Math.max(0, Math.min(count, offers.length)));
}
