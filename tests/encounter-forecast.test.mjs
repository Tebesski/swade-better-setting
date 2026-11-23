import assert from "node:assert/strict";
import {test} from "node:test";
import {forecastEncounter} from "../scripts/encounter-forecast.mjs";
import {referencePC} from "../scripts/npc-math.mjs";

const base = referencePC(0);
const novice = {...base, attacks: [base.attacks[0]]};
const extra = {...novice, spirit: {sides: 6}, vigor: {sides: 6}, wounds: 0, bennies: 0,
  attacks: [{...novice.attacks[0], trait: {sides: 6}}]};
const one = profile => [{profile}];

test("focused melee matches the independent duel and four-Extra benchmarks", () => {
  const mirror = forecastEncounter([one(novice), one(novice)]);
  assert.ok(Math.abs(mirror.wins / mirror.trials - .5) < .035);
  const foes = Array.from({length: 4}, () => ({profile: extra}));
  const baseline = forecastEncounter([one(novice), foes]);
  assert.equal(baseline.unresolved, 0);
  assert.ok(Math.abs(baseline.wins / baseline.trials - .13) < .035);
  assert.deepEqual(forecastEncounter([one(novice), foes]), baseline);
  const battered = forecastEncounter([[{profile: novice, wounds: 2, shaken: true, bennies: 0, fatigue: 1}], foes]);
  assert.ok(battered.wins < baseline.wins / 2);
});

test("complete immunity is unresolved, and only attacks which can penetrate it can win", () => {
  const armored = {...novice, heavyArmor: true};
  const heavy = {...armored, attacks: [{...armored.attacks[0], heavyWeapon: true}]};
  const run = (party, enemy) => forecastEncounter([one(party), one(enemy)], 4, {trials: 50});
  assert.equal(run(armored, armored).unresolved, 50);
  assert.equal(run(heavy, armored).wins, 50);
  assert.equal(run(armored, heavy).wins, 0);
});

test("Foundry initiative groups take consecutive actions", () => {
  const fighter = {...extra, attacks: [{...extra.attacks[0], trait: {sides: 6, modifier: 20, extraCritChance: 0},
    damage: {dice: [], flat: 12}, raiseDice: []}]};
  const sides = [3, 2].map((count, group) => Array.from({length: count}, () => ({profile: fighter, group})));
  // Every hit incapacitates. The larger group wins outright on the first initiative;
  // if it goes second, one fighter survives and the last two duel on the next initiative.
  const result = forecastEncounter(sides, 0, {trials: 4096});
  assert.equal(result.unresolved, 0);
  assert.ok(Math.abs(result.wins / result.trials - .75) < .025);
});

test("current PP and the Wound Cap apply to the combatants in the forecast", () => {
  const spell = {...novice.attacks[0], mode: "power", trait: {sides: 6, modifier: 99, extraCritChance: 0},
    resource: {key: "pp:Faith", capacity: 4, cost: 2}, damage: {dice: [], flat: 100}, raiseDice: []};
  const caster = {profile: {...novice, attacks: [spell]}};
  const target = one({...extra, wounds: 4, attacks: []});
  const run = (points, cap) => forecastEncounter([[{...caster, pools: {"pp:Faith": points}}], target], cap, {trials: 10});
  assert.equal(run(0, 0).unresolved, 10);
  assert.equal(run(2, 0).wins, 10);
  assert.equal(run(2, 4).unresolved, 10);
  assert.equal(run(4, 4).wins, 10);
});
