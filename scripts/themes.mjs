import {t as sbsI18n} from "./i18n.mjs";
import {MODULE_ID} from "./skills.mjs";

const THEMES = {
  swade: [sbsI18n("swade-better-setting.UI.SWADEsheetandrolltheme_3bd7b81d41"), sbsI18n("swade-better-setting.UI.StylesthestandardSWADEactorsheets_f133d9acb4")],
  setting: [sbsI18n("swade-better-setting.UI.BetterSettingtheme_66017dc02b"), sbsI18n("swade-better-setting.UI.StylestheBestiaryNPCBuilderand_ac4672d8a2")],
  templates: [sbsI18n("swade-better-setting.UI.BetterTemplatestheme_0d307f04f5"), sbsI18n("swade-better-setting.UI.Stylesthetemplatecompendiumeditorand_a00063c82f")],
  powers: [sbsI18n("swade-better-setting.UI.BetterPowerstheme_940e6ff2e2"), sbsI18n("swade-better-setting.UI.Stylesspellcastingpanelspowermodifiersand_f85907f2a2")],
  effects: [sbsI18n("swade-better-setting.UI.BetterEffectstheme_555455ffb7"), sbsI18n("swade-better-setting.UI.StylesAEGIS_2247563f06")],
  "subsystems-chase": [sbsI18n("swade-better-setting.UI.SubsystemsChasetheme_8601babdd3"), sbsI18n("swade-better-setting.UI.StylestheChaseboardmanagerand_aa89ad95ca")]
};
const CHOICES = {get default() { return sbsI18n("swade-better-setting.UI.Default_21b111cbfe"); }, get white() { return sbsI18n("swade-better-setting.UI.WhitePorcelain_28e7a86c3f"); }};

function applyTheme(component) {
  const flag = `sbs-white-${component}`;
  const enabled = game.settings.get(MODULE_ID, `theme-${component}`) === "white";
  document.body.classList.toggle(flag, enabled);
  for (const {window: popup} of foundry.applications.detached?.windows.values() ?? []) {
    if (!popup.closed) popup.document.body.classList.toggle(flag, enabled);
  }
}

export function registerThemes() {
  const themes = {...THEMES};
  for (const [component, [name, hint]] of Object.entries(themes)) {
    const key = `theme-${component}`;
    game.settings.register(MODULE_ID, key, {
      name, hint, scope: "user", config: false, type: String, choices: CHOICES, default: "default",
      // Foundry may also call this on the GM client when a player saves a user setting.
      onChange: () => applyTheme(component)
    });
  }
  let dialog;
  class ThemeSettings extends foundry.applications.api.ApplicationV2 {
    async render() {
      if (dialog?.rendered) return dialog.bringToFront();
      const content = document.createElement("div");
      const fields = document.createElement("div");
      fields.className = "sbs-theme-options";
      content.append(fields);
      for (const [component, [name, hint]] of Object.entries(themes)) {
        if (component === "subsystems-chase" && !game.modules.get("swade-better-subsystems")?.active) continue;
        const row = document.createElement("label");
        const caption = document.createElement("span");
        caption.textContent = name;
        const select = document.createElement("select");
        select.name = component;
        select.title = hint;
        for (const [value, label] of Object.entries(CHOICES)) {
          const chosen = game.settings.get(MODULE_ID, "theme-" + component) === value;
          select.add(new Option(label, value, chosen, chosen));
        }
        row.append(caption, select);
        fields.append(row);
      }
      dialog = new foundry.applications.api.DialogV2({
        window: {title: sbsI18n("swade-better-setting.UI.Changetheme_db1de510bc")}, position: {width: 590},
        classes: ["sbs-setting-dialog"], content,
        buttons: [{action: "close", label: sbsI18n("swade-better-setting.UI.Close_7d9eb7acb1")}]
      });
      await dialog.render({force: true});
      for (const select of dialog.element.querySelectorAll(".sbs-theme-options select")) {
        select.addEventListener("change", async () => {
          const key = "theme-" + select.name;
          try { await game.settings.set(MODULE_ID, key, select.value); }
          catch (error) {
            select.value = game.settings.get(MODULE_ID, key);
            ui.notifications.error(error.message);
          }
        });
      }
      return dialog;
    }
  }
  game.settings.registerMenu(MODULE_ID, "themes", {
    name: sbsI18n("swade-better-setting.UI.Themes_43ae3265b9"), label: sbsI18n("swade-better-setting.UI.Changetheme_db1de510bc"),
    icon: "fa-solid fa-palette", type: ThemeSettings, restricted: false
  });

  Hooks.once("ready", () => {
    for (const component of Object.keys(themes)) applyTheme(component);
  });

  Hooks.on("renderApplicationV2", (app, root) => {
    if (root?.matches(".application.sheet.swade")) {
      const standard = Object.values(game.swade?.sheets ?? {}).includes(app.constructor);
      root.classList.toggle("sbs-standard-swade-sheet", standard);
    }
    // Native power rolls share their application class with other SWADE rolls.
    if (root?.matches(".swade.roll-dialog") && game.modules.get("swade-better-powers")?.active) {
      root.classList.toggle("sbs-power-roll", app.ctx?.item?.type === "power");
    }
  });
}
