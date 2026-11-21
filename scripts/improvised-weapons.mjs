import {t} from "./i18n.mjs";
import {IMPROVISED_PRESETS, IMPROVISED_ICONS, IMPROVISED_WEIGHTS, improvisedSource} from "./improvised-data.mjs";
import {ChoicePicker} from "./picker.mjs";
import {slug} from "./skills.mjs";

const label = key => t("swade-better-setting.Improvised." + key);
const esc = value => foundry.utils.escapeHTML(String(value));
const traitName = (actor, swid) => actor.items.find(item => item.type === "skill" &&
  (item.system.swid === swid || item.name.trim().toLowerCase() === swid))?.name ?? label(swid);

export async function openInventoryItemBuilder(actor, {types} = {}) {
  if (!actor?.isOwner) return;
  const allowed = types ?? ["weapon", "armor", "shield", "gear", "consumable", ...(game.modules.get("swade-grid-inventory")?.active ? ["swade-grid-inventory.container"] : [])];
  const choices = ["improvised", ...allowed.filter(type => CONFIG.Item.dataModels[type] || type === "effect")];
  const field = (name, title, type = "text", value = "") => `<div class="form-group"><label>${esc(label(title))}</label><div class="form-fields"><input name="${name}" type="${type}" value="${esc(value)}"${type === "number" ? ' step="any"' : ""}></div></div>`;
  return foundry.applications.api.DialogV2.prompt({classes: ["sbs-improvised-builder", "sbs-standard-swade-sheet"],
    window: {title: label("Title")}, position: {width: 520}, rejectClose: false,
    content: `<div class="standard-form">
      <div class="form-group"><label>${esc(label("Type"))}</label><div class="form-fields"><select name="type">${choices.map(type => `<option value="${type}">${esc(type === "improvised" ? label("ImprovisedWeapon") : game.i18n.localize(CONFIG.Item.typeLabels[type] ?? "DOCUMENT.ActiveEffect"))}</option>`).join("")}</select></div></div>
      ${field("name", "Name")}
      <fieldset data-constructor><legend>${esc(label("Constructor"))}</legend>
        <div class="form-group"><label>${esc(label("Icon"))}</label><div class="form-fields sbs-weapon-icon-controls">
          <input type="hidden" name="img">
          <details class="sbs-weapon-icon-dropdown">
            <summary aria-label="${esc(label("ChooseIcon"))}"><img data-icon-preview alt=""><span data-icon-label></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></summary>
            <div class="sbs-weapon-icon-options" role="listbox" aria-label="${esc(label("ChooseIcon"))}">
              ${Object.entries(IMPROVISED_ICONS).map(([key, path]) => `<button type="button" role="option" aria-selected="false" data-weapon-icon="${esc(path)}"><img src="${esc(path)}" alt=""><span>${esc(label("Icon" + key))}</span></button>`).join("")}
            </div>
          </details>
          <button type="button" data-pick-icon aria-label="${esc(label("BrowseIcon"))}" data-tooltip="${esc(label("BrowseIcon"))}"><i class="fa-solid fa-file-image" aria-hidden="true"></i></button>
        </div></div>
        <div class="form-group"><label>${esc(label("Preset"))}</label><select name="preset">${Object.keys(IMPROVISED_PRESETS).map(key => `<option value="${key}">${esc(label(key))}</option>`).join("")}</select></div>
        <p class="hint" data-examples></p>
        ${field("damage", "Damage")}${field("range", "Range")}
        <div class="form-group"><label>${esc(label("MinStrength"))}</label><select name="minStr">${[4,6,8,10,12].map(n => `<option value="d${n}">d${n}</option>`).join("")}</select></div>
        ${field("trait", "Trait")}${field("penalty", "Penalty", "number", -2)}
        ${field("ap", "AP", "number", 0)}${field("weight", "Weight", "number", 0)}
        <div class="form-group"><label>${esc(label("Flags"))}</label><div class="form-fields"><input name="flags" value="improvised-weapon"><button type="button" data-pick-flags aria-label="${esc(label("PickFlags"))}"><i class="fa-solid fa-list"></i></button></div></div>
      </fieldset></div>`,
    render: (_event, dialog) => {
      const root = dialog.element, input = name => root.querySelector(`[name="${name}"]`);
      const dropdown = root.querySelector(".sbs-weapon-icon-dropdown");
      const iconButtons = [...dropdown.querySelectorAll("[data-weapon-icon]")];
      const setIcon = path => {
        input("img").value = path;
        root.querySelector("[data-icon-preview]").src = path;
        const key = Object.keys(IMPROVISED_ICONS).find(key => IMPROVISED_ICONS[key] === path);
        root.querySelector("[data-icon-label]").textContent = label(key ? "Icon" + key : "CustomIcon");
        for (const button of iconButtons) button.setAttribute("aria-selected", String(button.dataset.weaponIcon === path));
      };
      for (const button of iconButtons) button.addEventListener("click", () => {
        setIcon(button.dataset.weaponIcon); dropdown.open = false; dropdown.querySelector("summary").focus();
      });
      dropdown.addEventListener("keydown", event => {
        if (event.key === "Escape") { event.stopPropagation(); dropdown.open = false; dropdown.querySelector("summary").focus(); }
        else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault(); dropdown.open = true;
          const index = iconButtons.indexOf(document.activeElement);
          iconButtons[event.key === "Home" ? 0 : event.key === "End" ? iconButtons.length - 1
            : (index + (event.key === "ArrowUp" ? -1 : 1) + iconButtons.length) % iconButtons.length].focus();
        }
      });
      root.addEventListener("click", event => { if (!dropdown.contains(event.target)) dropdown.open = false; });
      root.querySelector("[data-pick-icon]").addEventListener("click", () => {
        new foundry.applications.apps.FilePicker.implementation({type: "image", current: input("img").value,
          callback: path => setIcon(path)}).render({force: true});
      });
      const preset = () => {
        const data = IMPROVISED_PRESETS[input("preset").value];
        for (const key of ["damage", "range", "minStr"]) input(key).value = data[key];
        const examples = data.examples.map(label);
        const index = Math.floor(Math.random() * examples.length), example = data.examples[index];
        input("name").value = examples[index];
        input("weight").value = IMPROVISED_WEIGHTS[example];
        setIcon(IMPROVISED_ICONS[example] ?? (example.includes("Chair") ? IMPROVISED_ICONS.Stool : IMPROVISED_ICONS.Rock));
        input("trait").value = traitName(actor, "fighting");
        const tip = root.querySelector("[data-examples]"); tip.textContent = label("Examples") + " " + examples.join("; ");
        input("preset").dataset.tooltipText = tip.textContent;
      };
      input("preset").addEventListener("change", preset); preset();
      input("type").addEventListener("change", () => {
        root.querySelector("[data-constructor]").hidden = input("type").value !== "improvised";
        if (input("type").value === "improvised") preset(); else input("name").value = "";
      });
      root.querySelector("[data-pick-flags]").addEventListener("click", () => {
        const flags = game.modules.get("swade-better-effects")?.api?.catalogFlags?.() ?? ["improvised-weapon"];
        new ChoicePicker({choices: flags.map(key => ({key, name: key})), window: {title: label("PickFlags")}, onSelect: key => {
          input("flags").value = [...new Set([...input("flags").value.split(",").map(slug).filter(Boolean), key])].join(", ");
        }}).render({force: true});
      });
      // Dialog autofocus can scroll the overflowing content down to its footer.
      requestAnimationFrame(() => {
        input("name").focus({preventScroll: true});
        for (const element of [root, ...root.querySelectorAll(".window-content, form")]) element.scrollTop = 0;
      });
    },
    ok: {label: label("Create"), callback: async (_event, button) => {
      const values = Object.fromEntries(new FormData(button.form)), type = values.type;
      let source;
      if (type === "improvised") {
        try { source = improvisedSource({...values, throwLabel: label("Throw"), throwTrait: traitName(actor, "athletics")}, slug); }
        catch (error) { throw new Error(label("Error" + error.message)); }
      } else source = {type: type === "effect" ? "base" : type, name: values.name.trim() || (type === "effect" ? label("Effect") : CONFIG.Item.documentClass.defaultName({type, parent: actor}))};
      const [item] = await actor.createEmbeddedDocuments(type === "effect" ? "ActiveEffect" : "Item", [source]);
      await item.sheet.render({force: true}); return item;
    }}
  });
}

