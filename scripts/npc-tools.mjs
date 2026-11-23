import {t as sbsI18n} from "./i18n.mjs";
import {openNPCBuilder} from "./npc-builder.mjs";
import {EFFECTS, NPC_FLAG, actorCombatProfile, actorRating, managedTags, npcRank, rankIndex} from "./npc-data.mjs";
import {MIN_CR, RANKS, advancementStrength, encounterThreat, formatCR, parseCR, threatLabel} from "./npc-math.mjs";
import {MAX_FORECAST_COMBATANTS} from "./encounter-forecast.mjs";
import {cancelEncounterForecast, requestEncounterForecast} from "./encounter-job.mjs";
import {MODULE_ID} from "./skills.mjs";
import {wrapMethod} from "./integrations.mjs";

function encounterSnapshot(actor, rating) {
  const {profile, warnings} = rating.profile ? rating : actorCombatProfile(actor);
  if (!profile.attacks.length) return null;
  const system = actor.system;
  const pools = {};
  for (const {resource} of profile.attacks) {
    if (resource) pools[resource.key] = system.powerPoints?.[resource.key.slice(3)]?.value ?? resource.capacity;
  }
  return {profile, wounds: system.wounds.value, shaken: system.status?.isShaken,
    fatigue: Math.max(0, (system.fatigue?.value ?? 0) - (system.fatigue?.ignored ?? 0)),
    bennies: actor.isWildcard ? system.bennies.value : 0, pools, partial: warnings.length > 0};
}

function refreshThreat(app, root, ratings = new Map()) {
  if (!game.user.isGM || !root) return;
  root.querySelector(".sbs-encounter-threat")?.remove();
  const combat = app.viewed;
  const tracker = root.querySelector(".combat-tracker");
  if (!combat || !tracker || combat.type === "dramaticTask") return;
  const {HOSTILE, FRIENDLY, SECRET} = CONST.TOKEN_DISPOSITIONS;
  const party = {strength: 0, cr: 0, count: 0, active: []};
  const enemies = {strength: 0, cr: 0, count: 0, active: []};
  let unrated = 0;
  const scores = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const disposition = combatant.token?.disposition ?? actor.prototypeToken?.disposition;
    const side = disposition === FRIENDLY ? party : disposition === HOSTILE || disposition === SECRET ? enemies : null;
    if (!side) continue;
    // Linked tokens share an actor. Rate that actor once, while counting every
    // combatant separately in the encounter totals.
    if (!ratings.has(actor)) ratings.set(actor, actorRating(actor));
    const rating = ratings.get(actor);
    scores.set(combatant.id, rating);
    const fallback = rating.rated === false;
    if (fallback) unrated++;
    side.cr += fallback ? MIN_CR : rating.cr;
    side.count++;
    if (!combatant.isDefeated && !combatant.isIncapacitated && !actor.system.status?.isIncapacitated) {
      side.active.push(combatant);
      side.strength += fallback ? advancementStrength(MIN_CR) : rating.strength;
    }
  }
  const budget = encounterThreat(enemies.strength, party.strength, {partyPresent: party.count > 0});
  const panel = document.createElement("section");
  panel.className = "sbs-encounter-threat";
  const heading = document.createElement("strong");
  const scale = document.createElement("div");
  scale.className = "sbs-threat-scale";
  scale.tabIndex = 0;
  const average = side => side.count ? formatCR(Number((side.cr / side.count).toFixed(1))) : "—";
  const details = [sbsI18n("swade-better-setting.CR.PartyAverage", {value: average(party)}),
    sbsI18n("swade-better-setting.CR.EnemyAverage", {value: average(enemies)})];
  if (unrated) details.push(sbsI18n("swade-better-setting.CR.UnratedFallback", {count: unrated, cr: formatCR(MIN_CR)}));
  function display(label, threat, notes) {
    heading.textContent = sbsI18n("swade-better-setting.UI.ThreatLevel_4f38feb60a", {p0: label});
    const lines = [...details, ...notes];
    scale.dataset.tooltip = lines.join("<br>");
    scale.setAttribute("aria-label", lines.join("\n"));
    scale.replaceChildren();
    if (threat === null) return;
    const pointer = document.createElement("i");
    pointer.className = "sbs-threat-pointer";
    pointer.style.setProperty("--threat", `${threat * 100}%`);
    pointer.setAttribute("aria-hidden", "true");
    scale.append(pointer);
  }
  const budgetNotes = [sbsI18n("swade-better-setting.CR.WinEstimate", {
    value: budget.partyWin == null ? "—" : `${Math.round(budget.partyWin * 100)}%`
  })];
  if (party.active.length && enemies.active.length && party.active.length !== enemies.active.length) {
    budgetNotes.push(sbsI18n("swade-better-setting.CR.UnevenNumbers", {party: party.active.length, enemies: enemies.active.length}));
  }
  panel.append(heading, scale);
  tracker.before(panel);
  showEncounterForecast({combat, party, enemies, ratings, panel, budget, budgetNotes, display});
  for (const row of tracker.querySelectorAll("[data-combatant-id].combatant")) {
    row.querySelector(".sbs-combatant-cr")?.remove();
    const rating = scores.get(row.dataset.combatantId);
    const name = row.querySelector(".token-name");
    if (!rating || !name) continue;
    const badge = document.createElement("small");
    badge.className = "sbs-combatant-cr";
    badge.textContent = rating.rated === false ? rating.coverage : `CR ${formatCR(rating.cr)}`;
    badge.dataset.tooltip = foundry.utils.escapeHTML([rating.coverage, ...rating.warnings].join("\n"));
    name.append(badge);
  }
}

