import {ICON, MODULE_ID, normalizeName, skillData} from "./skills.mjs";
import {getPack, librarySkills} from "./library.mjs";

let DraftSheet;
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
  // SWADE's image picker and Tweaks sheet call document.update directly.
  // Keep these edits on the temporary document until the explicit submit.
  draft.update = async function (changes) {
    this.updateSource(changes);
    if (changes.img) {
      for (const image of sheet.element?.querySelectorAll('img[data-edit="img"]') ?? []) image.src = changes.img;
    }
    return this;
  };
  const sheet = new DraftSheet({document: draft});
  sheet.targetActor = actor;
  await sheet.render({force: true});
  return sheet;
}
