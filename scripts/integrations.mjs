import {MODULE_ID, PACK_ID, normalizeName, skillData, withCoreSkills} from "./skills.mjs";
import {getPack, isPrimaryGM, librarySkills, storeSkill} from "./library.mjs";
import {createSkill} from "./creation.mjs";
import {SkillPicker} from "./picker.mjs";
const actorSkillPickers = new Map();

export function openLibrary() {
  return new SkillPicker({mode: "manage", onCreate: game.user.isGM && !getPack()?.locked ? () => createSkill() : undefined,
    window: {title: "Better Setting — Skills"}}).render({force: true});
}

export function openActorSkills(actor) {
  const existing = actorSkillPickers.get(actor.uuid);
  if (existing?.rendered) { existing.bringToFront(); return existing.render({force: true}); }
  const picker = new SkillPicker({actor, onCreate: () => createSkill({actor}), onSelect: async (_value, entry) => {
    if (!actor.isOwner) throw new Error("You do not have permission to add skills to this actor.");
    const skill = (await librarySkills()).find(item => item.id === entry.key);
    if (!skill) throw new Error("This skill is no longer in the compendium.");
    if (actor.items.some(item => item.type === "skill" && (normalizeName(item.name) === normalizeName(skill.name) ||
      (skill.system.swid && item.system.swid === skill.system.swid)))) {
      ui.notifications.info(`${skill.name} is already on this actor.`);
      return;
    }
    await CONFIG.Item.documentClass.create(skillData(skill), {parent: actor, renderSheet: true});
  }});
  actorSkillPickers.set(actor.uuid, picker);
  return picker.render({force: true});
}

function report(error) {
  console.error(`${MODULE_ID} |`, error);
  ui.notifications.error(error.message);
}

export function wrapMethod(object, name, wrapper) {
  const original = object[name];
  object[name] = function (...args) { return wrapper.call(this, original.bind(this), ...args); };
}

export function installCoreSkills() {
  for (const type of ["character", "npc"]) {
    wrapMethod(CONFIG.Actor.dataModels[type].prototype, "_preCreate", async function (original, ...args) {
      const actor = this.parent;
      if (actor.pack) return original(...args);
      const items = actor.toObject().items ?? [];
      // Await the system setup first, then replace its fixed PC core list with the library's list.
      const allowed = await original(...args);
      if (allowed === false) return false;
      const cores = (await librarySkills()).filter(item => item.system.isCoreSkill);
      // Preserve SWADE's Unskilled roll when the system created it for a fresh PC.
      if (type === "character" && !items.some(item => item.type === "skill")) {
        const unskilled = actor.items.find(item => item.type === "skill" &&
          (item.system.swid === "unskilled" || item.name === game.i18n.localize("SWADE.Unskilled")));
        if (unskilled && !items.some(item => item.name === unskilled.name)) items.push(unskilled.toObject());
      }
      actor.updateSource({items: withCoreSkills(items, cores, () => foundry.utils.randomID())}, {recursive: false});
      return allowed;
    });
  }
}

