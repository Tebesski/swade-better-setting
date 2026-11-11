import {openNPCBuilder} from "./npc-builder.mjs";
import {EFFECTS, NPC_FLAG, actorRating, managedTags, npcRank, rankIndex} from "./npc-data.mjs";
import {RANKS, bounded, encounterThreat, roundCR} from "./npc-math.mjs";
import {MODULE_ID} from "./skills.mjs";
import {wrapMethod} from "./integrations.mjs";

function refreshThreat(app, root) {
  if (!game.user.isGM || !root) return;
  root.querySelector(".sbs-encounter-threat")?.remove();
  const combat = app.viewed;
  const tracker = root.querySelector(".combat-tracker");
  if (!combat || !tracker || combat.type === "dramaticTask") return;
  const {HOSTILE, FRIENDLY, SECRET} = CONST.TOKEN_DISPOSITIONS;
  const party = {strength: 0, cr: 0, count: 0, unrated: 0};
  const enemies = {strength: 0, cr: 0, count: 0, unrated: 0};
  const scores = new Map();
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (combatant.defeated || combatant.isDefeated || combatant.isIncapacitated || actor?.system.status?.isIncapacitated) continue;
    if (!["character", "npc"].includes(actor?.type)) continue;
    const disposition = combatant.token?.disposition ?? actor.prototypeToken.disposition;
    const enemy = disposition === HOSTILE || disposition === SECRET;
    const allied = !enemy && (disposition === FRIENDLY || actor.hasPlayerOwner);
    if (!enemy && !allied) continue;
    const rating = actorRating(actor);
    scores.set(combatant.id, rating);
    const side = enemy ? enemies : party;
    if (rating.coverage === "Unrated") { side.unrated++; continue; }
    side.strength += rating.strength;
    side.cr += rating.rawCR;
    side.count++;
  }
  const unknownSide = [party, enemies].some(side => !side.count && side.unrated);
  const {label, threat, partyWin} = unknownSide ? {label: "Unrated", threat: null} : encounterThreat(enemies.strength, party.strength);
  const panel = document.createElement("section");
  panel.className = "sbs-encounter-threat";
  const heading = document.createElement("strong");
  heading.textContent = `Threat Level: ${label}`;
  const scale = document.createElement("div");
  scale.className = "sbs-threat-scale";
  scale.tabIndex = 0;
  const average = side => side.count ? (side.cr / side.count).toFixed(1) : "—";
  const win = threat === null ? "—" : `${Math.round(partyWin * 100)}%`;
  const details = [`Average party CR: ${average(party)}`, `Average encounter CR: ${average(enemies)}`, `Estimated party win chance: ${win}`];
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
    badge.textContent = rating.coverage === "Unrated" ? rating.coverage : `CR ${rating.cr}`;
    badge.dataset.tooltip = foundry.utils.escapeHTML([rating.coverage, ...rating.warnings].join("\n"));
    name.append(badge);
  }
}

function npcControls(app, root) {
  const actor = app.document;
  if (!game.user.isGM || actor?.type !== "npc" || !app.isEditable) return;
  const header = root.querySelector(".window-header");
  if (!header) return;
  header.querySelector(".sbs-npc-sheet-controls")?.remove();
  const controls = document.createElement("div");
  controls.className = "sbs-npc-sheet-controls";
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
  const cr = document.createElement("input");
  cr.type = "number";
  cr.min = "0";
  cr.max = "9999";
  cr.step = "1";
  cr.setAttribute("aria-label", "Creature Rating");
  const updateRating = () => {
    const rating = actorRating(actor);
    cr.dataset.tooltip = foundry.utils.escapeHTML([`CR is the equivalent number of advances on a reference Wild Card PC. Edit to override or clear to restore the estimate.`, ...rating.warnings].join("\n"));
    cr.value = rating.coverage === "Unrated" ? "" : rating.cr;
  };
  updateRating();
  cr.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); cr.blur(); }
  });
  cr.addEventListener("change", async () => {
    try {
      await actor.update({[`${NPC_FLAG}.cr`]: cr.value === "" ? null : roundCR(bounded(Number(cr.value), 0, 9999))});
      updateRating();
    } catch (error) { ui.notifications.error(error.message); }
  });
  const crLabel = document.createElement("label");
  crLabel.append("CR ", cr);
  controls.append(rank, crLabel);
  header.querySelector('[data-action="toggleControls"], [data-action="close"]')?.before(controls);
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
  Hooks.on("renderSwadeNPCSheet", npcControls);
  Hooks.on("renderCombatTracker", refreshThreat);
  const refresh = () => {
    if (!game.user.isGM) return;
    for (const app of foundry.applications.instances.values()) {
      if (app instanceof foundry.applications.sidebar.tabs.CombatTracker && app.rendered) refreshThreat(app, app.element);
    }
  };
  for (const hook of ["updateActor", "createItem", "updateItem", "deleteItem", "createActiveEffect", "updateActiveEffect", "deleteActiveEffect", "updateToken"]) Hooks.on(hook, refresh);
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
