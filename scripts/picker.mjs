import {MODULE_ID, normalizeName} from "./skills.mjs";
import {getPack, librarySkills} from "./library.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
export class SkillPicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({mode = "skills", onSelect, onCreate, actor, includeLinkedSkills = false, linkedAttributes = [], ...options} = {}) {
    super(options);
    Object.assign(this, {mode, onSelect, onCreate, actor});
    this.query = "";
    this.includeLinkedSkills = includeLinkedSkills;
    this.linkedAttributes = new Set(linkedAttributes);
  }
  static DEFAULT_OPTIONS = {
    classes: ["sbs-picker"], position: {width: 460, height: 620},
    window: {title: "Skills Compendium", resizable: true},
    actions: {
      choose: async function (_event, target) { await this.choose(target.dataset.key); },
      star: async function (_event, target) { await this.star(target.dataset.key); },
      createSkill: async function () { await this.onCreate?.(); },
      editSkill: async function (_event, target) { (await this.skills()).find(item => item.id === target.dataset.key)?.sheet.render({force: true}); },
      deleteSkill: async function (_event, target) {
        const item = (await this.skills()).find(item => item.id === target.dataset.key);
        await item?.deleteDialog();
        await this.render();
      }
    }
  };
  static PARTS = {body: {template: `modules/${MODULE_ID}/templates/picker.hbs`, scrollable: [".sbs-results"]}};
  get favoriteFlag() { return this.mode === "traits" ? "traitFavorites" : "skillFavorites"; }
  async skills() { return librarySkills(); }
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const favorites = new Set(game.user.getFlag(MODULE_ID, this.favoriteFlag) ?? []);
    const skills = (await this.skills()).map(item => ({
      key: item.id, favoriteKey: `skill:${item.id}`, name: item.name, img: item.img,
      detail: item.system.isCoreSkill ? "Core" : "", core: item.system.isCoreSkill, kind: "skill"
    }));
    const attributes = this.mode === "traits" ? Object.entries(CONFIG.SWADE.attributes).map(([key, attr]) => ({
      key: `attribute:${key}`, favoriteKey: `attribute:${key}`, name: game.i18n.localize(attr.long), kind: "attribute",
      includeLinkedSkills: this.includeLinkedSkills, linkedSkills: this.linkedAttributes.has(key)
    })) : [];
    const entries = [...attributes, ...skills].map(item => ({...item, starred: favorites.has(item.favoriteKey)}));
    this.entries = entries;
    const matches = item => normalizeName(item.name).includes(normalizeName(this.query));
    const manage = this.mode === "manage";
    const section = (label, rows) => ({label, rows: rows.map(item => ({...item, manage, canManage: manage && game.user.isGM && !getPack()?.locked}))});
    const sections = [section("Starred", entries.filter(item => item.starred))];
    if (this.mode === "traits") sections.push(section("Attributes", entries.filter(item => item.kind === "attribute" && !item.starred)));
    sections.push(section("Core Skills", entries.filter(item => item.kind === "skill" && item.core && !item.starred)));
    sections.push(section("Skills", entries.filter(item => item.kind === "skill" && !item.core && !item.starred)));
    return {...context, query: this.query, canCreate: !!this.onCreate, sections: sections.filter(group => group.rows.length), empty: !entries.some(matches)};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    const search = this.element.querySelector('input[type="search"]');
    const filter = () => {
      this.query = search.value;
      // Filter in place to preserve focus, caret, and keyboard search while typing.
      const query = normalizeName(this.query);
      let visible = 0;
      for (const group of this.element.querySelectorAll(".sbs-group")) {
        let count = 0;
        for (const row of group.querySelectorAll(".sbs-row")) {
          row.hidden = !normalizeName(row.dataset.name).includes(query);
          if (!row.hidden) count++;
        }
        group.hidden = !count;
        visible += count;
      }
      this.element.querySelector(".sbs-empty").hidden = !!visible;
    };
    search.addEventListener("input", filter);
    for (const checkbox of this.element.querySelectorAll("[data-linked-attribute]")) {
      checkbox.addEventListener("change", () => {
        const key = checkbox.dataset.linkedAttribute.slice("attribute:".length);
        if (checkbox.checked) this.linkedAttributes.add(key);
        else this.linkedAttributes.delete(key);
      });
    }
    if (!this.element.dataset.sbsKeyboard) {
      this.element.dataset.sbsKeyboard = "true";
      this.element.addEventListener("keydown", event => {
        if (["Enter", " "].includes(event.key) && event.target.matches('a[role="button"]')) {
          event.preventDefault();
          event.target.click();
        }
      });
    }
    filter();
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
  async star(key) {
    const entry = this.entries.find(item => item.key === key);
    if (!entry) return;
    const values = new Set(game.user.getFlag(MODULE_ID, this.favoriteFlag) ?? []);
    values.has(entry.favoriteKey) ? values.delete(entry.favoriteKey) : values.add(entry.favoriteKey);
    await game.user.setFlag(MODULE_ID, this.favoriteFlag, [...values]);
    await this.render();
  }
  async choose(key) {
    if (this.choosing) return;
    const entry = this.entries.find(item => item.key === key);
    if (!entry) return;
    this.choosing = true;
    try {
      if (this.mode === "manage") {
        (await this.skills()).find(item => item.id === key)?.sheet.render({force: true});
      } else {
        const value = entry.kind === "attribute" ? entry.key.slice("attribute:".length) : entry.name;
        await this.onSelect?.(value, {...entry, linkedSkills: entry.kind === "attribute" && this.linkedAttributes.has(value)});
        await this.close();
      }
    } catch (error) { ui.notifications.error(error.message); }
    finally { this.choosing = false; }
  }
}
