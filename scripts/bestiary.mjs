import {inWoundRange, npcNameSearch} from "./bestiary-data.mjs";
import {BestiaryCatalog, ROW_FIELDS, catalogRow} from "./bestiary-catalog.mjs";
import {wrapMethod} from "./integrations.mjs";
import {ChoicePicker} from "./picker.mjs";
import {MODULE_ID, normalizeName} from "./skills.mjs";
import {RANKS, formatCR, parseCR} from "./npc-math.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
const WORLD = "world";
const BESTIARY_DRAG = "application/x-swade-better-setting-npc";
const PAGE_SIZE = 50;
const GROUPS = [
  ["flag", "Better Effects flags", "fa-tags"], ["skill", "Skills", "fa-list"],
  ["edge", "Edges", "fa-bolt"], ["hindrance", "Hindrances", "fa-link"],
  ["ability", "Special abilities", "fa-star"], ["action", "Actions", "fa-hand-fist"],
  ["stat", "Additional stats", "fa-chart-simple"], ["effect", "Effects", "fa-wand-sparkles"]
];
const SUGGEST = new Set(["flag", "skill", "edge", "hindrance"]);
const WILDCARDS = [{key: "wildcard", name: "Wild Cards"}, {key: "extra", name: "Extras"}];
const WOUNDS = {0: "0", 1: "1", 2: "2", 3: "3+"};
const RANK_CHOICES = [...RANKS, "Unrated"].map(rank => ({key: rank, name: rank}));
const SORT_OPTIONS = {name: "Name", cr: "CR", rank: "Rank"};
const byName = (a, b) => a.name.localeCompare(b.name, game.i18n.lang);
const worldNPCs = () => game.actors.filter(actor => actor.type === "npc" && actor.visible);
const rankOrder = rank => RANKS.indexOf(rank) + 1 || RANKS.length + 1;

function ratingLabel(rating) {
  if (!rating) return {value: "CR …", title: "Calculating Creature Rating"};
  if (rating.cr === null) return {value: "CR —", title: "No automatic Creature Rating"};
  return {value: `CR ${formatCR(rating.cr)}`, title: `Creature Rating · ${rating.coverage}`};
}

function facetKey(group, value) {
  const effects = game.modules.get("swade-better-effects")?.api;
  return group === "flag" && effects?.normalizeFlag ? effects.normalizeFlag(value) : normalizeName(value);
}

function report(error) {
  console.error(`${MODULE_ID} | Bestiary`, error);
  ui.notifications.error(error.message);
}

function dragOverlappingWounds(event) {
  const slider = event.currentTarget;
  const {target, pointerId, clientX: startX} = event;
  if (!event.isPrimary || event.button !== 0 || !target.matches("[data-wound-overlap]")) return;

  const [lower, upper] = slider.querySelectorAll('input[type="range"]');
  const origin = lower.valueAsNumber;
  const max = Number(upper.max);
  const thumbSize = parseFloat(getComputedStyle(slider).getPropertyValue("--wound-thumb-size"));
  const travel = slider.clientWidth - thumbSize;
  if (travel <= 0) return;

  // The thumbs share one hit area until the drag direction identifies a bound.
  event.preventDefault();
  slider.setPointerCapture(pointerId);
  const drag = new AbortController();
  const options = {signal: drag.signal};
  let thumb;
  slider.addEventListener("pointermove", move => {
    if (move.pointerId !== pointerId) return;
    const value = Math.min(max, Math.max(0, Math.round(origin + (move.clientX - startX) * max / travel)));
    if (!thumb) {
      if (value === origin) return;
      thumb = value < origin ? lower : upper;
      thumb.focus({preventScroll: true});
    }
    const bound = thumb === lower ? Math.min(origin, value) : Math.max(origin, value);
    if (bound === thumb.valueAsNumber) return;
    thumb.valueAsNumber = bound;
    thumb.dispatchEvent(new Event("input", {bubbles: true}));
  }, options);
  slider.addEventListener("lostpointercapture", end => {
    if (end.pointerId !== pointerId) return;
    drag.abort();
    if (thumb) thumb.dispatchEvent(new Event("change", {bubbles: true}));
    else (origin === max ? lower : upper).focus({preventScroll: true});
  }, options);
}

class BestiaryBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sbs-bestiary"],
    window: {title: "Browse Bestiary", icon: "fa-solid fa-paw", resizable: true},
    actions: {
      filter: async function (_event, target) { await this.openFilter(target.dataset.group).catch(report); },
      removeFilter: function (_event, target) {
        this.filters.get(target.dataset.group)?.delete(target.dataset.key);
        return this.showMatches();
      },
      clearFilters: function () {
        this.filters.clear();
        this.anyGroups.clear();
        this.query = this.sourceQuery = "";
        this.wildcard = null;
        this.woundRange = {min: 0, max: 3};
        this.crRange = {min: null, max: null};
        this.suggestions = null;
        return this.showMatches();
      },
      sortDirection: function () {
        this.ascending = !this.ascending;
        return this.showMatches();
      },
      refresh: function () { return this.refresh().catch(report); },
      build: function () { return game.modules.get(MODULE_ID).api.openNPCBuilder(); },
      openActor: async function (_event, target) {
        try { const actor = await resolveNPC(target.dataset.uuid); await actor.sheet.render({force: true}); }
        catch (error) { report(error); }
      },
      next: function () { return this.showMatches({page: this.page + 1, parts: ["results"]}); },
      previous: function () { return this.showMatches({page: this.page - 1, parts: ["results"]}); }
    }
  };
  static PARTS = {
    filters: {template: `modules/${MODULE_ID}/templates/bestiary-filters.hbs`, scrollable: [""]},
    results: {template: `modules/${MODULE_ID}/templates/bestiary-results.hbs`, scrollable: [".sbs-bestiary-list"]}
  };

  constructor() {
    super({position: {width: Math.min(1000, window.innerWidth - 32), height: Math.min(720, window.innerHeight - 64)}});
    this.sources = [];
    this.filters = new Map();
    this.anyGroups = new Set();
    this.wildcard = null;
    this.woundRange = {min: 0, max: 3};
    this.crRange = {min: null, max: null};
    this.failed = new Set();
    this.catalog = new BestiaryCatalog((source, error) => this.sourceFailed(source, error));
    this.query = "";
    this.sourceQuery = "";
    this.sort = "name";
    this.ascending = true;
    this.page = 0;
    this.loading = true;
  }

  async refresh() {
    if (this.refreshing) return;
    this.refreshing = this.loading = true;
    try {
      await this.picker?.close();
      this.resultJob = null;
      this.suggestions = null;
      this.catalog = new BestiaryCatalog((source, error) => this.sourceFailed(source, error));
      this.failed.clear();
      await this.render();
      const packs = game.packs.filter(pack => pack.visible && pack.documentName === "Actor")
        .map(pack => ({key: pack.collection, name: pack.title, pack, inspectable: pack.testUserPermission(game.user, "OBSERVER")})).sort(byName);
      this.sources = [{key: WORLD, name: "World actors"}, ...packs];
      for (let i = 0; i < packs.length && this.element?.isConnected; i += 4) {
        await Promise.all(packs.slice(i, i + 4).map(async source => {
          const index = await this.catalog.index(source, ROW_FIELDS);
          source.rows = [...index.values()].filter(entry => entry.type === "npc").map(entry => catalogRow(entry, source));
        }));
      }
      for (const key of this.filters.get("source")?.keys() ?? []) {
        if (!this.sources.some(source => source.key === key)) this.filters.get("source").delete(key);
      }
    } finally { this.refreshing = this.loading = false; }
    if (this.element?.isConnected) await this.showMatches();
  }

  sourceFailed(source, error) {
    this.failed.add(source.name);
    console.warn(`${MODULE_ID} | Could not read bestiary source ${source.key}`, error);
  }

  selectedSources() {
    const selected = this.filters.get("source");
    return selected?.size ? this.sources.filter(source => selected.has(source.key)) : this.sources;
  }

  rows() {
    return this.selectedSources().flatMap(source => source.key === WORLD ?
      worldNPCs().map(actor => catalogRow(actor, source)) : source.rows ?? []);
  }

  addFilter(group, choice) {
    const selected = this.filters.get(group) ?? new Map();
    selected.set(choice.key, choice.name);
    this.filters.set(group, selected);
    return this.showMatches();
  }

  fillSuggestions(input) {
    const group = input.dataset.facetInput;
    const query = facetKey(group, input.value);
    const selected = this.filters.get(group);
    const choices = this.suggestions?.options.get(group)?.values() ?? [];
    const matches = [...choices].filter(choice => !selected?.has(choice.key) && choice.key.includes(query))
      .sort((a, b) => Number(b.key.startsWith(query)) - Number(a.key.startsWith(query)) || byName(a, b))
      .slice(0, 15);
    input.list?.replaceChildren(...matches.map(choice => new Option(choice.name, choice.name)));
  }

  loadSuggestions() {
    if (this.loading || this.suggestions) return;
    const rows = this.rows();
    const catalog = this.catalog;
    const job = this.suggestions = {options: new Map([...SUGGEST].map(group => [group, new Map()]))};
    const active = () => this.suggestions === job && this.element?.isConnected;
    const collect = batch => {
      if (!active()) return;
      for (const group of SUGGEST) for (const [key, choice] of catalog.choices(batch, group)) job.options.get(group).set(key, choice);
      for (const input of this.parts.filters.querySelectorAll("[data-facet-input]")) this.fillSuggestions(input);
    };
    collect(rows);
    void catalog.loadAuthored(rows, active, collect).catch(report);
  }

  submitSuggestion(input, allowCustom) {
    const group = input.dataset.facetInput;
    const name = input.value.trim();
    const key = facetKey(group, name);
    const choice = this.suggestions?.options.get(group)?.get(key);
    if (!key || (!choice && !allowCustom)) return;
    input.value = "";
    void this.addFilter(group, choice ?? {key, name}).catch(report);
  }

  updateWounds(input, filters) {
    const bound = input.dataset.woundBound;
    const value = Number(input.value);
    const range = this.woundRange;
    range[bound] = value;
    if (range.min > range.max) range[bound === "min" ? "max" : "min"] = value;
    const slider = filters.querySelector(".sbs-bestiary-range-slider");
    slider.style.setProperty("--wound-lower", `${range.min / 3 * 100}%`);
    slider.style.setProperty("--wound-upper", `${range.max / 3 * 100}%`);
    slider.dataset.overlap = String(range.min === range.max);
    for (const control of filters.querySelectorAll("[data-wound-bound]")) control.value = range[control.dataset.woundBound];
    for (const thumb of slider.querySelectorAll("input")) {
      thumb.setAttribute("aria-valuetext", WOUNDS[range[thumb.dataset.woundBound]]);
    }
  }

  async openFilter(group) {
    if (this.loading) return;
    await this.picker?.close();
    const name = GROUPS.find(([key]) => key === group)[1];
    const sources = this.selectedSources();
    const rows = this.rows();
    const catalog = this.catalog;
    const available = catalog.choices(rows, group);
    const choices = (entries = available) => [...entries.values()]
      .filter(choice => !this.filters.get(group)?.has(choice.key)).sort(byName);
    const picker = this.picker = new ChoicePicker({choices: choices(), loading: rows.some(row => !catalog.facets(row)), pageSize: 100,
      classes: ["sbs-bestiary-picker"], position: {height: 560}, window: {title: `Filter by ${name}`},
      onSelect: (_key, choice) => this.addFilter(group, choice)});
    await picker.render({force: true});
    // Foundry temporarily clears .rendered while either window updates. Its root
    // remains connected throughout a render, including a picker search.
    const active = () => picker === this.picker && picker.element?.isConnected && this.element?.isConnected;
    let failed = false;
    let publishTimer;
    const slow = setTimeout(() => {
      if (!active() || !picker.loading) return;
      picker.loadingMessage = "Some sources are taking longer. You can select available choices.";
      void picker.render().catch(report);
    }, 4000);
    try {
      await catalog.loadFacets(rows, [group], active, batch => {
        const count = available.size;
        for (const [key, choice] of catalog.choices(batch, group)) if (!available.has(key)) available.set(key, choice);
        if (available.size === count || publishTimer) return;
        publishTimer = setTimeout(() => {
          publishTimer = null;
          if (!active()) return;
          picker.entries = choices();
          void picker.render().catch(report);
        }, 100);
      });
    } catch (error) {
      failed = true;
      report(error);
    } finally {
      clearTimeout(slow);
      clearTimeout(publishTimer);
      if (active()) {
        picker.entries = choices(catalog.choices(rows, group));
        picker.loading = false;
        if (failed || sources.some(source => this.failed.has(source.name))) {
          picker.notice = "Some choices could not be read. Refresh the Bestiary to retry.";
        }
        await picker.render();
      }
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const groups = GROUPS.map(([key, label, icon]) => {
      const selected = this.filters.get(key) ?? new Map();
      return {key, label, icon, suggest: SUGGEST.has(key), count: selected.size,
        selected: [...selected].map(([key, name]) => ({key, name})), matchAny: this.anyGroups.has(key)};
    });
    const checked = (choices, type) => choices.map(choice => ({...choice, checked: this.filters.get(type)?.has(choice.key)}));
    const sources = checked(this.sources.map(({key, name}) => ({key, name})), "source");
    const ranks = checked(RANK_CHOICES, "rank");
    const wildcards = WILDCARDS.map(choice => ({...choice, checked: this.wildcard === choice.key,
      disabled: this.loading || !!this.wildcard && this.wildcard !== choice.key}));
    const matches = [];
    const missingFacets = [];
    const missingRatings = [];
    const filters = [...this.filters].filter(([key, values]) => values.size && key !== "source" && key !== "rank")
      .map(([key, values]) => [key, [...values.keys()]]);
    const {min, max} = this.woundRange;
    const woundFilter = min !== 0 || max !== 3;
    const {min: minCR, max: maxCR} = this.crRange;
    const crFilter = minCR !== null || maxCR !== null;
    if (!this.loading) {
      const nameMatches = npcNameSearch(this.query);
      const ranks = this.filters.get("rank");
      for (const row of this.rows()) {
        if (!nameMatches(row.name) || (this.wildcard && this.wildcard !== (row.wildcard ? "wildcard" : "extra")) ||
          (ranks?.size && !ranks.has(row.rank))) continue;
        const facets = this.catalog.facets(row);
        const wounds = this.catalog.wounds.get(row.uuid);
        if ((filters.length && !facets) || (woundFilter && wounds === undefined)) {
          missingFacets.push(row);
          continue;
        }
        if (woundFilter && !inWoundRange(wounds, min, max)) continue;
        if (!filters.every(([type, values]) => {
          const choices = facets?.get(type);
          return this.anyGroups.has(type) ? values.some(key => choices?.has(key)) : values.every(key => choices?.has(key));
        })) continue;
        if (crFilter) {
          const rating = this.catalog.rating(row);
          if (!rating) {
            missingRatings.push(row);
            continue;
          }
          if (rating.cr == null || rating.cr < (minCR ?? -Infinity) || rating.cr > (maxCR ?? Infinity)) continue;
        }
        matches.push(row);
      }
      matches.sort((a, b) => this.compareRows(a, b));
    }
    const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const pageRows = matches.slice(this.page * PAGE_SIZE, (this.page + 1) * PAGE_SIZE);
    const ratingRows = crFilter ? missingRatings : (this.sort === "cr" ? matches : pageRows).filter(row => !this.catalog.rating(row));
    const filterGroups = filters.map(([group]) => group);
    if (woundFilter) filterGroups.push("wounds");
    return {...context, groups, sources, ranks, wildcards, woundOptions: WOUNDS, woundRange: this.woundRange,
      woundLower: min / 3 * 100, woundUpper: max / 3 * 100, query: this.query, sourceQuery: this.sourceQuery, loading: this.loading,
      crFrom: minCR === null ? "" : formatCR(minCR), crTo: maxCR === null ? "" : formatCR(maxCR),
      sort: this.sort, sortOptions: SORT_OPTIONS, ascending: this.ascending,
      canDrag: CONFIG.Actor.documentClass.canUserCreate(game.user) || game.user.can("TOKEN_CREATE"),
      canBuild: CONFIG.Actor.documentClass.canUserCreate(game.user),
      matches: pageRows.map(row => ({...row, rankClass: row.rank.toLowerCase(), rating: ratingLabel(this.catalog.rating(row))})),
      count: matches.length, missingFacets, filterGroups, ratingRows,
      filtering: missingFacets.length > 0, filteringCR: missingRatings.length > 0,
      sortingCR: !crFilter && this.sort === "cr" && ratingRows.length > 0,
      page: this.page + 1, pages, hasPages: pages > 1, previous: this.page > 0, next: this.page + 1 < pages,
      failed: [...this.failed].join(", ")};
  }

  compareRows(a, b) {
    const direction = this.ascending ? 1 : -1;
    if (this.sort === "cr") {
      const aCR = this.catalog.rating(a)?.rawCR, bCR = this.catalog.rating(b)?.rawCR;
      if ((aCR == null) !== (bCR == null)) return aCR == null ? 1 : -1;
      if (aCR != null && aCR !== bCR) return direction * (aCR - bCR);
    }
    if (this.sort === "rank" && a.rank !== b.rank) {
      if (a.rank === "Unrated" || b.rank === "Unrated") return a.rank === "Unrated" ? 1 : -1;
      return direction * (rankOrder(a.rank) - rankOrder(b.rank));
    }
    return (this.sort === "name" ? direction : 1) * byName(a, b) || byName(a.source, b.source);
  }

  async showMatches({page = 0, parts} = {}) {
    this.resultJob = null;
    this.page = page;
    await this.render({parts});
    this.element?.querySelector(".sbs-bestiary-list")?.scrollTo(0, 0);
  }

  _preSyncPartState(partId, element, prior, state) {
    super._preSyncPartState(partId, element, prior, state);
    if (partId !== "filters") return;
    for (const details of element.querySelectorAll("details[data-filter]")) {
      const previous = prior.querySelector(`details[data-filter="${details.dataset.filter}"]`);
      if (previous) details.open = previous.open;
    }
  }

  async finishResults(context, active) {
    if (context.missingFacets.length) {
      await this.catalog.loadFacets(context.missingFacets, context.filterGroups, active);
      if (active()) await this.render({parts: ["results"]});
      return;
    }
    const badges = new Map([...this.parts.results.querySelectorAll("[data-cr-uuid]")]
      .map(badge => [badge.dataset.crUuid, badge]));
    await this.catalog.loadRatings(context.ratingRows, active, (row, rating) => {
      const badge = badges.get(row.uuid);
      if (!badge) return;
      const {value, title} = ratingLabel(rating);
      badge.textContent = value;
      badge.title = title;
    });
    if (active() && (context.filteringCR || context.sortingCR || context.failed !== [...this.failed].join(", "))) await this.render({parts: ["results"]});
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    if (options.parts.includes("filters")) {
      const filters = this.parts.filters;
      filters.querySelector(".sbs-bestiary-range-slider").addEventListener("pointerdown", dragOverlappingWounds);
      filters.querySelector("[data-query]").addEventListener("input", event => {
        this.query = event.target.value;
        this.resultJob = null;
        clearTimeout(this.searchTimer);
        this.searchTimer = setTimeout(() => this.showMatches({parts: ["results"]}).catch(report), 80);
      });
      const sourceSearch = filters.querySelector("[data-source-query]");
      const sourceLabels = [...filters.querySelectorAll("[data-source-name]")];
      const filterSources = () => {
        this.sourceQuery = sourceSearch.value;
        const matches = npcNameSearch(this.sourceQuery);
        for (const label of sourceLabels) label.hidden = !matches(label.dataset.sourceName);
      };
      sourceSearch.addEventListener("input", filterSources);
      filterSources();
      for (const input of filters.querySelectorAll("[data-facet-input]")) this.fillSuggestions(input);
      filters.addEventListener("focusin", event => {
        if (event.target.matches("[data-facet-input]")) this.loadSuggestions();
      });
      filters.addEventListener("input", event => {
        const input = event.target;
        if (input.matches("[data-facet-input]")) {
          this.loadSuggestions();
          this.fillSuggestions(input);
          if (event.inputType === "insertReplacementText") this.submitSuggestion(input, false);
        } else if (input.matches('input[type="range"][data-wound-bound]')) {
          this.updateWounds(input, filters);
          clearTimeout(this.woundTimer);
          this.woundTimer = setTimeout(() => this.showMatches({parts: ["results"]}).catch(report), 100);
        }
      });
      filters.addEventListener("keydown", event => {
        if (event.key !== "Enter") return;
        if (event.target.matches("[data-cr-bound]")) {
          event.preventDefault();
          event.target.blur();
          return;
        }
        if (!event.target.matches("[data-facet-input]")) return;
        event.preventDefault();
        this.submitSuggestion(event.target, true);
      });
      filters.addEventListener("change", event => {
        const input = event.target;
        if (input.matches("[data-cr-bound]")) {
          const bound = input.dataset.crBound;
          const value = parseCR(input.value);
          if (value === undefined) {
            ui.notifications.warn("Enter a Creature Rating between -2 and 9999, such as 1/2.");
            input.value = this.crRange[bound] === null ? "" : formatCR(this.crRange[bound]);
            return;
          }
          this.crRange[bound] = value;
          const {min, max} = this.crRange;
          if (min !== null && max !== null && min > max) this.crRange[bound === "min" ? "max" : "min"] = value;
          for (const field of filters.querySelectorAll("[data-cr-bound]")) {
            const bound = this.crRange[field.dataset.crBound];
            field.value = bound === null ? "" : formatCR(bound);
          }
          clearTimeout(this.searchTimer);
          void this.showMatches({parts: ["results"]}).catch(report);
          return;
        }
        if (input.matches("[data-wound-bound]")) {
          this.updateWounds(input, filters);
          clearTimeout(this.woundTimer);
          void this.showMatches({parts: ["results"]}).catch(report);
          return;
        }
        if (input.matches("[data-facet-input]")) {
          this.submitSuggestion(input, false);
          return;
        }
        if (input.matches("[data-wildcard]")) this.wildcard = input.checked ? input.dataset.wildcard : null;
        else if (input.matches("[data-sort]")) this.sort = input.value;
        else if (input.matches("[data-inline-group]")) {
          const {inlineGroup: group, key, label} = input.dataset;
          const selected = this.filters.get(group) ?? new Map();
          if (input.checked) selected.set(key, label);
          else selected.delete(key);
          this.filters.set(group, selected);
          if (group === "source") {
            this.suggestions = null;
            const picker = this.picker;
            this.picker = null;
            void picker?.close().catch(report);
          }
        } else if (input.matches("[data-match-group]")) {
          const group = input.dataset.matchGroup;
          if (input.value === "any") this.anyGroups.add(group);
          else this.anyGroups.delete(group);
        } else return;
        clearTimeout(this.searchTimer);
        void this.showMatches().catch(report);
      });
    }
    if (!options.parts.includes("results")) return;
    const job = this.resultJob = {};
    const active = () => this.resultJob === job && this.element?.isConnected && !this.loading;
    if (context.missingFacets.length || context.ratingRows.length) void this.finishResults(context, active).catch(report);
    this.parts.results.querySelector(".sbs-bestiary-list").addEventListener("dragstart", event => {
      const row = event.target.closest('li[draggable="true"]');
      if (!row || !event.dataTransfer) return;
      event.dataTransfer.setData(BESTIARY_DRAG, row.dataset.uuid);
      // Keep the canvas and sidebar reachable even when the browser covers them.
      const frame = this.element;
      const revealTargets = requestAnimationFrame(() => frame.classList.add("sbs-bestiary-dragging"));
      row.addEventListener("dragend", () => {
        cancelAnimationFrame(revealTargets);
        frame.classList.remove("sbs-bestiary-dragging");
      }, {once: true});
    });
  }

  async _onClose(options) {
    clearTimeout(this.searchTimer);
    clearTimeout(this.woundTimer);
    this.suggestions = null;
    this.resultJob = null;
    await this.picker?.close();
    await super._onClose(options);
  }
}

