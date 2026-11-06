import assert from "node:assert/strict";
import test from "node:test";
import {MODULE_ID, STANDARD_SKILLS, normalizeName, seedSkills, withCoreSkills} from "../scripts/skills.mjs";

test("standard catalog contains all 32 unique skills with the five standard core skills", () => {
  const skills = seedSkills();
  assert.equal(skills.length, 32);
  assert.equal(new Set(skills.map(item => item.name)).size, 32);
  assert.deepEqual(skills.filter(item => item.system.isCoreSkill).map(item => item.name),
    ["Athletics", "Common Knowledge", "Notice", "Persuasion", "Stealth"]);
  assert.ok(STANDARD_SKILLS.every(([, attribute]) => ["agility", "smarts", "spirit"].includes(attribute)));
});

test("system catalog seeds retain translated names, source descriptions, and schema data without carrying document identity", () => {
  const original = {_id: "source-id", type: "skill", name: "Athlétisme", folder: "folder-id", ownership: {default: 0},
    flags: {[MODULE_ID]: {pendingLibrary: true}, swade: {test: true}}, system: {swid: "athletics", attribute: "agility", description: "<p>Existing system text</p>", die: {sides: 4}}};
  const seeded = seedSkills([original])[1];
  assert.equal(seeded.name, "Athlétisme");
  assert.equal(seeded.system.description, original.system.description);
  assert.equal(seeded.system.isCoreSkill, true);
  assert.equal(seeded._id, undefined);
  assert.equal(seeded.folder, undefined);
  assert.equal(seeded.flags[MODULE_ID], undefined);
  assert.equal(original.flags[MODULE_ID].pendingLibrary, true);
});

test("core creation preserves existing skills, ratings, and non-skill items and deduplicates names and identifiers", () => {
  const existing = [{_id: "edge-id", name: "Alertness", type: "edge"},
    {_id: "skill-id", name: "  NOTICE ", type: "skill", system: {die: {sides: 10}}},
    {_id: "localized-id", name: "Athlétisme", type: "skill", system: {swid: "athletics", die: {sides: 8}}}];
  let sequence = 0;
  const result = withCoreSkills(existing, seedSkills().filter(item => item.system.isCoreSkill), () => `new-${++sequence}`);
  assert.equal(result.length, 6);
  assert.deepEqual(result.slice(0, 3), existing);
  assert.equal(result.filter(item => item.system?.swid === "athletics").length, 1);
  assert.equal(result.filter(item => normalizeName(item.name) === "notice").length, 1);
  assert.equal(result.filter(item => item._id.startsWith("new-")).length, 3);
  assert.equal(existing.length, 3);
});

test("empty and customized core sets are authoritative", () => {
  assert.deepEqual(withCoreSkills([], [], () => "unused"), []);
  const result = withCoreSkills([], [{name: "Navigation", type: "skill", system: {isCoreSkill: true, attribute: "smarts", die: {sides: 6}}}], () => "custom-id");
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "Navigation");
  assert.equal(result[0].system.die.sides, 6);
});
