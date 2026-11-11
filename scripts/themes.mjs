import {MODULE_ID} from "./skills.mjs";

const THEMES = {
  swade: ["SWADE sheet and roll theme", "Styles the standard SWADE actor sheets, item sheets, and roll dialogs."],
  setting: ["Better Setting theme", "Styles the Bestiary, NPC Builder, and Better SWADE compendium windows."],
  templates: ["Better Templates theme", "Styles the template compendium, editor, and tracker."],
  powers: ["Better Powers theme", "Styles spellcasting panels, power modifiers, and Better Powers dialogs."],
  effects: ["Better Effects theme", "Styles A.E.G.I.S., effect and flag editors, and Better Effects dialogs."]
};
const CHOICES = {default: "Default", white: "White (Porcelain)"};

function applyTheme(component, value) {
  const flag = `sbs-white-${component}`;
  const enabled = value === "white";
  document.body.classList.toggle(flag, enabled);
  for (const {window: popup} of foundry.applications.detached?.windows.values() ?? []) {
    if (!popup.closed) popup.document.body.classList.toggle(flag, enabled);
  }
}

export function registerThemes() {
  for (const [component, [name, hint]] of Object.entries(THEMES)) {
    const key = `theme-${component}`;
    game.settings.register(MODULE_ID, key, {
      name, hint, scope: "user", config: true, type: String, choices: CHOICES, default: "default",
      onChange: value => applyTheme(component, value)
    });
  }

  Hooks.once("ready", () => {
    for (const component of Object.keys(THEMES)) applyTheme(component, game.settings.get(MODULE_ID, `theme-${component}`));
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
