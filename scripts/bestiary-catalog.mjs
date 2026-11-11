import {hasWoundAdjustment, npcFacets} from "./bestiary-data.mjs";
import {actorRating, EFFECTS, npcRank} from "./npc-data.mjs";
import {MODULE_ID} from "./skills.mjs";

export const ROW_FIELDS = ["system.wildcard", "system.advances.rank", "system.advances.value",
  `flags.${MODULE_ID}.npc.rank`, `flags.${MODULE_ID}.npc.cr`];
const FLAG_FIELDS = ["flags", "prototypeToken.flags", "items.flags", "effects.flags"].flatMap(path =>
  ["tags", "excludedTags"].map(key => `${path}.${EFFECTS}.${key}`));
const DETAIL_FIELDS = ["system.additionalStats", "system.wounds.max", "system.stats.size", "system.details.species.name",
  "items.name", "items.type", "items.img", "items.system.actions.additional", "items.system.equipStatus", "items.system.arcane",
  "items.effects", "effects.name", "effects.img", "effects.disabled", "effects.system.changes", "effects.changes", ...FLAG_FIELDS];
const empty = new Map();
const noRating = {cr: null, coverage: "Unrated"};
const yieldToUI = () => new Promise(resolve => setTimeout(resolve, 0));

export async function boundedRead(read, timeout = 8000) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Compendium read timed out.")), timeout); })
    ]);
  } finally { clearTimeout(timer); }
}

export function catalogRow(record, source) {
  const cr = record.flags?.[MODULE_ID]?.npc?.cr;
  const inspectable = source.pack ? source.inspectable : record.testUserPermission(game.user, "OBSERVER");
  return {source, id: record.id ?? record._id, uuid: record.uuid, name: record.name, img: record.img,
    rank: npcRank(record), wildcard: record.isWildcard ?? !!record.system?.wildcard, inspectable,
    manual: Number.isFinite(cr) && cr >= 0 ? {cr, coverage: "Manual"} : null};
}

export class BestiaryCatalog {
  constructor(onFailure, {timeout = 8000} = {}) {
    this.onFailure = onFailure;
    this.timeout = timeout;
    this.indices = new Map();
    this.authored = new Map();
    this.wounds = new Map();
    this.ratings = new Map();
  }

  facets(row) { return this.authored.get(row.uuid); }

  choices(rows, group) {
    const choices = new Map();
    for (const row of rows) {
      for (const [key, choice] of this.facets(row)?.get(group) ?? []) if (!choices.has(key)) choices.set(key, choice);
    }
    return choices;
  }

  rating(row) { return row.inspectable ? row.manual ?? this.ratings.get(row.uuid) : noRating; }

  async index(source, fields) {
    try { return await boundedRead(() => source.pack.getIndex({fields}), this.timeout); }
    catch (error) {
      this.onFailure(source, error);
      return source.pack.index ?? empty;
    }
  }

  groupBySource(rows) {
    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.source)) groups.set(row.source, []);
      groups.get(row.source).push(row);
    }
    return groups;
  }

  // Keep document preparation bounded even if the browser and a filter picker need it at the same time.
  documents(source, ids, active) {
    const read = async () => {
      if (!active()) return empty;
      if (!source.pack) return new Map(ids.map(id => [id, game.actors.get(id)]));
      const docs = new Map(ids.map(id => [id, source.pack.get(id)]));
      const missing = ids.filter(id => !docs.get(id));
      if (missing.length) {
        const actors = await boundedRead(() => source.pack.getDocuments({_id__in: missing}), this.timeout);
        for (const actor of actors) docs.set(actor.id, actor);
      }
      return docs;
    };
    const pending = (this.reading ?? Promise.resolve()).then(read);
    this.reading = pending.catch(() => {});
    return pending;
  }

  async loadActors(rows, active, use) {
    for (const [source, group] of this.groupBySource(rows)) {
      let failed = false;
      for (let i = 0; i < group.length; i += 8) {
        await yieldToUI();
        if (!active()) return;
        const batch = group.slice(i, i + 8);
        let actors = empty;
        if (!failed) {
          try { actors = await this.documents(source, batch.map(row => row.id), active); }
          catch (error) {
            failed = true;
            this.onFailure(source, error);
          }
        }
        if (!active()) return;
        for (const row of batch) {
          const actor = actors.get(row.id);
          try { use(row, actor && !actor.invalid && actor.testUserPermission(game.user, "OBSERVER") ? actor : null); }
          catch (error) {
            this.onFailure(source, error);
            use(row, null);
          }
        }
      }
    }
  }

  async loadAuthored(rows, active, onProgress) {
    const effectsAPI = globalThis.game?.modules?.get(EFFECTS)?.api;
    const groups = [...this.groupBySource(rows.filter(row => !this.authored.has(row.uuid)))];
    const load = async ([source, group]) => {
      if (!active()) return;
      let index;
      if (source.pack && source.inspectable) {
        if (!this.indices.has(source.pack)) this.indices.set(source.pack,
          this.index(source, [...ROW_FIELDS, ...DETAIL_FIELDS]));
        index = await this.indices.get(source.pack);
      }
      for (let i = 0; i < group.length; i += 128) {
        await yieldToUI();
        if (!active()) return;
        for (const row of group.slice(i, i + 128)) {
          if (this.authored.has(row.uuid)) continue;
          const record = row.inspectable ? (source.pack ? index?.get(row.id) : game.actors.get(row.id)) : null;
          try {
            this.authored.set(row.uuid, record ? npcFacets(record, effectsAPI) : empty);
            // Prepared world actors already expose the final capacity. Compendium NPCs
            // need full preparation if capacity is missing or an effect could change it.
            const capacity = record?.system?.wounds?.max;
            if (!source.pack || !record || (capacity != null && !hasWoundAdjustment(record))) {
              this.wounds.set(row.uuid, capacity ?? null);
            }
          }
          catch (error) {
            this.onFailure(source, error);
            this.authored.set(row.uuid, empty);
            this.wounds.set(row.uuid, null);
          }
        }
      }
      onProgress?.(group);
    };
    for (let i = 0; i < groups.length && active(); i += 4) {
      await Promise.all(groups.slice(i, i + 4).map(load));
    }
  }

  async loadFacets(rows, groups, active, onProgress) {
    await this.loadAuthored(rows, active, onProgress);
    if (groups.includes("wounds")) {
      await this.loadActors(rows.filter(row => !this.wounds.has(row.uuid)), active, (row, actor) => {
        this.wounds.set(row.uuid, actor?.system?.wounds?.max ?? null);
      });
    }
  }

  async loadRatings(rows, active, update) {
    await this.loadActors(rows.filter(row => !this.rating(row)), active, (row, actor) => {
      const estimate = actor && actorRating(actor);
      const rating = estimate ? {cr: estimate.coverage === "Unrated" ? null : estimate.rawCR ?? estimate.cr, coverage: estimate.coverage} : noRating;
      this.ratings.set(row.uuid, rating);
      update(row, rating);
    });
  }
}
