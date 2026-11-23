import assert from "node:assert/strict";
import {test} from "node:test";
import {usesTargetRows, shakeOffAction} from "../scripts/chat-target-data.mjs";

test("attack, damage, and power cards share target rows; response rolls do not recurse", () => {
  assert.ok(usesTargetRows({item: {type: "power", system: {damage: ""}}, context: {roll: ["power"]}}));
  assert.ok(usesTargetRows({context: {roll: ["skill", "test"]}}));
  for (const data of [{damage: true}, {context: {rollType: "damage"}}, {context: {roll: ["attack"]}},
    {item: {type: "weapon"}}, {item: {type: "power", system: {damage: "2d6"}}}]) assert.equal(usesTargetRows(data), true);
  for (const data of [{context: {opposition: {}}}, {context: {response: {}}}]) assert.equal(usesTargetRows(data), false);
});
test("Shake Off uses the power's configured normal/strong resistance actions", () => {
  const actions = {normal: {name: "Shake Off", type: "resist", override: "vigor", modifier: -2},
    strong: {name: "Shake Off (Strong)", type: "resist", override: "vigor", modifier: -4},
    damage: {name: "Damage", type: "damage"}};
  assert.equal(shakeOffAction(actions)[0], "normal");
  assert.equal(shakeOffAction(actions, true)[0], "strong");
  assert.equal(shakeOffAction({normal: actions.normal}, true)[1].modifier, "-4");
  assert.equal(shakeOffAction({})[1].override, "vigor");
  assert.equal(shakeOffAction({}, true)[1].modifier, "-2");
});
