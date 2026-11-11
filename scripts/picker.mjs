import {MODULE_ID, normalizeName} from "./skills.mjs";
import {getPack, librarySkills} from "./library.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;
export class ChoicePicker extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor({choices = [], onSelect, onPreview, categories, loading = false, pageSize = 0, ...options} = {}) {
    super(options);
    Object.assign(this, {entries: choices, onSelect, onPreview, categories, loading, pageSize});
    this.category = "";
    this.query = "";
    this.page = 0;
  }
  static DEFAULT_OPTIONS = {
    classes: ["sbs-picker"], position: {width: 460, height: 620},
    window: {resizable: true},
    actions: {
      choose: async function (_event, target) { await this.choose(target.dataset.key); },
      preview: async function (_event, target) {
        try { await this.onPreview?.(target.dataset.key); }
        catch (error) { ui.notifications.error(error.message); }
      },
      previousChoices: function () { return this.showChoicePage(this.page - 1); },
      nextChoices: function () { return this.showChoicePage(this.page + 1); }
    }
  };
  static PARTS = {body: {template: `modules/${MODULE_ID}/templates/picker.hbs`, scrollable: [".sbs-results"]}};

  async _prepareContext(options) {
    const query = normalizeName(this.query);
    const matches = this.pageSize || this.category ? this.entries.filter(entry =>
      (!this.pageSize || normalizeName(entry.name).includes(query)) && (!this.category || this.category === entry.category)) : this.entries;
    const pages = this.pageSize ? Math.max(1, Math.ceil(matches.length / this.pageSize)) : 1;
    this.page = Math.max(0, Math.min(this.page, pages - 1));
    const rows = this.pageSize ? matches.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize) : matches;
    return {...await super._prepareContext(options), query: this.query, loading: this.loading,
      loadingMessage: this.loadingMessage ?? "Loading choices…", notice: this.notice,
      searchLabel: "Search choices", emptyMessage: "No matching choices.", sections: [{rows}],
      categories: this.categories, category: this.category, canPreview: !!this.onPreview,
      choicePages: pages > 1, choicePage: this.page + 1, choiceTotalPages: pages,
      previousChoices: this.page > 0, nextChoices: this.page + 1 < pages};
  }

  async showChoicePage(page) {
    this.page = page;
    await this.render();
    this.element?.querySelector(".sbs-results")?.scrollTo(0, 0);
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const search = this.element.querySelector('input[type="search"]');
    this.element.querySelector("[data-choice-category]")?.addEventListener("change", event => {
      this.category = event.target.value;
      void this.showChoicePage(0).catch(error => ui.notifications.error(error.message));
    });
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
      this.element.querySelector(".sbs-empty").hidden = !!visible || this.loading;
    };
    if (!this.pageSize) search.addEventListener("input", filter);
    else search.addEventListener("input", () => {
      filter();
      clearTimeout(this.choiceSearchTimer);
      const query = this.query;
      const {selectionStart, selectionEnd} = search;
      this.choiceSearchTimer = setTimeout(async () => {
        if (!this.rendered || this.query !== query) return;
        try {
          await this.showChoicePage(0);
          if (this.query === query) this.element?.querySelector('input[type="search"]')?.setSelectionRange(selectionStart, selectionEnd);
        } catch (error) { ui.notifications.error(error.message); }
      }, 80);
    });
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

  async _onClose(options) {
    clearTimeout(this.choiceSearchTimer);
    await super._onClose(options);
  }

  async choose(key) {
    if (this.choosing) return;
    const entry = this.entries.find(item => item.key === key);
    if (!entry) return;
    this.choosing = true;
    try {
      await this.select(entry);
      if (this.closeOnSelect) await this.close();
    } catch (error) { ui.notifications.error(error.message); }
    finally { this.choosing = false; }
  }

  get closeOnSelect() { return true; }
  select(entry) { return this.onSelect?.(entry.key, entry); }
}

export class SkillPicker extends ChoicePicker {
  constructor({mode = "skills", onCreate, actor, includeLinkedSkills = false, linkedAttributes = [], ...options} = {}) {
    super(options);
    Object.assign(this, {mode, onCreate, actor, includeLinkedSkills});
    this.linkedAttributes = new Set(linkedAttributes);
  }
  static DEFAULT_OPTIONS = {
    window: {title: "Skills Compendium", resizable: true},
    actions: {
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
    const manage = this.mode === "manage";
    const section = (label, rows) => ({label, rows: rows.map(item => ({...item, canStar: true, canManage: manage && game.user.isGM && !getPack()?.locked}))});
    const sections = [section("Starred", entries.filter(item => item.starred))];
    if (this.mode === "traits") sections.push(section("Attributes", entries.filter(item => item.kind === "attribute" && !item.starred)));
    sections.push(section("Core Skills", entries.filter(item => item.kind === "skill" && item.core && !item.starred)));
    sections.push(section("Skills", entries.filter(item => item.kind === "skill" && !item.core && !item.starred)));
    return {...context, canCreate: !!this.onCreate, sections: sections.filter(group => group.rows.length),
      searchLabel: "Search skills and traits", emptyMessage: "No matching skills or traits."};
  }
  async _onRender(context, options) {
    await super._onRender(context, options);
    for (const checkbox of this.element.querySelectorAll("[data-linked-attribute]")) {
      checkbox.addEventListener("change", () => {
        const key = checkbox.dataset.linkedAttribute.slice("attribute:".length);
        if (checkbox.checked) this.linkedAttributes.add(key);
        else this.linkedAttributes.delete(key);
      });
    }
  }
  async star(key) {
    const entry = this.entries.find(item => item.key === key);
    if (!entry) return;
    const values = new Set(game.user.getFlag(MODULE_ID, this.favoriteFlag) ?? []);
    values.has(entry.favoriteKey) ? values.delete(entry.favoriteKey) : values.add(entry.favoriteKey);
    await game.user.setFlag(MODULE_ID, this.favoriteFlag, [...values]);
    await this.render();
  }
  get closeOnSelect() { return this.mode !== "manage"; }

  async select(entry) {
    if (this.mode === "manage") return (await this.skills()).find(item => item.id === entry.key)?.sheet.render({force: true});
    const value = entry.kind === "attribute" ? entry.key.slice("attribute:".length) : entry.name;
    return this.onSelect?.(value, {...entry, linkedSkills: entry.kind === "attribute" && this.linkedAttributes.has(value)});
  }
}