export function installImprovisedWeapons() {
  const prototype = CONFIG.Item.documentClass.prototype;
  let owner = prototype;
  while (owner && !Object.getOwnPropertyDescriptor(owner, "traitModifiers")) owner = Object.getPrototypeOf(owner);
  const getter = owner && Object.getOwnPropertyDescriptor(owner, "traitModifiers")?.get;
  if (getter) Object.defineProperty(prototype, "traitModifiers", {configurable: true, get() {
    const modifiers = getter.call(this);
    if (this.getFlag("swade-better-setting", "improvisedWeapon") && this.system.actions?.traitMod && modifiers.length) {
      return modifiers.map((modifier, index) => index === 0 ? {...modifier, label: label("ImprovisedWeapon")} : modifier);
    }
    return modifiers;
  }});
  Hooks.on("renderApplicationV2", (app, root) => {
    if (!app.actor || !["character", "npc"].includes(app.actor.type) || !app.isEditable || root.dataset.sbsImprovisedBound) return;
    root.dataset.sbsImprovisedBound = "true";
    root.addEventListener("click", event => {
      const button = event.target.closest('[data-action="createFavorite"], [data-action="createDocument"]');
      if (!button || !(["inventory", "gear"].includes(button.closest("[data-tab]")?.dataset.tab) && ["weapon", "gear", undefined].includes(button.dataset.type)
        || button.dataset.choices?.split(",").includes("weapon"))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      void openInventoryItemBuilder(app.actor).catch(error => ui.notifications.error(error.message));
    }, {capture: true});
  });
}
