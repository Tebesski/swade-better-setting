import test from "node:test";
import assert from "node:assert/strict";
import {applyDamageAdjustment, damagePlan, damageState} from "../scripts/damage-dice.mjs";

const upgrade = (steps, flatOverflow, scope = "base") => ({type: "increaseDieType", system: {steps, flatOverflow, scope}});
const addDice = formula => ({type: "addDamageDice", system: {formula}});
const project = (formula, ...changes) => {
  const state = damageState(formula);
  for (const change of changes) applyDamageAdjustment(state, change, "Test modifier", (value, max) => Math.min(value, max));
  return damagePlan(state);
};

test("unchecked upgrades cap at d12 while checked overflow accumulates per die", () => {
  assert.equal(project("1d10", upgrade(7)).base, "1d12");
  assert.equal(project("1d10", upgrade(1, true)).base, "1d12");
  assert.equal(project("1d4", upgrade(6, true)).base, "1d12+2");
  assert.equal(project("1d12", upgrade(2), upgrade(1, true), upgrade(1, true)).base, "1d12+2");
  assert.equal(project("2d12", upgrade(1, true)).base, "2d12+2");
});

test("overflow preserves the die modifiers, flavors, and surrounding arithmetic", () => {
  assert.equal(project("2d10x [Fire d4] - 1d12r<2 + @d6 + 1D20", upgrade(2, true)).base,
    "2d12x [Fire d4]+2 - (1d12r<2+2) + @d6 + 1D20");
  assert.equal(project("2*1d12", upgrade(1, true)).base, "2*(1d12+1)");
});

test("all-dice upgrades apply in order to existing and later bonuses", () => {
  const plan = project("1d12", addDice("1d12x"), upgrade(1, true, "all"), addDice("2d12"), upgrade(1, true));
  assert.equal(plan.base, "1d12+2");
  assert.deepEqual(plan.bonuses, ["1d12x+1", "2d12+2"]);
  assert.equal(plan.adjustments.at(-1).after, "1d12+2");
  assert.equal(project("1d12", upgrade(1, true), {type: "addDamageDice", system: {legacyCount: 1}}, upgrade(1, true)).base, "2d12+3");
});
