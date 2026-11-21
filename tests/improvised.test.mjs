import assert from "node:assert/strict";
import {test} from "node:test";
import {IMPROVISED_PRESETS, improvisedSource} from "../scripts/improvised-data.mjs";

test("improvised presets match the supplied damage, range and Strength requirements", () => {
  for (const [key, range, die] of [["light", "3/6/12",4],["medium","2/4/8",6],["heavy","1/2/4",8]]) {
    const preset = IMPROVISED_PRESETS[key];
    assert.equal(preset.range, range); assert.equal(preset.damage, `@str+1d${die}`); assert.equal(preset.minStr, `d${die}`);
    assert.equal(preset.examples.length,3);
  }
});
test("created weapons are armed mixed weapons with one native attack penalty and mandatory flag", () => {
  const source = improvisedSource({...IMPROVISED_PRESETS.medium, name:"Chair",trait:"Fighting",penalty:-2,ap:0,weight:3,flags:"wood, improvised-weapon",throwLabel:"Throw",throwTrait:"Athletics"});
  assert.equal(source.type,"weapon"); assert.equal(source.system.rangeType,2); assert.equal(source.system.equipStatus,4);
  assert.equal(source.system.actions.traitMod,"-2"); assert.equal(source.system.actions.additional.throw.override,"Athletics");
  assert.equal(source.system.actions.additional.throw.modifier,"0");
  assert.deepEqual(source.flags['swade-better-effects'].tags,["improvised-weapon","wood"]);
  assert.equal(source.system.actions.dmgMod,undefined);
});
test("invalid construction data cannot create a weapon", () => {
  const values={...IMPROVISED_PRESETS.light,name:"Rock",trait:"Fighting",penalty:-2,ap:0,weight:0};
  assert.throws(()=>improvisedSource({...values,range:"6/3/12"}),/Range/);
  assert.throws(()=>improvisedSource({...values,weight:-1}),/Numbers/);
});
