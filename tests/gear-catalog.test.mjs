import assert from "node:assert/strict";
import test from "node:test";
import {catalog} from "../tools/gear-catalog.mjs";

const setting = "swade-better-setting";
const usables = "swade-better-usables";
const effects = "swade-better-effects";
const grid = "swade-grid-inventory";
const effectItem = id => "Compendium." + setting + ".effects.Item." + id;
const macro = id => "Compendium." + setting + ".macros.Macro." + id;

test("catalog links resolve to stable pack entries and every use has valid charges", () => {
  const effectRefs = new Set(catalog.effects.documents.map(doc => effectItem(doc._id)));
  const macroRefs = new Set(catalog.macros.documents.map(doc => macro(doc._id)));
  for (const pack of Object.values(catalog)) {
    const entries = [...pack.documents, ...pack.folders];
    assert.equal(new Set(entries.map(entry => entry._id)).size, entries.length);
    for (const doc of pack.documents) assert.ok(!doc.folder || pack.folders.some(folder => folder._id === doc.folder));
  }
  const kinds = new Set();
  for (const doc of catalog.gear.documents.filter(item => item.type === "consumable")) {
    const config = doc.flags[usables];
    for (const use of doc.system.charges.charges) {
      const {cost, separate} = config.useConfig[use.id];
      const pool = separate ? use : config.sharedPool;
      assert.ok(pool ? cost <= pool.max : cost === 0, doc.name);
      const behaviours = Object.values(config.uses[use.id]);
      assert.ok(behaviours.length);
      for (const entry of behaviours) {
        kinds.add(entry.type);
        if (entry.type === "macro") assert.ok(macroRefs.has(entry.macroUuid), doc.name);
        if (entry.type === "effect") assert.ok(effectRefs.has(entry.effectUuid) && entry.effectSource.length > 0, doc.name);
      }
    }
  }
  assert.deepEqual([...kinds].sort(), ["effect", "macro", "note", "request", "roll"]);
  for (const doc of catalog.effects.documents) for (const effect of doc.effects) {
    const outcomes = effect.flags[effects].lingering?.outcomes ?? {};
    for (const entry of Object.values(outcomes)) if (entry.effectUuid) assert.ok(effectRefs.has(entry.effectUuid));
  }
});

test("shipped sheaths, pouches and cases match their inventory mounts", () => {
  const containers = catalog.gear.documents.filter(doc => doc.type === grid + ".container");
  const types = new Set(containers.map(doc => doc.flags[grid].item.customType));
  for (const doc of containers) {
    const item = doc.flags[grid].item;
    assert.ok(item.container.limit > 0);
    assert.ok(item.container.pattern.every(row => /^[#.]+$/.test(row)));
    for (const slot of item.slots) assert.ok(slot.types.some(type => types.has(type)), slot.label);
  }
});
