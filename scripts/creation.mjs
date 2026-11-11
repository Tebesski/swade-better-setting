import {ICON, MODULE_ID, normalizeName, skillData} from "./skills.mjs";
import {getPack, librarySkills} from "./library.mjs";

let DraftSheet;
let NPCItemDraft;
let NPCEffectDraft;

function keepDraftLocal(document, sheet) {
  // Image, flags, and native editor actions can update the document directly.
  document.update = async function (changes) {
    this.updateSource(changes);
    if (changes.img) {
      for (const image of sheet.element?.querySelectorAll('img[data-edit="img"]') ?? []) image.src = changes.img;
    }
    return this;
  };
}

function NPCFeatureDraft(Sheet) {
  return class extends Sheet {
    static DEFAULT_OPTIONS = {
      form: {submitOnChange: false, submitOnClose: false, closeOnSubmit: false},
      actions: {addDraft: async function () {
        if (this.adding) return;
        this.adding = true;
        try {
          await this.submit();
          const data = this.document.toObject();
          data.name = data.name.trim();
          if (!data.name) throw new Error("Enter a name before adding this feature.");
          await this.onAdd(data);
          await this.close();
        } catch (error) {
          ui.notifications.error(error.message);
        } finally {
          this.adding = false;
        }
      }}
    };
    get isEditable() { return true; }
    get isVisible() { return true; }
    get title() { return this.editing ? `Edit ${this.document.name}` : `Add ${game.i18n.localize(`TYPES.${this.document.documentName}.${this.document.type}`)}`; }
    async _processSubmitData(_event, _form, data) {
      await this.document.update(data);
      return {updated: this.document};
    }
  };
}