function showEncounterForecast({combat, party, enemies, ratings, panel, budget, budgetNotes, display}) {
  const active = [...party.active, ...enemies.active].map(combatant => combatant.actor);
  let reason;
  if (active.some(actor => ratings.get(actor).manual)) reason = "swade-better-setting.CR.ForecastManual";
  else if (active.length > MAX_FORECAST_COMBATANTS) reason = "swade-better-setting.CR.ForecastLarge";
  else if (active.some(actor => !["character", "npc"].includes(actor.type) || !ratings.get(actor).rated)) reason = "swade-better-setting.CR.ForecastMissing";
  let sides;
  if (party.active.length && enemies.active.length && !reason) {
    const actors = new Map([...new Set(active)].map(actor => [actor, encounterSnapshot(actor, ratings.get(actor))]));
    sides = [party, enemies].map(side => side.active.map(({actor, group}) => {
      const entry = actors.get(actor);
      return entry && {...entry, group: group?.id ?? null};
    }));
    if (sides.some(side => side.includes(null))) reason = "swade-better-setting.CR.ForecastMissing";
  }
  if (!sides || reason) {
    cancelEncounterForecast(combat);
    if (reason && party.active.length && enemies.active.length) budgetNotes.push(sbsI18n(reason));
    display(budget.label, budget.threat, budgetNotes);
  } else {
    display(budget.label, budget.threat, [...budgetNotes, sbsI18n("swade-better-setting.CR.ForecastPending")]);
    const cap = game.settings.get("swade", "woundCap") ? 4 : 0;
    requestEncounterForecast(combat, sides, cap).then(result => {
      if (!panel.parentElement) return;
      if (!result) return display(budget.label, budget.threat, [...budgetNotes, sbsI18n("swade-better-setting.CR.ForecastUnavailable")]);
      const {wins, unresolved, trials} = result;
      const fraction = wins / trials;
      const value = new Intl.NumberFormat(game.i18n?.lang, {style: "percent",
        maximumFractionDigits: fraction > 0 && fraction < .01 || fraction > .99 && fraction < 1 ? 2 : 0}).format(fraction);
      const notes = [sbsI18n("swade-better-setting.CR.ForecastWins", {value, wins, trials})];
      if (sides.some(side => side.some(actor => actor.partial))) notes.push(sbsI18n("swade-better-setting.CR.ForecastPartial"));
      if (unresolved) notes.push(sbsI18n("swade-better-setting.CR.ForecastUnresolved", {unresolved, trials}));
      const low = (trials - wins - unresolved) / trials, high = (trials - wins) / trials;
      if (threatLabel(low) !== threatLabel(high)) return display(sbsI18n("swade-better-setting.CR.Inconclusive"), null, notes);
      const threat = (low + high) / 2;
      display(threatLabel(threat), threat, notes);
    });
  }
}

