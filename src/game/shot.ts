import type { Words } from './lang';
import type { Item } from './items';
import { DEBT_ROUND_TO } from './rules';

/**
 * Выстрел в автомат — аварийный выход. Патрон продают в магазине за билеты, и каждый следующий дороже; он лежит на полке, как предмет.
 * Понял, что долг не добить, — между прокрутками выстрели (клик по патрону или его клавиша): патрон уходит в револьвер Коллектора,
 * ствол — на автомат. Раунд кончается (оставшиеся прокрутки пропадают), долг пропущен — раунд пройден, как после откупа амулетом,
 * но без билета; фишки остаются. Коллектор это запоминает: следующий долг больше. Вместо разбитого привозят другой автомат —
 * со своим характером (characters.ts). Без Phaser — чтобы проверить симуляцией.
 */

export const BULLET_PRICE_START = 3; // первый патрон за забег стоит столько билетов…
export const BULLET_PRICE_STEP = 1; // …каждый следующий — на столько дороже: 3, 4, 5…
export const SHOT_DEBT_FACTOR = 1.5; // Коллектор запоминает выстрел: следующий долг во столько раз больше

/** «×1,5» по-русски и «×1.5» по-английски — из SHOT_DEBT_FACTOR: поменяешь число — поменяются и надписи. */
export const SHOT_DEBT_TEXT: Words = {
  ru: `×${String(SHOT_DEBT_FACTOR).replace('.', ',')}`,
  en: `×${SHOT_DEBT_FACTOR}`,
};

/** Патрон на полке. Нарисован кодом (decor.ts), поэтому знака нет. */
export const BULLET: Item = {
  id: 'bullet',
  sign: '',
  name: { ru: 'Патрон', en: 'Bullet' },
  description: {
    ru: `Не хватает на долг — выстрели в автомат: раунд кончится, долг пропущен, следующий ${SHOT_DEBT_TEXT.ru}, придёт другой автомат`,
    en: `Short on the debt? Shoot the machine: the round ends, the debt is skipped, the next one is ${SHOT_DEBT_TEXT.en}, another machine comes`,
  },
  color: 0xeab308,
};

/** Цена патрона в билетах, когда за забег их уже куплено bought: 3, 4, 5… */
export function bulletPrice(bought: number): number {
  return BULLET_PRICE_START + BULLET_PRICE_STEP * bought;
}

/** Долг раунда после выстрела: обычный долг debt × SHOT_DEBT_FACTOR, округлённый, как все долги. */
export function debtAfterShot(debt: number): number {
  return Math.round((debt * SHOT_DEBT_FACTOR) / DEBT_ROUND_TO) * DEBT_ROUND_TO;
}

/** Можно ли стрелять: только когда фишек на табло вместе с коном не хватает на долг — иначе выстрел незачем. */
export function canShoot(balance: number, pot: number, debt: number): boolean {
  return balance + pot < debt;
}
