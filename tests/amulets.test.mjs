// Тесты активных амулетов (шаг 12б): заряд в начале раунда, нажатие, отказ без заряда и у потолка прокруток,
// эффекты «Оберега» и «Прицела». Проверяется и проводка: canPressActive решает «можно ли», pressActiveAmulet — «что даёт».
// Проверяются чистые функции amulets.ts; сдвиг доли черепов — тем же кодом, что в игре (dealerGame.skullShareWeightMul).
// Запуск: npm run test:achievements (загрузчик TypeScript — .claude/skills/next-step/ts-resolve.mjs).

import { test } from 'node:test';
import assert from 'node:assert/strict';

const A = await import('../src/game/amulets.ts');
const D = await import('../src/game/dealerGame.ts');
const R = await import('../src/game/rules.ts');

const amulet = (id) => A.AMULETS.find((one) => one.id === id);

test('активные амулеты: «Оберег» и «Прицел», по одному заряду в раунде', () => {
  const active = A.AMULETS.filter((one) => A.isActive(one));
  assert.deepEqual(active.map((one) => one.id), ['charm', 'sight'], 'активных ровно два — 🧿 и 🎯');
  for (const one of active) {
    assert.equal(one.usesPerRound, 1, `${one.id}: один заряд в раунде`);
    assert.equal(one.maxCopies, 1, `${one.id}: одна копия — гнездо одно`);
    assert.equal(A.activeUses(one), 1, `${one.id}: полный заряд в начале раунда`);
  }
});

test('активный амулет находится по счётчикам копий, пассивные — нет', () => {
  assert.equal(A.activeAmuletOf({ charm: 1 }), amulet('charm'), '🧿 в гнезде');
  assert.equal(A.activeAmuletOf({ sight: 1 }), amulet('sight'), '🎯 в гнезде');
  assert.equal(A.activeAmuletOf({ bones: 1, vest: 2 }), null, 'пассивные активными не считаются');
  assert.equal(A.activeAmuletOf({}), null, 'пусто — активного нет');
});

test('нажатие тратит заряд: было 1 — стало 0', () => {
  const use = A.pressActiveAmulet(amulet('charm'), 1);
  assert.equal(use.used, true, 'заряд был — нажатие прошло');
  assert.equal(use.chargesLeft, 0, 'заряд потрачен');
});

test('без заряда нажатие не даёт эффекта и не уводит заряд в минус', () => {
  for (const id of ['charm', 'sight']) {
    const use = A.pressActiveAmulet(amulet(id), 0);
    assert.equal(use.used, false, `${id}: заряда нет — нажатие не проходит`);
    assert.equal(use.chargesLeft, 0, `${id}: заряд остался нулевым`);
    assert.equal(use.skullShareDelta, 0, `${id}: эффекта нет`);
    assert.equal(use.spinsBonus, 0, `${id}: прокруток не прибавилось`);
  }
  assert.equal(A.pressActiveAmulet(amulet('charm'), -5).chargesLeft, 0, 'битый минус — ноль, а не минус');
});

test('пассивный и незнакомый амулет не нажимается: заряд не тратится', () => {
  const passive = amulet('bones');
  const use = A.pressActiveAmulet(passive, 1);
  assert.equal(use.used, false, 'пассивный амулет не нажимают');
  assert.equal(use.chargesLeft, 1, 'заряд остался');
  assert.equal(A.pressActiveAmulet(null, 1).used, false, 'гнездо пусто — нажимать нечего');
  // Незнакомый активный (например, добавят позже без эффекта): нажатие не проходит, заряд цел.
  const unknown = { ...amulet('charm'), id: 'unknown' };
  assert.equal(A.pressActiveAmulet(unknown, 1).used, false, 'незнакомый эффект не срабатывает');
});

test('«Оберег»: доля черепов ниже ровно на 3 п.п.', () => {
  const use = A.pressActiveAmulet(amulet('charm'), 1);
  assert.equal(use.skullShareDelta, A.CHARM_SKULL_DELTA, 'сдвиг — константа амулета');
  assert.equal(A.CHARM_SKULL_DELTA, -0.03, 'это −3 п.п.');
  assert.equal(use.spinsBonus, 0, 'прокруток «Оберег» не даёт');
  // Сдвиг считается тем же механизмом, что у сделки «тише черепа»: доля 20 % → 17 %.
  const share = 0.2;
  const mul = D.skullShareWeightMul(share, use.skullShareDelta);
  const shifted = (share * mul) / (share * mul + (1 - share));
  assert.ok(Math.abs(shifted - 0.17) < 1e-9, `доля 20% с −3 п.п. даёт 17%, получено ${shifted}`);
});

