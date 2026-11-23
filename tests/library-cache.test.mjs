import assert from "node:assert/strict";
import {test} from "node:test";
import {librarySkills} from "../scripts/library.mjs";

test("skills reuse live documents, share reads, fetch only missing IDs, and retry failures", async () => {
  const cached = new Map(), records = new Map();
  const queries = [];
  let indices = 0, fail = false;
  const pack = {
    has: id => cached.has(id), get: id => cached.get(id), invalidDocumentIds: new Set(["bad"]),
    getIndex: async () => { indices++; return [...records.values()].map(({id, type}) => ({_id: id, type})); },
    getDocuments: async query => {
      queries.push(query);
      if (fail) throw Error("Unavailable");
      for (const id of query._id__in) cached.set(id, structuredClone(records.get(id)));
    }
  };
  globalThis.game = {packs: {get: () => pack}, users: {activeGM: {id: "gm"}}, user: {id: "gm"}, settings: {get: () => true}};
  records.set("a", {id: "a", name: "Notice", type: "skill", system: {description: "Original"}});
  records.set("gear", {id: "gear", name: "Gear", type: "gear"});
  records.set("bad", {id: "bad", name: "Invalid", type: "skill"});
  const [first, second] = await Promise.all([librarySkills(), librarySkills()]);
  assert.equal(indices, 1);
  assert.deepEqual(queries, [{_id__in: ["a"]}]);
  assert.equal(first[0], second[0]);
  cached.get("a").system.description = "Edited";
  assert.equal((await librarySkills())[0].system.description, "Edited");
  assert.equal(queries.length, 1);
  // Additions, deletions, and document cache expiry stay visible without a
  // module-level permanent cache or lifecycle-hook invalidation assumptions.
  records.set("b", {id: "b", name: "Athletics", type: "skill", system: {}});
  assert.deepEqual((await librarySkills()).map(item => item.id), ["b", "a"]);
  assert.deepEqual(queries.at(-1), {_id__in: ["b"]});
  records.delete("a"); cached.delete("a");
  assert.deepEqual((await librarySkills()).map(item => item.id), ["b"]);
  cached.clear(); fail = true;
  await assert.rejects(librarySkills(), /Unavailable/);
  fail = false;
  assert.deepEqual((await librarySkills()).map(item => item.id), ["b"]);
  delete globalThis.game;
});
