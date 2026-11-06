import {MODULE_ID} from "./skills.mjs";
import {initializeLibrary, processPendingSkill, processPendingSkills} from "./library.mjs";
import {createSkill, initializeDraftSheet} from "./creation.mjs";
import {SkillPicker} from "./picker.mjs";
import {installCoreSkills, installSheetHooks, openActorSkills, openLibrary} from "./integrations.mjs";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "libraryInitialized", {scope: "world", config: false, type: Boolean, default: false});
  class SkillCompendiumMenu extends foundry.applications.api.ApplicationV2 {
    render() { return openLibrary(); }
  }
  game.settings.registerMenu(MODULE_ID, "skillCompendium", {
    name: "Skills Compendium", label: "Manage skills", hint: "Edit the world's skills and mark which skills new characters and NPCs receive.",
    icon: "fa-solid fa-list", type: SkillCompendiumMenu, restricted: false
  });
});

Hooks.once("setup", () => {
  initializeDraftSheet();
  installCoreSkills();
  installSheetHooks();
  game.modules.get(MODULE_ID).api = {openLibrary, openActorSkills, createSkill,
    openTraitPicker: (onSelect, {title = "Choose a trait", ...options} = {}) => new SkillPicker({mode: "traits", onSelect, ...options, window: {title}}).render({force: true})};
});

Hooks.once("ready", async () => {
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
