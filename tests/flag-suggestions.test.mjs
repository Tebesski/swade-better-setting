import assert from "node:assert/strict";
import test from "node:test";
import {flagSuggestions} from "../scripts/flag-suggestions.mjs";

test("flag suggestions cap a large catalog without hiding matches late in the catalog", () => {
  const flags = [...Array.from({length: 18000}, (_, index) => `catalog-flag-${index}`), "cold-waiver"];
  assert.equal(flagSuggestions("", flags).length, 20);
  assert.deepEqual(flagSuggestions("cold", flags), [{label: "cold-waiver", value: "cold-waiver"}]);
  assert.deepEqual(flagSuggestions("custom-flag", flags), []);
});

test("flag suggestions prioritize prefixes and complete only the last comma-separated flag", () => {
  const flags = ["arcane-fire", "fire", "fireball", "fire-shield", "goes-on-fire"];
  assert.deepEqual(flagSuggestions("fire,  FIR", flags, {multiple: true}), [
    {label: "fireball", value: "fire,  fireball"},
    {label: "fire-shield", value: "fire,  fire-shield"},
    {label: "arcane-fire", value: "fire,  arcane-fire"},
    {label: "goes-on-fire", value: "fire,  goes-on-fire"}
  ]);
});
