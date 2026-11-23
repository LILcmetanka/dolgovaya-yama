import { AMULETS, type Amulet, type AmuletId } from './amulets';

/**
 * Память амулетов (шаг 26; переделана шагом 38, `DONTLIKE.md` п.2): при старте каждого нового забега игрок
 * выбирает один амулет из тех, что были в прошлом забеге, — бесплатно. Отказаться можно: выбора нет — гнёзда пусты.
 * Никаких цен в билетах больше нет (`memoryPrice` удалён): амулет просто сохраняется, а не покупается после смерти.
 * Без Phaser — список проверяется тестами (tests/memory.test.mjs).
 */

/** Что предложить на старте забега: сам амулет. Цены у памяти больше нет — перенос всегда бесплатный. */
export interface MemoryOption {
  amulet: Amulet;
}

/**
 * Сколько амулетов из прошлого забега можно взять за новый забег. Один — правило игры; №30 «Амулет в памяти»
 * и сделка №34 дают свои прибавки отдельно (upgrades.memoryPickCount, CollectorScene.bankRunAmulets).
 */
export const MEMORY_PICKS_BASE = 1;

/** Сделка №34 «амулет не сгорает при смерти»: ещё один амулет прошлого забега можно взять на старте. */
export const MEMORY_PICKS_PACT = 1;

/**
 * Какие амулеты прошлого забега предложить: только уникальные и в порядке AMULETS, чтобы список не прыгал.
 * Чужие id отбрасываются (в прогрессе мог остаться мусор от старой версии игры). Пустой список — выбора нет.
 */
export function memoryOptions(owned: readonly AmuletId[]): MemoryOption[] {
  const options: MemoryOption[] = [];
  for (const amulet of AMULETS) {
    if (owned.includes(amulet.id)) options.push({ amulet });
  }
  return options;
}