let browser;
export async function openBestiary() {
  if (browser?.element?.isConnected) { browser.bringToFront(); return browser; }
  browser = new BestiaryBrowser();
  await browser.render({force: true});
  void browser.refresh().catch(report);
  return browser;
}

async function resolveNPC(uuid) {
  const actor = await foundry.utils.fromUuid(uuid);
  if (actor?.documentName !== "Actor" || actor.type !== "npc" || !actor.visible) throw new Error("This NPC is no longer available.");
  return actor;
}

const pendingImports = new Map();

async function worldNPC(actor, folder = null) {
  if (!actor.inCompendium) return actor;
  const existing = game.actors.find(entry => entry.type === "npc" && entry._stats?.compendiumSource === actor.uuid);
  if (existing) return existing;
  if (!CONFIG.Actor.documentClass.canUserCreate(game.user)) return null;
  if (!pendingImports.has(actor.uuid)) {
    const data = game.actors.fromCompendium(actor, {clearFolder: true});
    data.folder = folder;
    const importing = CONFIG.Actor.documentClass.create(data, {fromCompendium: true})
      .finally(() => pendingImports.delete(actor.uuid));
    pendingImports.set(actor.uuid, importing);
  }
  return pendingImports.get(actor.uuid);
}

function bestiaryDropTarget(target) {
  return target?.closest?.("#board") || target?.closest?.(".actors-sidebar .directory-list") ||
    (ui.actors?.element?.querySelector(".directory-list")?.contains(target) ?? false);
}

