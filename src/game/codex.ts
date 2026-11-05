/**
 * Что игрок уже встретил в забеге: предметы, амулеты, автоматы, Коллектор и Дилер. Вкладки «Предметы» и «Кто есть кто»
 * на экране на стене показывают только это. Без Phaser. Живёт, пока открыта страница: откат кассетой его не стирает
 * (встреченное не забывается), «заново» после проигрыша — стирает (`resetCodex`).
 */

const seen = new Set<string>();

/** Ключи встреченного: `item:shield`, `amulet:bell`, `machine:greedy`, `who:collector`, `who:dealer`. */
export const itemKey = (id: string): string => `item:${id}`;
export const amuletKey = (id: string): string => `amulet:${id}`;
export const machineKey = (id: string): string => `machine:${id}`;
export const WHO_COLLECTOR = 'who:collector';
export const WHO_DEALER = 'who:dealer';

/** Встретил key. Вернёт true, если это впервые — тогда на экране на стене мигает «NEW». */
export function see(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
}

export function isSeen(key: string): boolean {
  return seen.has(key);
}

/** Новый забег: всё встреченное забыто. */
export function resetCodex(): void {
  seen.clear();
}