function npcRankControl(actor) {
  const rank = document.createElement("select");
  rank.setAttribute("aria-label", sbsI18n("swade-better-setting.UI.NPCrank_9e7c51da46"));
  for (const label of RANKS) rank.append(new Option(label, label));
  const currentRank = npcRank(actor);
  if (!RANKS.includes(currentRank)) rank.prepend(new Option(currentRank, currentRank));
  rank.value = currentRank;
  rank.addEventListener("change", async () => {
    const label = rank.value;
    const index = rankIndex(label);
    if (index < 0) return;
    const npc = actor.getFlag(MODULE_ID, "npc");
    const tags = managedTags(actor.flags?.[EFFECTS]?.tags, label, actor.isWildcard, npc?.archetypeTag ?? npc?.role, [], game.modules.get(EFFECTS)?.api);
    try {
      await actor.update({[`${NPC_FLAG}.rank`]: label, [`flags.${EFFECTS}.tags`]: tags,
        "system.advances.mode": "legacy", "system.advances.rank": label, "system.advances.value": index * 4});
    } catch (error) { ui.notifications.error(error.message); }
  });
  return rank;
}

function actorCRControl(app, root) {
  const actor = app.document;
  if (!["character", "npc"].includes(actor?.type)) return;
  const rankField = root.querySelector('.character-detail.rank:has([name="system.advances.rank"])');
  root.querySelector(".character-detail.advances")?.removeAttribute("data-tooltip");
  if (rankField?.dataset.tooltip) {
    rankField.querySelector('[name="system.advances.rank"]').dataset.tooltip = rankField.dataset.tooltip;
    rankField.removeAttribute("data-tooltip");
  }
  const header = root.querySelector(".window-header");
  if (!rankField && !header) return;
  root.querySelector(".sbs-npc-sheet-controls")?.remove();
  const controls = document.createElement("span");
  controls.className = "sbs-npc-sheet-controls";
  const editable = game.user.isGM && app.isEditable;
  if (!rankField) controls.append(editable ? npcRankControl(actor) : npcRank(actor));
  const cr = document.createElement(editable ? "input" : "output");
  if (editable) {
    cr.type = "text";
    cr.placeholder = "—";
  }
  cr.setAttribute("aria-label", sbsI18n("swade-better-setting.UI.CreatureRating_3c8803106b"));
  const updateRating = () => {
    const rating = actorRating(actor);
    cr.value = rating.rated ? formatCR(rating.cr) : editable ? "" : "—";
  };
  updateRating();
  if (editable) {
    cr.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); cr.blur(); }
    });
    cr.addEventListener("change", async event => {
      event.stopPropagation();
      const rating = parseCR(cr.value);
      if (rating === undefined) ui.notifications.warn(sbsI18n("swade-better-setting.UI.EnteraCreatureRatingbetween2_f2f3095b31"));
      else {
        try { await actor.update({[`${NPC_FLAG}.cr`]: rating}); }
        catch (error) { ui.notifications.error(error.message); }
      }
      updateRating();
    });
  }
  const crLabel = document.createElement(editable ? "label" : "span");
  crLabel.className = "sbs-sheet-cr";
  crLabel.append(sbsI18n("swade-better-setting.UI.CR_69c295250c"), cr);
  controls.append(crLabel);
  if (rankField) rankField.append(controls);
  else header.querySelector('[data-action="toggleControls"], [data-action="close"]')?.before(controls);
}

