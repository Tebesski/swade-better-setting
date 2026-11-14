import {MODULE_ID} from "./skills.mjs";
import {initializeLibrary, processPendingSkill, processPendingSkills} from "./library.mjs";
import {initializeActionLibrary, libraryActions} from "./action-library.mjs";
import {createSkill, initializeDraftSheet} from "./creation.mjs";
import {SkillPicker} from "./picker.mjs";
import {installCoreSkills, installSheetHooks, openActorSkills, openLibrary} from "./integrations.mjs";
import {installBestiary, openBestiary} from "./bestiary.mjs";
import {openNPCBuilder} from "./npc-builder.mjs";
import {installNPCTools} from "./npc-tools.mjs";
import {registerThemes} from "./themes.mjs";
import {installEncumbrance, registerEncumbranceSettings} from "./encumbrance.mjs";
import {ROLE_PROFILES} from "./npc-data.mjs";
import {registerNPCPresets} from "./npc-presets.mjs";
import {addonAPI, applyLibraryModifier, getGlobalModifiers, hasModifierDrag, openModifierLibrary, readModifierDrag,
  resolveCompendiumName, saveModifierToLibrary, writeModifierDrag} from "./modifier-library.mjs";

async function openCompendium() {
  const templates = addonAPI("swade-better-templates");
  const choice = await foundry.applications.api.DialogV2.wait({
    classes: ["sbs-compendium-dialog"],
    render: (_event, dialog) => {
      dialog.element.querySelector("[autofocus]")?.removeAttribute("autofocus");
      const title = dialog.element.querySelector(".window-title");
      if (title) { title.tabIndex = -1; title.focus(); }
    },
    window: {title: "Better SWADE Compendium", icon: "fa-solid fa-book-open"},
    buttons: [
      {action: "skills", label: "Skills", icon: "fa-solid fa-list"},
      {action: "actions", label: "Actions", icon: "fa-solid fa-sword"},
      {action: "templates", label: "Templates", icon: "fa-solid fa-shapes", disabled: !templates?.openTemplates, tooltip: templates ? undefined : "Enable Better Templates"},
      {action: "modifiers", label: "Modifiers", icon: "fa-solid fa-sliders"}
    ], rejectClose: false
  });
  if (choice === "skills") return openLibrary();
  if (choice === "actions") return (await initializeActionLibrary())?.render(true);
  if (choice === "templates") return templates.openTemplates();
  if (choice === "modifiers") return openModifierLibrary();
}

Hooks.once("init", () => {
  registerThemes();
  registerEncumbranceSettings();
  registerNPCPresets(ROLE_PROFILES);
  game.settings.register(MODULE_ID, "libraryInitialized", {scope: "world", config: false, type: Boolean, default: false});
  class BetterCompendiumMenu extends foundry.applications.api.ApplicationV2 {
    render() { return openCompendium(); }
  }
  game.settings.registerMenu(MODULE_ID, "skillCompendium", {
    name: "Better SWADE Compendium", label: "Open Compendium", hint: "Browse the shared skills, templates, and modifiers.",
    icon: "fa-solid fa-book-open", type: BetterCompendiumMenu, restricted: false
  });
});

Hooks.once("setup", () => {
  initializeDraftSheet();
  installEncumbrance();
  installCoreSkills();
  installSheetHooks(openCompendium);
  installBestiary();
  installNPCTools();
  game.modules.get(MODULE_ID).api = {openCompendium, openLibrary, openActorSkills, createSkill, openBestiary, openNPCBuilder,
    openModifierLibrary, saveModifierToLibrary, getGlobalModifiers, applyLibraryModifier, resolveCompendiumName, libraryActions,
    hasModifierDrag, readModifierDrag, writeModifierDrag,
    openTraitPicker: (onSelect, {title = "Choose a trait", ...options} = {}) => new SkillPicker({mode: "traits", onSelect, ...options, window: {title}}).render({force: true})};
});

Hooks.once("ready", async () => {
  initializeActionLibrary().catch(error => {
    console.error(`${MODULE_ID} | Action compendium setup failed`, error);
    ui.notifications.error(`Better Setting: ${error.message}`);
  });
  try {
    await initializeLibrary();
    await processPendingSkills();
  } catch (error) {
    console.error(`${MODULE_ID} | Skill compendium setup failed`, error);
    ui.notifications.error(`Better Setting: ${error.message}`);
  }
});

Hooks.on("createItem", item => { void processPendingSkill(item); });
Hooks.on("updateItem", (item, changes) => {
  if (changes.flags?.[MODULE_ID]?.pendingLibrary === true) void processPendingSkill(item);
});
