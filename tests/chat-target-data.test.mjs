import assert from "node:assert/strict";
import {test} from "node:test";
import {usesTargetRows, shakeOffAction} from "../scripts/chat-target-data.mjs";

test("only non-attack checks and non-damaging powers get effect/opposition rows", () => {
  assert.ok(usesTargetRows({item: {type: "power", system: {damage: ""}}, context: {roll: ["power"]}}));
  assert.ok(usesTargetRows({context: {roll: ["skill", "test"]}}));
  for (const data of [{damage: true}, {context: {rollType: "damage"}}, {context: {roll: ["attack"]}},
    {item: {type: "weapon"}}, {item: {type: "power", system: {damage: "2d6"}}},
    {context: {opposition: {}}}, {context: {response: {}}}]) assert.equal(usesTargetRows(data), false);
});
test("Shake Off uses the power's configured normal/strong resistance actions", () => {
  const actions = {normal: {name: "Shake Off", type: "resist", override: "vigor", modifier: -2},
    strong: {name: "Shake Off (Strong)", type: "resist", override: "vigor", modifier: -4},
    damage: {name: "Damage", type: "damage"}};
  assert.equal(shakeOffAction(actions)[0], "normal");
  assert.equal(shakeOffAction(actions, true)[0], "strong");
  assert.equal(shakeOffAction({normal: actions.normal}, true), null);
  assert.equal(shakeOffAction({}), null);
});
