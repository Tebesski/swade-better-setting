import assert from "node:assert/strict";
import {test} from "node:test";
import {chooseLoadout, limitAncestryDie, spendAttributeSteps, variantRoll} from "../scripts/npc-forge-options.mjs";

test("weighted loadout kits stay together and distinct slots combine", () => {
  const rows = [
    {uuid: "bow", slot: "Main", kit: "bow", weight: 9},
    {uuid: "quiver", slot: "MAIN", kit: "Bow", weight: 1},
    {uuid: "spear", slot: "Main", kit: "spear", weight: 1},
    {uuid: "cloak", slot: "Body"},
    {uuid: "badge", rank: "Seasoned"},
    {uuid: "patch", maxRank: "Novice"},
    {uuid: "hidden", chance: 0}
  ];
  let bows = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const choose = () => chooseLoadout(rows, "Seasoned", seed).map(row => row.uuid);
    const ids = choose();
    assert.deepEqual(ids, choose());
    assert.ok(ids.includes("cloak") && ids.includes("badge"));
    assert.ok(!ids.includes("patch") && !ids.includes("hidden"));
    assert.equal(ids.includes("bow"), ids.includes("quiver"));
    assert.notEqual(ids.includes("bow"), ids.includes("spear"));
    bows += Number(ids.includes("bow"));
  }
  assert.ok(bows > 850 && bows < 950, String(bows));
});

test("ancestry bounds and opt-in anomalies constrain weighted die steps", () => {
  const die = {sides: 8, modifier: 0};
  assert.deepEqual(limitAncestryDie(die, {min: 10, max: 12}, 0, "seed", "agility"), {sides: 10, modifier: 0});
  const seed = Array.from({length: 100}, (_, i) => i).find(i => variantRoll(i, "direction:agility") < .5);
  assert.deepEqual(limitAncestryDie(die, {min: 8, max: 8, anomaly: 1}, 100, seed, "agility"), {sides: 6, modifier: 0});
  const attributes = {agility: die, spirit: die, smarts: die};
  const result = spendAttributeSteps(attributes, {agility: 5, spirit: 1, smarts: 0}, 8, seed,
    (key, next) => key === "agility" ? limitAncestryDie(next, {max: 10}, 0, seed, key) : next);
  assert.deepEqual(result, {agility: {sides: 10, modifier: 0}, spirit: {sides: 12, modifier: 0}, smarts: die});
  assert.equal(attributes.agility.sides, 8);
});