export function installBestiary() {
  wrapMethod(foundry.applications.ux.TextEditor.implementation, "getDragEventData", function (original, event) {
    const uuid = event.dataTransfer?.getData(BESTIARY_DRAG);
    if (!uuid) return original(event);
    return bestiaryDropTarget(event.target) ? {type: "Actor", uuid, sbsBestiary: true} : {};
  });
  document.addEventListener("dragover", event => {
    if (event.dataTransfer?.types.includes(BESTIARY_DRAG) && bestiaryDropTarget(event.target)) event.preventDefault();
  });

  Hooks.on("renderActorDirectory", (_app, root) => {
    const footer = root.querySelector(".directory-footer");
    if (!footer || footer.querySelector(".sbs-open-bestiary")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sbs-open-bestiary";
    button.innerHTML = '<i class="fa-solid fa-paw" inert></i> Browse Bestiary';
    button.addEventListener("click", () => openBestiary().catch(report));
    footer.append(button);
  });

  wrapMethod(CONFIG.ui.actors.prototype, "_handleDroppedEntry", async function (original, target, data) {
    if (!data.sbsBestiary) return original(target, data);
    try {
      const actor = await resolveNPC(data.uuid);
      const targetFolder = target?.closest(".directory-item.folder");
      targetFolder?.classList.remove("droptarget");
      const world = await worldNPC(actor, targetFolder?.dataset.folderId);
      await world?.sheet.render({force: true});
      return world;
    } catch (error) { report(error); }
  });

  wrapMethod(CONFIG.Canvas.layers.tokens.layerClass.prototype, "_onDropActorData", async function (original, event, data) {
    if (!data.sbsBestiary) return original(event, data);
    try {
      if (!game.user.can("TOKEN_CREATE") || !canvas.dimensions.rect.contains(data.x, data.y)) return;
      const world = await worldNPC(await resolveNPC(data.uuid));
      if (!world) return;
      const token = await original(event, {...data, uuid: world.uuid});
      await token?.baseActor?.sheet.render({force: true});
      return token;
    } catch (error) { report(error); }
  });
}
