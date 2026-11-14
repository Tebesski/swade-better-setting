import {openNPCBuilder} from "./npc-builder.mjs";
import {EFFECTS, NPC_FLAG, actorRating, managedTags, npcRank, rankIndex} from "./npc-data.mjs";
import {MIN_CR, RANKS, advancementStrength, encounterThreat, formatCR, parseCR} from "./npc-math.mjs";
import {MODULE_ID} from "./skills.mjs";
import {wrapMethod} from "./integrations.mjs";

function refreshThreat(app, root) {
  if (!game.user.isGM || !root) return;
  root.querySelector(".sbs-encounter-threat")?.remove();
  const combat = app.viewed;
  const tracker = root.querySelector(".combat-tracker");
  if (!combat || !tracker || combat.type === "dramaticTask") return;
  const {HOSTILE, FRIENDLY, SECRET} = CONST.TOKEN_DISPOSITIONS;
  const party = {strength: 0, cr: 0, count: 0};
  const enemies = {strength: 0, cr: 0, count: 0};
  let unrated = 0;
  const scores = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!actor) continue;
    const disposition = combatant.token?.disposition ?? actor.prototypeToken?.disposition;
    const side = disposition === FRIENDLY ? party : disposition === HOSTILE || disposition === SECRET ? enemies : null;
    if (!side) continue;
    const rating = actorRating(actor);
    scores.set(combatant.id, rating);
    const fallback = rating.coverage === "Unrated";
    if (fallback) unrated++;
    side.cr += fallback ? MIN_CR : rating.cr;
    side.count++;
    if (!combatant.isDefeated && !combatant.isIncapacitated && !actor.system.status?.isIncapacitated) {
      side.strength += fallback ? advancementStrength(MIN_CR) : rating.strength;
    }
  }
  const {label, threat, partyWin} = encounterThreat(enemies.strength, party.strength);
  const panel = document.createElement("section");
  panel.className = "sbs-encounter-threat";
  const heading = document.createElement("strong");
  heading.textContent = `Threat Level: ${label}`;
  const scale = document.createElement("div");
  scale.className = "sbs-threat-scale";
  scale.tabIndex = 0;
  const average = side => side.count ? formatCR(Number((side.cr / side.count).toFixed(1))) : "—";
  const win = partyWin == null ? "—" : `${Math.round(partyWin * 100)}%`;
  const details = [`Average party CR: ${average(party)}`, `Average encounter CR: ${average(enemies)}`, `Estimated party win chance: ${win}`];
  if (unrated) details.push(`Unrated combatants count as CR ${formatCR(MIN_CR)} in this encounter.`);
  scale.dataset.tooltip = details.join("<br>");
  scale.setAttribute("aria-label", details.join(". "));
  if (threat !== null) {
    const pointer = document.createElement("i");
    pointer.className = "sbs-threat-pointer";
    pointer.style.setProperty("--threat", `${threat * 100}%`);
    pointer.setAttribute("aria-hidden", "true");
    scale.append(pointer);
  }
  panel.append(heading, scale);
  tracker.before(panel);
  for (const row of tracker.querySelectorAll("[data-combatant-id].combatant")) {
    row.querySelector(".sbs-combatant-cr")?.remove();
    const rating = scores.get(row.dataset.combatantId);
    const name = row.querySelector(".token-name");
    if (!rating || !name) continue;
    const badge = document.createElement("small");
    badge.className = "sbs-combatant-cr";
    badge.textContent = rating.coverage === "Unrated" ? rating.coverage : `CR ${formatCR(rating.cr)}`;
    badge.dataset.tooltip = foundry.utils.escapeHTML([rating.coverage, ...rating.warnings].join("\n"));
    name.append(badge);
  }
}

function npcRankControl(actor) {
  const rank = document.createElement("select");
  rank.setAttribute("aria-label", "NPC rank");
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
  cr.setAttribute("aria-label", "Creature Rating");
  const updateRating = () => {
    const rating = actorRating(actor);
    cr.value = rating.coverage === "Unrated" && editable ? "" : formatCR(rating.coverage === "Unrated" ? null : rating.cr);
  };
  updateRating();
  if (editable) {
    cr.addEventListener("keydown", event => {
      if (event.key === "Enter") { event.preventDefault(); cr.blur(); }
    });
    cr.addEventListener("change", async event => {
      event.stopPropagation();
      const rating = parseCR(cr.value);
      if (rating === undefined) ui.notifications.warn("Enter a Creature Rating between -2 and 9999, such as 1/2.");
      else {
        try { await actor.update({[`${NPC_FLAG}.cr`]: rating}); }
        catch (error) { ui.notifications.error(error.message); }
      }
      updateRating();
    });
  }
  const crLabel = document.createElement(editable ? "label" : "span");
  crLabel.className = "sbs-sheet-cr";
  crLabel.append("CR ", cr);
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
  wrapMethod(actors, "calcArmor", function (original, location = "torso") {
    const armor = location === "torso" ? defense(this, "armor") : undefined;
    return armor ?? original(location);
  });
  wrapMethod(actors, "calcToughness", function (original, ...args) {
    const total = defense(this, "toughness");
    return total == null ? original(...args) : total - this.calcArmor();
  });
  Hooks.on("swadePreRollAttribute", (actor, attribute) => {
    if (attribute !== "strength" || actor.system.stats?.size !== -4) return;
    ui.notifications.info("Tiny creatures have fixed Strength 1 and do not roll Strength.");
    return false;
  });

  Hooks.on("renderActorDirectory", (_app, root) => {
    const footer = root.querySelector(".directory-footer");
    if (!footer || footer.querySelector(".sbs-open-builder") || !CONFIG.Actor.documentClass.canUserCreate(game.user)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sbs-open-builder";
    button.innerHTML = '<i class="fa-solid fa-hammer" inert></i> NPC Builder';
    button.addEventListener("click", () => openNPCBuilder());
    if (footer.querySelector(".sbs-open-bestiary")) footer.querySelector(".sbs-open-bestiary").before(button);
    else footer.append(button);
  });
  Hooks.on("renderCharacterSheet", actorCRControl);
  Hooks.on("renderSwadeNPCSheet", actorCRControl);
  Hooks.on("renderCombatTracker", refreshThreat);
  let refreshPending = false;
  const refresh = () => {
    if (!game.user.isGM || refreshPending) return;
    refreshPending = true;
    queueMicrotask(() => {
      refreshPending = false;
      for (const app of [ui.combat, ui.combat?.popout]) {
        if (app?.element?.isConnected) refreshThreat(app, app.element);
      }
    });
  };
  for (const hook of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect",
    "deleteActiveEffect", "updateToken", "updateCombatant"]) Hooks.on(hook, refresh);
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