test('«Прицел»: +2 прокрутки раунда, но не выше потолка', () => {
  const use = A.pressActiveAmulet(amulet('sight'), 1);
  assert.equal(use.spinsBonus, 2, 'две прокрутки за нажатие');
  assert.equal(use.skullShareDelta, 0, 'черепа «Прицел» не трогает');
  assert.equal(R.spinsAfterBonus(5, use.spinsBonus), 7, '5 прокруток + 2 = 7');
  assert.equal(R.spinsAfterBonus(R.MAX_SPINS_PER_ROUND, use.spinsBonus), R.MAX_SPINS_PER_ROUND, 'выше потолка раунда не поднимает');
});

test('второе нажатие в том же раунде: заряда уже нет', () => {
  const first = A.pressActiveAmulet(amulet('sight'), A.activeUses(amulet('sight')));
  assert.equal(first.used, true, 'первое нажатие прошло');
  const second = A.pressActiveAmulet(amulet('sight'), first.chargesLeft);
  assert.equal(second.used, false, 'второй раз в раунде нельзя');
  assert.equal(second.spinsBonus, 0, 'и прокруток второй раз нет');
});

// ---------- Проводка: canPressActive (шаг 12б, замечание ревью 1–2) ----------

const MAX = R.MAX_SPINS_PER_ROUND;

test('canPressActive: «Прицел» у потолка прокруток не нажимается, на прокрутку ниже — нажимается', () => {
  const sight = amulet('sight');
  assert.equal(A.canPressActive(sight, MAX, MAX), false, 'ровно потолок — отказ');
  assert.equal(A.canPressActive(sight, MAX + 5, MAX), false, 'выше потолка — тоже отказ');
  assert.equal(A.canPressActive(sight, MAX - 1, MAX), true, 'на одну ниже потолка — можно');
  assert.equal(A.canPressActive(sight, 0, MAX), true, 'пустой раунд — можно');
});

test('canPressActive: «Оберег» нажимается и у потолка прокруток', () => {
  const charm = amulet('charm');
  assert.equal(A.canPressActive(charm, MAX, MAX), true, 'потолок «Оберегу» не мешает: он прокруток не даёт');
  assert.equal(A.canPressActive(charm, 0, MAX), true, 'и в начале раунда тоже');
});

test('canPressActive: пассивный амулет и пустое гнездо не нажимаются', () => {
  assert.equal(A.canPressActive(amulet('bones'), 5, MAX), false, 'пассивный — false');
  assert.equal(A.canPressActive(amulet('vest'), 5, MAX), false, 'пассивный — false');
  assert.equal(A.canPressActive(null, 5, MAX), false, 'амулета нет — false');
});

/** Как в игре и в симуляторе: сначала canPressActive, и только если можно — pressActiveAmulet. */
function pressLikeGame(one, chargesLeft, spinsLeft, maxSpins) {
  if (!A.canPressActive(one, spinsLeft, maxSpins)) return { used: false, chargesLeft, spinsBonus: 0 };
  return A.pressActiveAmulet(one, chargesLeft);
}

test('отказ canPressActive не списывает заряд: «Прицел» у потолка остаётся целым', () => {
  const sight = amulet('sight');
  const before = 1;
  const use = pressLikeGame(sight, before, MAX, MAX);
  assert.equal(use.used, false, 'нажатие не прошло');
  assert.equal(use.chargesLeft, before, 'заряд не списан');
  assert.equal(use.spinsBonus, 0, 'эффекта нет');
  assert.equal(R.spinsAfterBonus(MAX, use.spinsBonus), MAX, 'прокруток не прибавилось');
  // Для сравнения: на прокрутку ниже потолка то же нажатие проходит и тратит заряд.
  const ok = pressLikeGame(sight, before, MAX - 1, MAX);
  assert.equal(ok.used, true, 'на одну ниже потолка нажатие проходит');
  assert.equal(ok.chargesLeft, 0, 'заряд потрачен');
  // Частичная прибавка: у потолка −1 «Прицел» даёт +1, а не +2 — принятое поведение, как у сигареты.
  assert.equal(R.spinsAfterBonus(MAX - 1, ok.spinsBonus), MAX, 'фактическая прибавка — одна прокрутка');
});

test('отказ canPressActive не списывает заряд: пассивный и пустое гнездо', () => {
  assert.equal(pressLikeGame(amulet('bones'), 1, 5, MAX).chargesLeft, 1, 'пассивный: заряд цел');
  assert.equal(pressLikeGame(null, 1, 5, MAX).chargesLeft, 1, 'пусто: заряд цел');
});