export function installNPCTools() {
  const actors = CONFIG.Actor.documentClass.prototype;
  const defense = (actor, key) => {
    const value = actor.type === "npc" ? actor.flags?.[MODULE_ID]?.npc?.defenses?.[key] : undefined;
    return Number.isFinite(value) ? value : undefined;
  };
  wrapMethod(actors, "calcParry", function (original, ...args) {
    return defense(this, "parry") ?? original(...args);
  });
  wrapMethod(actors, "calcArmor", function (original, location = sbsI18n("swade-better-setting.UI.torso_2c9e8e214d")) {
    const armor = location === "torso" ? defense(this, "armor") : undefined;
    return armor ?? original(location);
  });
  wrapMethod(actors, "calcToughness", function (original, ...args) {
    const total = defense(this, "toughness");
    return total == null ? original(...args) : total - this.calcArmor();
  });
  Hooks.on("swadePreRollAttribute", (actor, attribute) => {
    if (attribute !== "strength" || actor.system.stats?.size !== -4) return;
    ui.notifications.info(sbsI18n("swade-better-setting.UI.TinycreatureshavefixedStrength1_940ba853d1"));
    return false;
  });

  Hooks.on("renderActorDirectory", (_app, root) => {
    const footer = root.querySelector(".directory-footer");
    if (!footer || footer.querySelector(".sbs-open-builder") || !CONFIG.Actor.documentClass.canUserCreate(game.user)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sbs-open-builder";
    button.innerHTML = `<i class="fa-solid fa-hammer" inert></i> ${sbsI18n("swade-better-setting.UI.NPCBuilder_3ca078e37c")}`;
    button.addEventListener("click", () => openNPCBuilder());
    if (footer.querySelector(".sbs-open-bestiary")) footer.querySelector(".sbs-open-bestiary").before(button);
    else footer.append(button);
  });
  Hooks.on("renderCharacterSheet", actorCRControl);
  Hooks.on("renderSwadeNPCSheet", actorCRControl);
  Hooks.on("renderCombatTracker", (app, root) => refreshThreat(app, root));
  Hooks.on("deleteCombat", cancelEncounterForecast);
  let refreshPending = false;
  const refresh = () => {
    if (!game.user.isGM || refreshPending) return;
    refreshPending = true;
    queueMicrotask(() => {
      refreshPending = false;
      // Share only within this refresh; effects, equipment and actor edits must
      // always be reflected in the next refresh, without stale rating caches.
      const ratings = new Map();
      for (const app of [ui.combat, ui.combat?.popout]) {
        if (app?.element?.isConnected) refreshThreat(app, app.element, ratings);
      }
    });
  };
  for (const hook of [sbsI18n("swade-better-setting.UI.updateActor_688e2852e2"), sbsI18n("swade-better-setting.UI.createItem_2be87307d5"), sbsI18n("swade-better-setting.UI.updateItem_fc765ef48a"), sbsI18n("swade-better-setting.UI.deleteItem_0259ed622a"), sbsI18n("swade-better-setting.UI.createActiveEffect_4607bdbb60"), sbsI18n("swade-better-setting.UI.updateActiveEffect_5ddfac034c"),
    sbsI18n("swade-better-setting.UI.deleteActiveEffect_1194b28b56"), sbsI18n("swade-better-setting.UI.updateToken_0a526b9437"), sbsI18n("swade-better-setting.UI.updateCombatant_37669944be")]) Hooks.on(hook, refresh);
  Hooks.on("preUpdateActor", (actor, changes) => {
    if (actor.type !== "npc" || !actor.getFlag(MODULE_ID, "npc")?.rank) return;
    const path = "system.wildcard";
    const wildcard = changes[path] ?? foundry.utils.getProperty(changes, path);
    const rankPath = "system.advances.rank";
    const rank = changes[rankPath] ?? foundry.utils.getProperty(changes, rankPath);
    if (wildcard === undefined && rankIndex(rank) < 0) return;
    const npc = actor.getFlag(MODULE_ID, "npc");
    const current = RANKS[rankIndex(rank)] ?? npc.rank;
    const tags = changes[`flags.${EFFECTS}.tags`] ?? foundry.utils.getProperty(changes, `flags.${EFFECTS}.tags`) ?? actor.flags?.[EFFECTS]?.tags;
    changes[`${NPC_FLAG}.rank`] = current;
    changes[`flags.${EFFECTS}.tags`] = managedTags(tags, current, wildcard ?? actor.isWildcard, npc.archetypeTag ?? npc.role, [], game.modules.get(EFFECTS)?.api);
  });
}
