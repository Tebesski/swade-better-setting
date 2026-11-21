import assert from "node:assert/strict";
import {test} from "node:test";
import {includeSelfTarget, isSelfRange} from "../scripts/self-targeting.mjs";

test("Self ranges include their caster without duplicating existing targets", () => {
  assert.ok(isSelfRange("Self")); assert.ok(isSelfRange(" Self (see text) "));
  assert.ok(isSelfRange("На себя", "На себя")); assert.ok(!isSelfRange("6/12/24"));
  const source = {id: "caster"}; let ids;
  includeSelfTarget(source, [{id: "ally"}], value => ids = value);
  assert.deepEqual(ids, ["ally", "caster"]);
  ids = null;
  includeSelfTarget(source, [source], value => ids = value);
  assert.equal(ids, null);
});