export function initializeDraftSheet() {
  class DraftTweaks extends game.swade.apps.SwadeItemTweaks {
    async _processSubmitData(_event, _form, submitData) {
      await this.document.update(submitData);
      return {updated: this.document};
    }
  }
  DraftSheet = class BetterSettingSkillDraft extends game.swade.sheets.SwadeItemSheetV2 {
    static DEFAULT_OPTIONS = {
      classes: ["sbs-skill-draft"],
      form: {submitOnChange: false, submitOnClose: false, closeOnSubmit: false},
      window: {title: "Create new skill"},
      actions: {openTweaks: function () { new DraftTweaks({document: this.document}).render({force: true}); }}
    };
    get isEditable() { return true; }
    get isVisible() { return true; }
    get title() { return "Create new skill"; }
    async _onRender(context, options) {
      await super._onRender(context, options);
      const content = this.element.querySelector(".sheet-content");
      if (!content || content.querySelector(".sbs-add-skill")) return;
      const core = content.querySelector('[name="system.isCoreSkill"]')?.closest(".form-group");
      if (this.targetActor && core) {
        const row = document.createElement("div");
        row.className = "form-group sbs-save-to-library";
        const label = document.createElement("label");
        label.htmlFor = `${this.id}-add-to-library`;
        label.textContent = "Add to Skill Compendium";
        const fields = document.createElement("span");
        fields.className = "form-fields";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = label.htmlFor;
        checkbox.checked = this.addToLibrary ?? true;
        checkbox.addEventListener("change", () => { this.addToLibrary = checkbox.checked; });
        fields.append(checkbox);
        row.append(label, fields);
        core.after(row);
        const names = new Set((await librarySkills()).map(item => normalizeName(item.name)));
        const nameInput = this.element.querySelector('[name="name"]');
        const refresh = () => { row.hidden = names.has(normalizeName(nameInput.value)); };
        nameInput.addEventListener("input", refresh);
        refresh();
      }
      const footer = document.createElement("footer");
      footer.className = "sbs-skill-footer";
      const button = document.createElement("button");
      button.type = "submit";
      button.className = "sbs-add-skill";
      button.innerHTML = '<i class="fa-solid fa-plus" inert></i> Add skill';
      footer.append(button);
      content.append(footer);
      this.element.querySelector('[data-action="inlineDelete"]')?.remove();
      this.element.querySelector('[name="name"]')?.focus();
    }
    // Normal form changes never create or update a persisted item.
    async _processSubmitData(_event, _form, submitData) {
      if (this.saving || this.saved) return {};
      this.saving = true;
      const button = this.element.querySelector(".sbs-add-skill");
      if (button) button.disabled = true;
      try {
        const data = foundry.utils.mergeObject(this.document.toObject(), submitData, {inplace: false});
        data.name = data.name.trim();
        if (!data.name) throw new Error("Enter a name for the skill.");
        const skills = await librarySkills();
        const exists = skills.some(item => normalizeName(item.name) === normalizeName(data.name));
        const clean = skillData(data);
        if (this.targetActor) {
          if (!this.targetActor.isOwner) throw new Error("You do not have permission to add skills to this actor.");
          if (this.targetActor.items.some(item => item.type === "skill" && normalizeName(item.name) === normalizeName(data.name))) {
            throw new Error("This actor already has a skill with that name.");
          }
          if (!exists && (this.addToLibrary ?? true)) {
            foundry.utils.setProperty(clean, `flags.${MODULE_ID}.pendingLibrary`, true);
          }
        } else {
          if (exists) throw new Error("The compendium already has a skill with that name.");
          if (!game.user.isGM || getPack()?.locked) throw new Error("A GM must unlock the skill compendium before adding skills.");
        }
        const created = await CONFIG.Item.documentClass.create(clean, this.targetActor ? {parent: this.targetActor} : {pack: getPack().collection});
        if (!created) throw new Error("The skill could not be created.");
        this.saved = created;
        if (created.getFlag(MODULE_ID, "pendingLibrary") && !game.users.activeGM) {
          ui.notifications.info("Skill added. Its compendium copy will be saved when a GM joins.");
        }
        await this.close();
        if (this.targetActor) await created.sheet?.render({force: true});
        return {created};
      } catch (error) {
        ui.notifications.error(error.message);
        return {};
      } finally {
        this.saving = false;
        if (button?.isConnected) button.disabled = false;
      }
    }
  };
  NPCItemDraft = class extends NPCFeatureDraft(game.swade.sheets.SwadeItemSheetV2) {
    static DEFAULT_OPTIONS = {classes: ["sbs-npc-item-draft"]};
    async _onRender(context, options) {
      await super._onRender(context, options);
      this.element.querySelector('[data-action="inlineDelete"]')?.remove();
      // Effects have their own feature editor, with an actor rather than an item as their parent.
      for (const control of this.element.querySelectorAll('[data-tab="effects"]')) control.hidden = true;
      const content = this.element.querySelector(".window-content");
      if (!content.querySelector(".sbs-npc-item-footer")) {
        const footer = document.createElement("footer");
        footer.className = "sbs-npc-item-footer";
        footer.innerHTML = this.editing
          ? '<button type="button" data-action="addDraft"><i class="fa-solid fa-floppy-disk" inert></i> Save Changes</button>'
          : '<button type="button" data-action="addDraft"><i class="fa-solid fa-plus" inert></i> Add to NPC</button>';
        content.append(footer);
      }
    }
  };
  NPCEffectDraft = class extends NPCFeatureDraft(foundry.applications.sheets.ActiveEffectConfig) {
    static DEFAULT_OPTIONS = {classes: ["sbs-setting-dialog"]};
    get title() { return this.editing ? super.title : "Add Effect"; }
    async _preparePartContext(part, context) {
      const data = await super._preparePartContext(part, context);
      if (part === "footer") data.buttons = [{type: "button", action: "addDraft",
        icon: this.editing ? "fa-solid fa-floppy-disk" : "fa-solid fa-plus", label: this.editing ? "Save Changes" : "Add to NPC"}];
      return data;
    }
    async _processSubmitData(event, form, data) {
      const result = await super._processSubmitData(event, form, data);
      if (!this.adding) await this.render();
      return result;
    }
  };
}

export async function openNPCFeatureDraft(type, onAdd, source) {
  const effect = type === "effect";
  const DocumentClass = effect ? CONFIG.ActiveEffect.documentClass : CONFIG.Item.documentClass;
  const parent = effect ? new CONFIG.Actor.documentClass({name: "NPC draft", type: "npc"}) : undefined;
  const name = effect ? "New Effect" : game.i18n.localize(`TYPES.Item.${type}`);
  const data = effect ? {name, transfer: false} : {name, type, img: `systems/swade/assets/icons/${type}.svg`};
  const draft = new DocumentClass(source ? structuredClone(source) : data, {parent});
  const Sheet = effect ? NPCEffectDraft : NPCItemDraft;
  const sheet = new Sheet({document: draft});
  sheet.editing = !!source;
  sheet.onAdd = onAdd;
  keepDraftLocal(draft, sheet);
  return sheet.render({force: true});
}

export async function createSkill({actor, data = {}} = {}) {
  await librarySkills();
  if (actor ? !actor.isOwner : !game.user.isGM || getPack()?.locked) {
    throw new Error("You do not have permission to create a skill here.");
  }
  const draft = new CONFIG.Item.documentClass({
    ...data, name: data.name ?? game.i18n.localize("TYPES.Item.skill"), type: "skill", img: data.img ?? ICON,
    ownership: {...data.ownership, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER}
  }, actor ? {parent: actor} : {});
  const sheet = new DraftSheet({document: draft});
  keepDraftLocal(draft, sheet);
  sheet.targetActor = actor;
  await sheet.render({force: true});
  return sheet;
}
