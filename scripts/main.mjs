import {t as sbsI18n} from "./i18n.mjs";
import {registerIllumination, installIllumination} from "./illumination.mjs";
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
import {installDefeatedAppearance, installStatusCompatibility} from "./status-compatibility.mjs";
import {installPartySheet, registerPartyShortcut} from "./party-sheet.mjs";
import {registerPartyVaults} from "./party-vaults.mjs";
import {installAdvancedTargeting, registerAdvancedTargeting, withAdvancedTargeting} from "./advanced-targeting.mjs";
import {installRollLayout} from "./roll-layout.mjs";
import {installImprovisedWeapons, openInventoryItemBuilder} from "./improvised-weapons.mjs";
import {installChatLayout} from "./chat-layout.mjs";
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
    window: {title: sbsI18n("swade-better-setting.UI.BetterSWADECompendium_157f0debd8"), icon: "fa-solid fa-book-open"},
    buttons: [
      {action: "skills", label: sbsI18n("swade-better-setting.UI.Skills_66d0f523a3"), icon: "fa-solid fa-list"},
      {action: "actions", label: sbsI18n("swade-better-setting.UI.Actions_ff8059dc67"), icon: "fa-solid fa-sword"},
      {action: "templates", label: sbsI18n("swade-better-setting.UI.Templates_56b564b75c"), icon: "fa-solid fa-shapes", disabled: !templates?.openTemplates, tooltip: templates ? undefined : sbsI18n("swade-better-setting.UI.EnableBetterTemplates_253eee3859")},
      {action: "modifiers", label: sbsI18n("swade-better-setting.UI.Modifiers_072da57fac"), icon: "fa-solid fa-sliders"}
    ], rejectClose: false
  });
  if (choice === "skills") return openLibrary();
  if (choice === "actions") return (await initializeActionLibrary())?.render(true);
  if (choice === "templates") return templates.openTemplates();
  if (choice === "modifiers") return openModifierLibrary();
}

Hooks.once("init", () => {
  if (game.system.id === "swade") {
    registerPartyVaults();
    registerPartyShortcut();
    registerAdvancedTargeting();
  }
  registerThemes();
  registerIllumination();
  registerEncumbranceSettings();
  registerNPCPresets(ROLE_PROFILES);
  game.settings.register(MODULE_ID, "compactSceneControls", {
    name: "swade-better-setting.UI.CompactSceneControls",
    hint: "swade-better-setting.UI.CompactSceneControlsHint",
    scope: "client", config: true, type: Boolean, default: true,
    onChange: applySceneControlsLayout
  });
  game.settings.register(MODULE_ID, "libraryInitialized", {scope: "world", config: false, type: Boolean, default: false});
  class BetterCompendiumMenu extends foundry.applications.api.ApplicationV2 {
    render() { return openCompendium(); }
  }
  game.settings.registerMenu(MODULE_ID, "skillCompendium", {
    name: sbsI18n("swade-better-setting.UI.BetterSWADECompendium_157f0debd8"), label: sbsI18n("swade-better-setting.UI.OpenCompendium_139418072b"),
    icon: "fa-solid fa-book-open", type: BetterCompendiumMenu, restricted: false
  });
});

function applySceneControlsLayout(enabled) {
  document.body.classList.toggle("sbs-compact-scene-controls", enabled);
  // Recalculate Foundry's wrapping width using the restored native menu height.
  if (!enabled && ui.controls?.element?.querySelector("#scene-controls-tools")?.clientHeight) {
    ui.controls.setPosition({});
  }
}

Hooks.once("setup", () => {
  if (game.system.id === "swade") installDefeatedAppearance();
  applySceneControlsLayout(game.settings.get(MODULE_ID, "compactSceneControls"));
  // Chat history renders before ready, so its layout hooks must already exist.
  installChatLayout();
  initializeDraftSheet();
  installEncumbrance();
  installCoreSkills();
  installSheetHooks(openCompendium);
  installBestiary();
  installNPCTools();
  game.modules.get(MODULE_ID).api = {openCompendium, openLibrary, openActorSkills, createSkill, openBestiary, openNPCBuilder,
    openModifierLibrary, saveModifierToLibrary, getGlobalModifiers, applyLibraryModifier, resolveCompendiumName, libraryActions,
    hasModifierDrag, readModifierDrag, writeModifierDrag,
    withAdvancedTargeting, openInventoryItemBuilder,
    openTraitPicker: (onSelect, {title = sbsI18n("swade-better-setting.UI.Chooseatrait_0650f3338f"), ...options} = {}) => new SkillPicker({mode: "traits", onSelect, ...options, window: {title}}).render({force: true})};
});

Hooks.once("ready", async () => {
  installStatusCompatibility().catch(error => console.error(`${MODULE_ID} | Shaken compatibility`, error));
  installRollLayout();
  installIllumination();
  installImprovisedWeapons();
  installAdvancedTargeting();
  installPartySheet();
  initializeActionLibrary().catch(error => {
    console.error(`${MODULE_ID} | Action compendium setup failed`, error);
    ui.notifications.error(sbsI18n("swade-better-setting.UI.BetterSetting_352b8d58a9", {p0: (error.message)}));
  });
  try {
    await initializeLibrary();
    await processPendingSkills();
  } catch (error) {
    console.error(`${MODULE_ID} | Skill compendium setup failed`, error);
    ui.notifications.error(sbsI18n("swade-better-setting.UI.BetterSetting_352b8d58a9", {p0: (error.message)}));
  }
});

Hooks.on("createItem", item => { void processPendingSkill(item); });
Hooks.on("updateItem", (item, changes) => {
  if (changes.flags?.[MODULE_ID]?.pendingLibrary === true) void processPendingSkill(item);
});