export function installSheetHooks() {
  installSkillContextMenu();
  // The character sheet already opens skills after a drop. Match it on NPC sheets.
  wrapMethod(game.swade.sheets.SwadeNPCSheet.prototype, "_onDropItemCreate", async function (original, ...args) {
    const items = await original(...args);
    if (Array.isArray(items)) {
      for (const item of items) if (item.type === "skill") await item.sheet?.render({force: true});
    }
    return items;
  });
  Hooks.on("updateCompendium", pack => {
    if (pack.collection !== PACK_ID) return;
    for (const app of foundry.applications.instances.values()) if (app instanceof SkillPicker && app.rendered) void app.render();
  });
  Hooks.on("renderApplicationV2", (app, html) => {
    const root = html instanceof HTMLElement ? html : app.element;
    if (!root) return;
    try {
      const actor = app.actor ?? (app.document?.documentName === "Actor" ? app.document : null);
      if (["character", "npc"].includes(actor?.type) && app.isEditable) {
        // Capture before ApplicationV2 dispatches the system's createDocument action.
        if (!root.dataset.sbsSkillListener) {
          root.dataset.sbsSkillListener = "true";
          root.addEventListener("click", event => {
            const target = event.target.closest('[data-action="createDocument"][data-type="skill"]');
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            openActorSkills(actor).catch(report);
          }, {capture: true});
        }
      }
      if (app.document?.documentName === "Item" && app.isEditable) injectTraitButtons(root);
      if (app instanceof game.swade.apps.ActiveEffectWizard) {
        const input = root.querySelector('input[name="currSkill"], details[data-category="skill"] input.target');
        if (input && (app.document?.isOwner ?? true)) injectPicker(input, "skills", true);
      }
      if (app.collection?.collection === PACK_ID) {
        if ((!game.user.isGM || getPack()?.locked)) root.querySelector(".sbs-pack-create")?.remove();
        if (!root.querySelector(".sbs-pack-manage")) {
          const manage = document.createElement("button");
          manage.type = "button";
          manage.className = "header-control icon fa-solid fa-list sbs-pack-manage";
          manage.title = "Manage skills";
          manage.setAttribute("aria-label", "Manage skills");
          manage.addEventListener("click", () => { openLibrary().catch(report); });
          root.querySelector('.window-header [data-action="close"]')?.before(manage);
        }
        if (game.user.isGM && !getPack()?.locked && !root.querySelector(".sbs-pack-create")) {
          const create = document.createElement("button");
          create.type = "button";
          create.className = "header-control sbs-pack-create";
          create.innerHTML = '<i class="fa-solid fa-plus" inert></i> Create new skill';
          create.addEventListener("click", () => { createSkill().catch(report); });
          root.querySelector('.window-header [data-action="close"]')?.before(create);
        }
        if (!root.dataset.sbsPackListener) {
          root.dataset.sbsPackListener = "true";
          root.addEventListener("click", event => {
            if (!event.target.closest('[data-action="createEntry"], [data-action="createDocument"]')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            createSkill().catch(report);
          }, {capture: true});
        }
      }
    } catch (error) { report(error); }
  });
  Hooks.on("renderCompendiumDirectory", (_app, html) => {
    if (html.querySelector(".sbs-open-library")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sbs-open-library";
    button.innerHTML = '<i class="fa-solid fa-list" inert></i> Skills Compendium';
    button.addEventListener("click", () => openLibrary().catch(report));
    html.querySelector(".header-actions")?.append(button);
  });
}

function getContextSkill(target) {
  if (!target?.matches?.("li.item.skill[data-item-id]")) return;
  const root = target.closest(".swade.sheet.actor");
  const sheet = foundry.applications.instances.get(root?.id);
  const skill = sheet?.actor?.items.get(target.dataset.itemId);
  if (sheet?.isEditable && skill?.type === "skill" && skill.isOwner) return skill;
}

function installSkillContextMenu() {
  const {implementation} = foundry.applications.ux.ContextMenu;
  wrapMethod(implementation.prototype, "_preRenderEntries", async function (original, ...args) {
    await original(...args);
    if (!getContextSkill(this.target) || this.menuItems.some(entry => entry.classes === "sbs-add-to-compendium")) return;
    this.menuItems.push({
      label: "Add to Compendium",
      icon: "fa-solid fa-book-medical",
      classes: "sbs-add-to-compendium",
      visible: target => {
        const skill = getContextSkill(target);
        const pack = getPack();
        if (!skill || !pack?.visible || pack.locked) return false;
        const name = normalizeName(skill.name);
        return !pack.index.some(entry => entry.type === "skill" && normalizeName(entry.name) === name);
      },
      onClick: (_event, target) => addSkillToCompendium(getContextSkill(target)).catch(report)
    });
  });
}

async function addSkillToCompendium(skill) {
  if (!skill) return;
  const pack = getPack();
  if (!pack?.visible || pack.locked) throw new Error("A GM must unlock the Better Setting skill compendium to add this skill.");
  if (isPrimaryGM()) {
    await storeSkill(skill);
    if (skill.getFlag(MODULE_ID, "pendingLibrary")) await skill.unsetFlag(MODULE_ID, "pendingLibrary");
    ui.notifications.info(`“${skill.name}” added to the Skills Compendium.`);
  } else {
    await skill.setFlag(MODULE_ID, "pendingLibrary", true);
    ui.notifications.info(game.users.activeGM
      ? `Compendium copy requested for “${skill.name}”.`
      : `“${skill.name}” will be added to the Skills Compendium when a GM joins.`);
  }
}

export function injectTraitButtons(root) {
  for (const input of root.querySelectorAll('input[name="system.actions.trait"], input[name^="system.actions.additional."][name$=".override"]')) {
    if (!input.disabled && !input.readOnly) injectPicker(input, "traits");
  }
}

function injectPicker(input, mode, text = false) {
  if (input.parentElement.querySelector(".sbs-trait-picker")) return;
  input.parentElement.classList.add("sbs-trait-field");
  if (text) input.parentElement.classList.add("sbs-skills-field");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sbs-trait-picker";
  button.title = text ? "Skills Compendium" : "Choose a trait";
  button.setAttribute("aria-label", button.title);
  button.innerHTML = `<i class="fa-solid fa-list" inert></i>${text ? " Skills Compendium" : ""}`;
  input.after(button);
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    new SkillPicker({mode, window: {title: mode === "traits" ? "Choose a trait" : "Skills Compendium"},
      onSelect: value => {
        if (!input.isConnected) throw new Error("The original editor was closed. Open its trait picker again.");
        input.value = value;
        input.dispatchEvent(new Event("input", {bubbles: true}));
        input.dispatchEvent(new Event("change", {bubbles: true}));
      }}).render({force: true}).catch(report);
  });
}
