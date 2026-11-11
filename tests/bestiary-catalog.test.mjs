import assert from "node:assert/strict";
import {test} from "node:test";
import {BestiaryCatalog, catalogRow} from "../scripts/bestiary-catalog.mjs";
import {hasWoundAdjustment, inWoundRange} from "../scripts/bestiary-data.mjs";

test("authored Bestiary filters use index projections, including item effects and additional stats", async () => {
  const tagged = tag => ({"swade-better-effects": {tags: [tag]}});
  const record = {_id: "npc", uuid: "Compendium.test.Actor.npc", name: "NPC", type: "npc",
    flags: tagged("Actor Tag"), prototypeToken: {flags: tagged("Token Tag")},
    system: {additionalStats: {luck: {label: "Moonluck"}}},
    items: [{type: "weapon", name: "Spear", flags: tagged("Item Tag"),
      effects: [{name: "Nested ward", disabled: true, flags: tagged("Nested Tag")}],
      system: {actions: {additional: {strike: {name: "Heavy strike"}}}}}],
    effects: [{name: "Native ward", flags: tagged("Effect Tag"), system: {changes: [
      {key: "sbe.modifyFlag", type: "add", value: "Applied Tag"}
    ]}}]};
  let reads = 0;
  const source = {inspectable: true, pack: {
    getIndex: async ({fields}) => {
      reads++;
      assert.ok(fields.includes("items.effects") && fields.includes("system.additionalStats"));
      assert.ok(fields.includes("prototypeToken.flags.swade-better-effects.tags"));
      return new Map([[record._id, record]]);
    },
    getDocuments: () => assert.fail("Opening an authored filter must never prepare full documents")
  }};
  const catalog = new BestiaryCatalog(assert.fail);
  const row = catalogRow(record, source);
  await catalog.loadFacets([row], ["effect"], () => true);
  await catalog.loadFacets([row], ["stat", "action", "flag"], () => true);
  const facets = catalog.facets(row);
  assert.deepEqual([...facets.get("effect").keys()].sort(), ["native ward", "nested ward"]);
  assert.ok(facets.get("stat").has("moonluck"));
  assert.ok(facets.get("action").has("heavy strike"));
  assert.deepEqual([...facets.get("flag").keys()].sort(), ["actor tag", "applied tag", "effect tag", "item tag", "nested tag", "token tag"]);
  assert.equal(reads, 1);
});

test("a stalled compendium read keeps cached choices and lets other sources finish", async () => {
  const source = (key, item) => {
    const record = {_id: "npc", uuid: `Compendium.${key}.Actor.npc`, name: key, type: "npc",
      items: [{type: "skill", name: item}]};
    const index = new Map([[record._id, record]]);
    const pack = {index, getIndex: async () => index};
    const group = {key, pack, inspectable: true};
    return {pack, row: catalogRow(record, group)};
  };
  const stalled = source("stalled", "Boating");
  const ready = source("ready", "Riding");
  stalled.pack.getIndex = () => new Promise(() => {});
  const failures = [], progress = [];
  const rows = [stalled.row, ready.row];
  const catalog = new BestiaryCatalog((group, error) => failures.push([group.key, error.message]), {timeout: 10});
  await catalog.loadFacets(rows, ["skill"], () => true, batch => progress.push(batch[0].source.key));
  assert.deepEqual(progress, ["ready", "stalled"]);
  assert.deepEqual(failures, [["stalled", "Compendium read timed out."]]);
  assert.deepEqual([...catalog.choices(rows, "skill").keys()].sort(), ["boating", "riding"]);
});

test("Bestiary Wound bounds include both endpoints and higher capacities in the top step", () => {
  assert.deepEqual([0, 1, 2, 3, 4, null].filter(value => inWoundRange(value, 1, 2)), [1, 2]);
  assert.deepEqual([0, 1, 2, 3, 4, null].filter(value => inWoundRange(value, 3, 3)), [3, 4]);
  const effect = {system: {changes: [{key: "system.wounds.max"}]}};
  assert.equal(hasWoundAdjustment({items: [{effects: [effect]}]}), true);
  assert.equal(hasWoundAdjustment({effects: [{...effect, disabled: true}]}), false);
});

test("a missing Wound projection uses the prepared NPC capacity", async t => {
  const oldGame = globalThis.game;
  globalThis.game = {user: {}};
  t.after(() => { globalThis.game = oldGame; });
  const record = {_id: "npc", uuid: "Compendium.test.Actor.npc", name: "NPC", type: "npc", system: {wildcard: false}};
  const index = new Map([[record._id, record]]);
  const actor = {id: record._id, system: {wounds: {max: 2}}, testUserPermission: () => true};
  const source = {inspectable: true, pack: {getIndex: async () => index, get: () => actor}};
  const row = catalogRow(record, source);
  const catalog = new BestiaryCatalog(assert.fail);
  await catalog.loadFacets([row], ["skill"], () => true);
  assert.equal(catalog.wounds.has(row.uuid), false);
  await catalog.loadFacets([row], ["wounds"], () => true);
  assert.equal(catalog.wounds.get(row.uuid), 2);
});

test("prepared Bestiary reads are bounded and stop when the requesting window closes", async t => {
  const oldGame = globalThis.game;
  globalThis.game = {user: {}};
  t.after(() => { globalThis.game = oldGame; });
  const reads = [];
  const source = {pack: {
    get: () => undefined,
    getDocuments: async query => {
      reads.push(query._id__in.length);
      return query._id__in.map(id => ({id, testUserPermission: () => true}));
    }
  }};
  const rows = Array.from({length: 21}, (_, i) => ({source, id: String(i)}));
  const catalog = new BestiaryCatalog(assert.fail);
  const seen = [];
  await catalog.loadActors(rows, () => seen.length < 16, (row, actor) => {
    assert.equal(row.id, actor.id);
    seen.push(actor.id);
  });
  assert.deepEqual(reads, [8, 8]);
  assert.equal(seen.length, 16);
});
