import {t as sbsI18n} from "./i18n.mjs";
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
          if (!data.name) throw new Error(sbsI18n("swade-better-setting.UI.Enteranamebeforeaddingthis_774d292009"));
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
      window: {title: sbsI18n("swade-better-setting.UI.Createnewskill_7d7d4a1ad7")},
      actions: {openTweaks: function () { new DraftTweaks({document: this.document}).render({force: true}); }}
    };
    get isEditable() { return true; }
    get isVisible() { return true; }
    get title() { return sbsI18n("swade-better-setting.UI.Createnewskill_7d7d4a1ad7"); }
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
        label.textContent = sbsI18n("swade-better-setting.UI.AddtoSkillCompendium_511e15ab99");
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
      button.innerHTML = `<i class="fa-solid fa-plus" inert></i> ${sbsI18n("swade-better-setting.UI.Addskill_bc4db5d337")}`;
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
        if (!data.name) throw new Error(sbsI18n("swade-better-setting.UI.Enteranamefortheskill_33c5ba7e3b"));
        const skills = await librarySkills();
        const exists = skills.some(item => normalizeName(item.name) === normalizeName(data.name));
        const clean = skillData(data);
        if (this.targetActor) {
          if (!this.targetActor.isOwner) throw new Error(sbsI18n("swade-better-setting.UI.Youdonothavepermissionto_a08e9eb79d"));
          if (this.targetActor.items.some(item => item.type === "skill" && normalizeName(item.name) === normalizeName(data.name))) {
            throw new Error(sbsI18n("swade-better-setting.UI.Thisactoralreadyhasaskill_a8b36cc73f"));
          }
          if (!exists && (this.addToLibrary ?? true)) {
            foundry.utils.setProperty(clean, `flags.${MODULE_ID}.pendingLibrary`, true);
          }
        } else {
          if (exists) throw new Error(sbsI18n("swade-better-setting.UI.Thecompendiumalreadyhasaskill_d732b4263f"));
          if (!game.user.isGM || getPack()?.locked) throw new Error(sbsI18n("swade-better-setting.UI.AGMmustunlocktheskill_dcaca7f5cf"));
        }
        const created = await CONFIG.Item.documentClass.create(clean, this.targetActor ? {parent: this.targetActor} : {pack: getPack().collection});
        if (!created) throw new Error(sbsI18n("swade-better-setting.UI.Theskillcouldnotbecreated_dae43d0183"));
        this.saved = created;
        if (created.getFlag(MODULE_ID, "pendingLibrary") && !game.users.activeGM) {
          ui.notifications.info(sbsI18n("swade-better-setting.UI.SkilladdedItscompendiumcopywill_d71be77f34"));
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
          ? `<button type="button" data-action="addDraft"><i class="fa-solid fa-floppy-disk" inert></i> ${sbsI18n("swade-better-setting.UI.SaveChanges_35322b5bb5")}</button>`
          : `<button type="button" data-action="addDraft"><i class="fa-solid fa-plus" inert></i> ${sbsI18n("swade-better-setting.UI.AddtoNPC_c4003b5d45")}</button>`;
        content.append(footer);
      }
    }
  };
  NPCEffectDraft = class extends NPCFeatureDraft(foundry.applications.sheets.ActiveEffectConfig) {
    static DEFAULT_OPTIONS = {classes: ["sbs-setting-dialog"]};
    get title() { return this.editing ? super.title : sbsI18n("swade-better-setting.UI.AddEffect_86e0214437"); }
    async _preparePartContext(part, context) {
      const data = await super._preparePartContext(part, context);
      if (part === "footer") data.buttons = [{type: "button", action: "addDraft",
        icon: this.editing ? "fa-solid fa-floppy-disk" : "fa-solid fa-plus", label: this.editing ? sbsI18n("swade-better-setting.UI.SaveChanges_35322b5bb5") : sbsI18n("swade-better-setting.UI.AddtoNPC_c4003b5d45")}];
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
  const parent = effect ? new CONFIG.Actor.documentClass({name: sbsI18n("swade-better-setting.UI.NPCdraft_c09fec0cfc"), type: "npc"}) : undefined;
  const name = effect ? sbsI18n("swade-better-setting.UI.NewEffect_6c913e4e60") : game.i18n.localize(`TYPES.Item.${type}`);
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
    throw new Error(sbsI18n("swade-better-setting.UI.Youdonothavepermissionto_0507b593fc"));
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
