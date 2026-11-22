import { AMULETS, type Amulet, type AmuletId, type Rarity } from './amulets';

/**
 * Память амулетов после смерти (DONTLIKE §2, вариант А): один амулет погибшего забега переезжает в следующий.
 * Цена — билеты забега на момент смерти: 2 за обычный, 3 за редкий. Копии не переносятся, и если билетов
 * не хватает, слота нет совсем. Без Phaser — выбор проверяется тестами (tests/memory.test.mjs).
 */

/**
 * Цена переноса в билетах по редкости. Обычный и проклятый — 2 (в магазине проклятый тоже стоит как обычный),
 * редкий и легендарный — 3: автор дал две цены, всё, что реже обычного, переносится за 3.
 */
export const MEMORY_PRICES: Record<Rarity, number> = { common: 2, rare: 3, legendary: 3, cursed: 2 };

/** Что предложить на экране смерти: сам амулет и его цена в билетах. */
export interface MemoryOption {
  amulet: Amulet;
  price: number;
}

/** Цена неизвестной редкости: как обычный. Без запаса `undefined` ушёл бы в билеты и дал NaN. */
const DEFAULT_MEMORY_PRICE = 2;

/** Цена переноса амулета этой редкости в билетах. Неизвестная редкость — как обычный, а не NaN. */
export function memoryPrice(rarity: Rarity): number {
  return MEMORY_PRICES[rarity] ?? DEFAULT_MEMORY_PRICE;
}

/**
 * Какие амулеты забега можно перенести: только уникальные (копии не считаются) и только те, на которые
 * хватает билетов. Пустой список — слота памяти нет. Порядок — как в AMULETS, чтобы витрина не прыгала.
 */
export function memoryOptions(owned: readonly AmuletId[], tickets: number): MemoryOption[] {
  // Билеты — целые; мусор (NaN, минус) считаем нулём: тогда не хватает на всё и слота нет.
  const budget = Number.isFinite(tickets) ? Math.max(0, Math.floor(tickets)) : 0;
  const options: MemoryOption[] = [];
  for (const amulet of AMULETS) {
    if (!owned.includes(amulet.id)) continue; // амулета в забеге не было
    const price = memoryPrice(amulet.rarity);
    if (price > budget) continue; // копии не переносятся, а долговой слот не даём — просто не предлагаем
    options.push({ amulet, price });
  }
  return options;
}
