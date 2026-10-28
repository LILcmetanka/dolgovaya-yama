/**
 * Игра с Коллектором, когда фишек на долг не хватило: рулетка с револьвером — один раз за забег.
 * Коллектор показывает патроны (сколько боевых, сколько холостых) и крутит барабан: порядок неизвестен.
 * Стреляете по очереди, ты первый. В себя: холостой — ещё твой ход, боевой — смерть.
 * В Коллектора: боевой — ты выжил, холостой — его ход. Он стреляет в тебя, если боевых осталось не меньше, чем холостых,
 * иначе — в себя (холостой — снова его ход). Выжил — тот же долг заново, фишки на табло остаются.
 * Вместо игры можно отдать амулет — тогда долг закрыт, но только если амулета хватает:
 * каждый билет его цены закрывает пятую часть долга. Фишки с табло Коллектор при этом забирает тоже.
 * Рулетка уже была — откуп всё равно можно, а не хватает и амулета — конец забега.
 * Без Phaser — только числа и маленькие функции.
 */

export const ROULETTES_PER_RUN = 1; // рулетка — столько раз за забег; потом фишек не хватило — только откуп или конец
export const CHAMBERS = 6; // гнёзд в барабане револьвера
/** Боевых патронов — случайно от MIN_LIVE до MAX_LIVE, остальные холостые. Выжить: при 2 и 4 боевых — 73%, при 3 — 65%. */
export const MIN_LIVE = 2;
export const MAX_LIVE = 4;

/**
 * Амулет закрывает такую долю долга за каждый билет своей цены: обычный — 0,2, редкий — 0,6, легендарный — 0,8.
 * Была четверть, но амулеты подорожали (amulets.ts): с четвертью легендарный за 4 билета закрывал бы долг целиком.
 */
export const AMULET_DEBT_SHARE = 0.2;

/** Патрон: боевой или холостой. */
export type Bullet = 'live' | 'blank';
/** Кто стреляет и в кого: игрок или Коллектор. */
export type Side = 'player' | 'collector';

/** Хватит ли амулета ценой price билетов вместе с фишками на табло, чтобы закрыть долг. */
export function canTradeAmulet(price: number, balance: number, debt: number): boolean {
  return balance + price * AMULET_DEBT_SHARE * debt >= debt;
}

/** Сколько боевых зарядит Коллектор: случайно от MIN_LIVE до MAX_LIVE. */
export function randomLiveCount(): number {
  return MIN_LIVE + Math.floor(Math.random() * (MAX_LIVE - MIN_LIVE + 1));
}

/** Барабан: live боевых и остальные холостые вперемешку. Стреляют по порядку: первым — bullets[0]. */
export function loadCylinder(live: number): Bullet[] {
  const bullets: Bullet[] = [];
  for (let chamber = 0; chamber < CHAMBERS; chamber++) bullets.push(chamber < live ? 'live' : 'blank');
  for (let index = bullets.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1)); // перемешиваем: меняем с любым из ещё не тронутых
    [bullets[index], bullets[other]] = [bullets[other], bullets[index]];
  }
  return bullets;
}

/** Сколько боевых среди патронов. */
export function liveCount(bullets: Bullet[]): number {
  return bullets.filter((bullet) => bullet === 'live').length;
}

/** В кого стреляет Коллектор: боевых осталось не меньше, чем холостых, — в тебя, иначе — в себя. */
export function collectorTarget(bullets: Bullet[]): Side {
  const live = liveCount(bullets);
  return live >= bullets.length - live ? 'player' : 'collector';
}

/** Кто стреляет после холостого: тот, в кого стреляли. В себя — снова ты, в другого — его очередь. */
export function shooterAfterBlank(target: Side): Side {
  return target;
}
