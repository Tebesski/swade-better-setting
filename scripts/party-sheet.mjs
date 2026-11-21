import {t as sbsI18n} from "./i18n.mjs";
import {MODULE_ID, normalizeName} from "./skills.mjs";
import {ChoicePicker} from "./picker.mjs";
import {depositPartyMoney, partyMoney, preparePartyStash} from "./party-stash.mjs";
import {installPartyVaultPermissions, isPartyVault, isVaultFor, prepareVaults, renderPartyGrid, vaultActions} from "./party-vaults.mjs";

const template = part => "modules/" + MODULE_ID + "/templates/party/" + part + ".hbs";
const byName = (a, b) => a.name.localeCompare(b.name);
const memberType = actor => ["character", "npc"].includes(actor?.type);
const activityKey = uuid => uuid.replaceAll(".", "_");
const editable = app => app.isEditable && !app.actor.system.locked;
const stat = number => Number.isFinite(number) ? number : "—";
const CURRENT_PARTY = "currentParty";
const currentPartyId = () => game.settings.get(MODULE_ID, CURRENT_PARTY);

export function registerPartyShortcut() {
  game.settings.register(MODULE_ID, CURRENT_PARTY, {
    scope: "world", config: false, type: String, default: "",
    onChange: () => Hooks.callAll("sbsCurrentPartyChanged")
  });
  game.keybindings.register(MODULE_ID, "openCurrentParty", {
    name: sbsI18n("swade-better-setting.UI.OpenCurrentParty_fb7c675069"),
    editable: [{key: "KeyP"}],
    onDown: () => {
      const party = game.actors.get(currentPartyId());
      if (party?.type !== "group" || isPartyVault(party) || !party.testUserPermission(game.user, "LIMITED")) {
        ui.notifications.info(game.user.isGM ? sbsI18n("swade-better-setting.UI.MarkapartyasCurrentParty_8a94f03338") : sbsI18n("swade-better-setting.UI.Nocurrentpartysheetisavailable_3719628112"));
        return true;
      }
      const sheet = party.sheet;
      if (sheet?.rendered) void sheet.close();
      else void sheet?.render({force: true, focus: true});
      return true;
    }
  });
}

function traitDie(die) {
  const sides = Math.min(Number(die.sides), 12);
  const mod = (Number(die.modifier) || 0) + Math.max(0, (Number(die.sides) - 12) / 2);
  return {sides, mod, die: "d" + sides + (mod > 0 ? "+" + mod : mod < 0 ? mod : "")};
}

function partySkills(members) {
  const best = new Map();
  for (const member of members) for (const skill of member.skills) {
    const key = normalizeName(skill.name);
    const previous = best.get(key);
    if (!previous || skill.sides > previous.sides || (skill.sides === previous.sides && skill.mod > previous.mod)) {
      best.set(key, {...skill, holders: new Map([[member.uuid, member.name]])});
    } else if (skill.sides === previous.sides && skill.mod === previous.mod) previous.holders.set(member.uuid, member.name);
  }
  return [...best.values()].sort((a, b) => b.sides - a.sides || b.mod - a.mod || byName(a, b))
    .map(({holders, ...skill}) => ({...skill, owners: [...holders.values()].join(", ")}));
}

function prepareMember(uuid, actor, activity) {
  const {system} = actor;
  const skills = (actor.itemTypes.skill ?? []).map(item => ({id: item.id, name: item.name, uuid,
    owner: actor.name, ...traitDie(item.system.die), canRoll: actor.isOwner, core: !!item.system.isCoreSkill})).sort(byName);
  const attributes = Object.entries(CONFIG.SWADE.attributes).flatMap(([id, config]) => {
    const die = system.attributes?.[id]?.die;
    return die ? [{id, name: game.i18n.localize(config.long), ...traitDie(die), canRoll: actor.isOwner, uuid}] : [];
  });
  const wounds = system.wounds;
  const fatigue = system.fatigue;
  const rank = system.advances?.rank;
  return {uuid, name: actor.name, img: actor.img, skills, attributes, activity,
    profile: [rank && game.i18n.localize(rank), actor.ancestry?.name ?? system.details?.species?.name,
      actor.archetype?.name ?? system.details?.archetype].filter(Boolean).join(" · "),
    wildcard: actor.isWildcard, bennies: actor.bennies, canAdjustBennies: game.user.isGM && actor.isOwner,
    bennyStack: Array.from({length: Math.min(5, Math.max(1, actor.bennies ?? 0))}, (_, i) => i),
    wounds: wounds && wounds.value + "/" + wounds.max, fatigue: fatigue && fatigue.value + "/" + fatigue.max,
    wounded: !!wounds?.value, parry: stat(system.stats?.parry?.value), toughness: stat(system.stats?.toughness?.value),
    armor: stat(actor.armorPerLocation?.torso), pace: Number.isFinite(system.pace?.ground) ? system.pace.ground : null,
    travelSkills: skills.filter(skill => ["notice", "survival"].includes(normalizeName(skill.name)))
  };
}

function memberRows(app) {
  const activities = app.actor.getFlag(MODULE_ID, "partyActivities") ?? {};
  return [...app.actor.system.members].flatMap(([uuid, {actor}]) => {
    if (!actor) return app.isEditable ? [{uuid, name: sbsI18n("swade-better-setting.UI.Missingmember_4fca8ba426"), missing: true, skills: []}] : [];
    if (!actor.testUserPermission(game.user, "OBSERVER")) return [];
    return [prepareMember(uuid, actor, activities[activityKey(uuid)] ?? "")];
  });
}

function pinParties(root) {
  const list = root.querySelector(".directory-list");
  if (!list) return;
  const rows = [...list.querySelectorAll(".directory-item.entry[data-entry-id]")].filter(row => {
    const actor = game.actors.get(row.dataset.entryId);
    if (isPartyVault(actor)) {
      row.classList.add("sbs-party-storage-entry");
      return false;
    }
    return actor?.type === "group" && !row.hidden;
  });
  const doc = root.ownerDocument;
  let pinned = list.querySelector(":scope > .sbs-party-pin");
  if (!pinned) {
    pinned = doc.createElement("li");
    pinned.className = "sbs-party-pin";
    list.prepend(pinned);
  }
  if (rows.length) {
    const parties = doc.createElement("ol");
    parties.className = "plain";
    for (const row of rows) {
      row.classList.add("sbs-party-entry");
      parties.append(row);
    }
    pinned.replaceChildren(parties);
  } else if (game.user.isGM && !game.actors.some(actor => actor.type === "group" && !isPartyVault(actor))) {
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "sbs-create-party";
    button.innerHTML = `<i class="fa-solid fa-people-group" inert></i> ${sbsI18n("swade-better-setting.UI.CreateParty_a30106351d")}`;
    button.addEventListener("click", async () => {
      try {
        await CONFIG.Actor.documentClass.createDialog({name: sbsI18n("swade-better-setting.UI.TheParty_5489989ead"), type: "group"}, {}, {types: ["group"], folders: []});
      } catch (error) { ui.notifications.error(error.message); }
    });
    pinned.replaceChildren(button);
  } else pinned.remove();
}

export function installPartySheet() {
  const Native = CONFIG.Actor.sheetClasses.group?.["swade.GroupSheet"]?.cls;
  if (!Native) return;
  installPartyVaultPermissions();
  const openParties = new Set();
  const pendingBennies = new Map();

  class BetterPartySheet extends Native {
    static DEFAULT_OPTIONS = {
      classes: ["sbs-party-sheet"], position: {width: 760, height: 620},
      actions: {
        addPartyMember: BetterPartySheet.addMember,
        removePartyMember: BetterPartySheet.removeMember,
        rollPartySkill: BetterPartySheet.rollSkill,
        rollPartyAttribute: BetterPartySheet.rollAttribute,
        changePartyBenny: {handler: BetterPartySheet.changeBenny, buttons: [0, 2]},
        partyWallet: BetterPartySheet.openWallet,
        createPartyGear: BetterPartySheet.createGear,
        togglePartyGrid() { return vaultActions.toggle(this); },
        addPartyVault() { return vaultActions.add(this); },
        configurePartySlot(_event, target) { return vaultActions.configure(this, target.dataset.vaultId); },
        openPartyRecovery() { return vaultActions.recovery(this); },
        choosePartyContainer(_event, target) { return vaultActions.choose(this, target.dataset.vaultId); },
        removePartyVault(_event, target) { return vaultActions.remove(this, target.dataset.vaultId); },
        editPartyVault(_event, target) { return vaultActions.edit(this, target.dataset.vaultId); },
        selectPartyVault(_event, target) {
          this.selectedVault = target.dataset.vaultId;
          return this.render({parts: ["stash"]});
        }
      }
    };

    static PARTS = {
      header: {template: template("header")},
      tabs: {template: "templates/generic/tab-navigation.hbs"},
      overview: {template: template("overview"), scrollable: [""]},
      exploration: {template: template("exploration"), scrollable: [""]},
      stash: {template: template("stash"), scrollable: [""]},
      description: {template: template("notes"), scrollable: [""]}
    };

    static TABS = {
      members: {...Native.TABS.members, label: sbsI18n("swade-better-setting.UI.Overview_d4b1ea5708")},
      exploration: {id: "exploration", group: "primary", label: sbsI18n("swade-better-setting.UI.Exploration_f08e7f4a8d")},
      stash: {...Native.TABS.stash, label: sbsI18n("swade-better-setting.UI.Stash_38bdfeaa67")},
      description: {...Native.TABS.description, label: sbsI18n("swade-better-setting.UI.Notes_8a7525b149")}
    };

    #refreshTimer;
    #stashQuery = "";
    #stashGroups = new Map();
    #cleanupGrid;
    selectedVault = "all";

    _prepareMembers() { return memberRows(this); }
    _prepareItems() { return {}; }

    _getHeaderControls() {
      const controls = super._getHeaderControls();
      if (game.user.isGM && this.actor.system.locked) controls.push({
        label: sbsI18n("swade-better-setting.UI.Unlockpartysheet_b53be0e0ce"),
        icon: "fa-solid fa-lock-open",
        onClick: () => Native.toggleLock.call(this)
      });
      return controls;
    }

    async _prepareContext(options) {
      const context = await super._prepareContext(options);
      const members = context.members;
      const known = members.filter(member => !member.missing);
      const pace = known.map(member => member.pace).filter(Number.isFinite);
      const inventory = prepareVaults(this.actor, this.selectedVault);
      const stash = preparePartyStash(this.actor, known, inventory.visibleVaultActors, inventory.partyGrid);
      const supplies = Object.entries(this.actor.system.supplyLevels).filter(([key]) =>
        ["ammo", "fuel", "food", "supply"].includes(key)).map(([key, value]) => {
        const field = this.actor.system.schema.getField("supplyLevels." + key);
        return {path: "system.supplyLevels." + key, label: game.i18n.localize(field.label),
          value: game.i18n.localize(field.choices[value] ?? String(value))};
      });
      return {...context, visibleMembers: known, partySkills: partySkills(known), slowestPace: pace.length ? Math.min(...pace) : "—",
        editableParty: editable(this), supplies, ...stash, ...inventory,
        currentParty: currentPartyId() === this.actor.id, canSetCurrentParty: game.user.isGM && !isPartyVault(this.actor),
        defaultPartyArtwork: this.actor.img?.endsWith("icons/svg/mystery-man.svg"),
        weightUnit: game.settings.get("swade", "weightUnit") === "imperial" ? "lb" : "kg", stashQuery: this.#stashQuery};
    }

    async _onFirstRender(context, options) {
      await super._onFirstRender(context, options);
      for (const details of this.element.querySelectorAll(".sbs-party-member-skills")) details.open = false;
      // Member updates are handled below without attaching this sheet to their lifecycle.
      for (const {actor} of this.actor.system.members.values()) if (actor?.apps[this.id] === this) delete actor.apps[this.id];
      openParties.add(this);
    }

    async _onRender(context, options) {
      await super._onRender(context, options);
      if (options.parts.includes("header")) {
        this.parts.header.querySelector("[data-current-party]")?.addEventListener("change", async event => {
          event.stopPropagation();
          if (!game.user.isGM || isPartyVault(this.actor)) return;
          const id = event.currentTarget.checked ? this.actor.id : "";
          if (!id && currentPartyId() !== this.actor.id) return;
          try { await game.settings.set(MODULE_ID, CURRENT_PARTY, id); }
          catch (error) {
            ui.notifications.error(error.message);
            void this.render({parts: ["header"]});
          }
        });
      }
      for (const part of options.parts) for (const portrait of this.parts[part]?.querySelectorAll("[data-party-portrait]") ?? []) {
        const image = portrait.querySelector("img");
        if (!image) continue;
        const preview = image.cloneNode();
        preview.className = "sbs-party-portrait-preview";
        portrait.dataset.tooltipHtml = preview.outerHTML;
        portrait.dataset.tooltipClass = "sbs-party-portrait-tooltip";
      }
      const stash = this.parts.stash;
      if (options.parts.includes("stash") && stash) {
        this.#cleanupGrid?.();
        this.#cleanupGrid = renderPartyGrid(stash, this, context);
        const api = partyMoney();
        if (api?.currencyMark) {
          const currencies = game.settings.get("swade-better-money", "catalog").currencies;
          for (const mark of stash.querySelectorAll("[data-party-currency]")) {
            mark.replaceChildren(api.currencyMark(mark.ownerDocument, currencies.find(row => row.id === mark.dataset.partyCurrency)));
          }
        }
        const search = stash.querySelector("[data-party-stock-search]");
        if (search) {
          const groups = [...stash.querySelectorAll("[data-party-stash-group]")];
          const filter = () => {
            this.#stashQuery = search.value;
            const query = normalizeName(search.value);
            let visible = false;
            for (const section of groups) {
              let matching = false;
              for (const row of section.querySelectorAll("[data-party-item-name]")) {
                row.hidden = !normalizeName(row.dataset.partyItemName).includes(query);
                matching ||= !row.hidden;
              }
              section.hidden = !!query && !matching;
              section.open = query ? matching : !!this.#stashGroups.get(section.dataset.partyStashGroup);
              visible ||= matching;
            }
            stash.querySelector("[data-party-stash-empty]").hidden = !query || visible;
          };
          for (const section of groups) section.addEventListener("toggle", () => {
            if (!normalizeName(search.value)) this.#stashGroups.set(section.dataset.partyStashGroup, section.open);
          });
          search.addEventListener("input", filter);
          search.addEventListener("change", event => event.stopPropagation());
          filter();
        }
      }
      if (options.parts.includes("exploration")) {
        for (const input of this.parts.exploration.querySelectorAll("[data-party-activity]")) {
          input.addEventListener("change", event => {
            event.stopPropagation();
            const uuid = input.dataset.partyActivity;
            if (!editable(this) || !this.actor.system.members.has(uuid)) return;
            void this.actor.update({["flags." + MODULE_ID + ".partyActivities." + activityKey(uuid)]: input.value.trim()})
              .catch(error => ui.notifications.error(error.message));
          });
        }
      }
    }

    _toggleDisabled(disabled) {
      super._toggleDisabled(disabled);
      for (const control of this.element.querySelectorAll(
        'button[data-action="openMember"], button[data-action="openItem"], button[data-action="rollPartySkill"], button[data-action="rollPartyAttribute"], button[data-action="partyWallet"], .sbs-party-stash input[type="search"]'
      )) control.disabled = false;
      for (const control of this.element.querySelectorAll("[data-party-vault-control]")) control.disabled = false;
    }

    _onClose(options) {
      openParties.delete(this);
      clearTimeout(this.#refreshTimer);
      this.#cleanupGrid?.();
      super._onClose(options);
      if (this.actor.apps[this.id] === this) delete this.actor.apps[this.id];
    }

    refreshMember(uuid) {
      if (isVaultFor(this.actor, uuid)) return this.refreshInventory();
      if (!this.actor.system.members.has(uuid)) return;
      clearTimeout(this.#refreshTimer);
      this.#refreshTimer = setTimeout(() => {
        if (!this.rendered) return;
        const editing = this.element.querySelector("[data-party-activity]:focus, input[type=search]:focus");
        if (editing) editing.addEventListener("blur", () => this.refreshMember(uuid), {once: true});
        else void this.render({parts: ["overview", "exploration", "stash"]}).catch(error => console.error(MODULE_ID, error));
      }, 50);
    }

    refreshInventory() {
      if (this.rendered) void this.render({parts: ["stash"]}).catch(error => console.error(MODULE_ID, error));
    }

    async _onDropActor(_event, data) {
      if (!editable(this)) return false;
      return this.addMember(await CONFIG.Actor.documentClass.fromDropData(data));
    }

    async _onDropItem(event, data) {
      if (!editable(this)) return false;
      return super._onDropItem(event, data);
    }

    async _onDropFolder(event, data) {
      if (!editable(this)) return false;
      return super._onDropFolder(event, data);
    }

    async addMember(actor) {
      if (!editable(this) || !memberType(actor) || actor.pack || !actor.visible) return false;
      if (this.actor.system.members.has(actor.uuid)) return false;
      await this.actor.update({"system.members": [...this.actor.system.members.keys(), actor.uuid]});
      return true;
    }

    static async addMember() {
      if (!editable(this)) return;
      const actors = game.actors.filter(actor => actor.visible && memberType(actor) && !this.actor.system.members.has(actor.uuid)).sort(byName);
      const choices = actors.map(actor => ({key: actor.id, name: actor.name, img: actor.img}));
      return new ChoicePicker({window: {title: sbsI18n("swade-better-setting.UI.Addpartymember_83317f8d6e")}, classes: ["sbs-party-dialog"], pageSize: 100, choices,
        onSelect: id => this.addMember(game.actors.get(id))
      }).render({force: true});
    }

    static async removeMember(_event, target) {
      const uuid = target.closest("[data-member-uuid]")?.dataset.memberUuid;
      if (!editable(this) || !this.actor.system.members.has(uuid)) return;
      const member = this.actor.system.members.get(uuid)?.actor;
      const name = foundry.utils.escapeHTML(member?.name ?? "this missing member");
      const confirmed = await foundry.applications.api.DialogV2.confirm({
        classes: ["sbs-party-dialog"], window: {title: sbsI18n("swade-better-setting.UI.Removepartymember_78e6d85fe4")},
        content: `<p>${sbsI18n("swade-better-setting.UI.Remove_c3812fc4ac")} ` + name + " from the party?</p>", rejectClose: false
      });
      if (!confirmed || !editable(this)) return;
      await this.actor.update({"system.members": [...this.actor.system.members.keys()].filter(id => id !== uuid),
        ["flags." + MODULE_ID + ".partyActivities.-=" + activityKey(uuid)]: null});
    }

    static rollSkill(event, target) {
      const actor = this.actor.system.members.get(target.dataset.memberUuid)?.actor;
      const skill = actor?.items.get(target.dataset.skillId);
      if (actor?.isOwner && skill?.type === "skill") return actor.rollSkill(skill.id, {event});
    }

    static rollAttribute(event, target) {
      const actor = this.actor.system.members.get(target.dataset.memberUuid)?.actor;
      const attribute = target.dataset.attribute;
      if (actor?.isOwner && Object.hasOwn(CONFIG.SWADE.attributes, attribute)) return actor.rollAttribute(attribute, {event});
    }

    static async changeBenny(event, target) {
      const actor = this.actor.system.members.get(target.dataset.memberUuid)?.actor;
      if (!game.user.isGM || !actor?.isOwner || !actor.isWildcard) return;
      const remove = event.button === 2;
      const queue = (pendingBennies.get(actor.uuid) ?? Promise.resolve()).then(async () => {
        if (remove) {
          if (actor.bennies > 0) await actor.update({"system.bennies.value": actor.bennies - 1});
        } else if (actor.bennies < actor.system.bennies.max) await actor.getBenny();
      }).catch(error => ui.notifications.error(error.message));
      pendingBennies.set(actor.uuid, queue);
      await queue;
      if (pendingBennies.get(actor.uuid) === queue) pendingBennies.delete(actor.uuid);
    }

    static openWallet(_event, target) {
      const api = partyMoney();
      if (!api) return;
      const uuid = target.dataset.memberUuid;
      const actor = uuid ? this.actor.system.members.get(uuid)?.actor : this.actor;
      if (!actor?.isOwner || (!uuid && !editable(this))) return;
      if (target.dataset.mode === "deposit") return depositPartyMoney(actor, this.selectedVault).then(() => this.refreshInventory());
      return api.open(actor, {action: target.dataset.mode});
    }

    static async createGear(_event, target) {
      if (!editable(this)) return;
      const {type, group} = target.dataset;
      const system = group === "ammunition" ? {isAmmo: true} : group === "treasure" ? {category: sbsI18n("swade-better-setting.UI.Treasure_fbbbf4992f")} : {};
      await CONFIG.Item.documentClass.create({name: CONFIG.Item.documentClass.defaultName({type, parent: this.actor}), type, system},
        {parent: this.actor, renderSheet: true});
    }
  }

  foundry.applications.apps.DocumentSheetConfig.registerSheet(CONFIG.Actor.documentClass, MODULE_ID, BetterPartySheet, {
    types: ["group"], label: sbsI18n("swade-better-setting.UI.BetterPartySheet_f1a70288bf"), makeDefault: true
  });
  Hooks.on("renderActorDirectory", (_app, root) => pinParties(root));
  Hooks.on("sbsCurrentPartyChanged", () => {
    for (const app of openParties) {
      const checkbox = app.parts.header?.querySelector("[data-current-party]");
      if (checkbox) checkbox.checked = currentPartyId() === app.actor.id;
    }
  });
  Hooks.on("sbsPartyInventoryChanged", () => {
    for (const app of openParties) app.refreshInventory();
  });
  const refresh = actor => { if (actor) for (const app of openParties) app.refreshMember(actor.uuid); };
  for (const hook of [sbsI18n("swade-better-setting.UI.updateActor_688e2852e2"), sbsI18n("swade-better-setting.UI.deleteActor_703cc9c936")]) Hooks.on(hook, refresh);
  for (const hook of [sbsI18n("swade-better-setting.UI.createItem_2be87307d5"), sbsI18n("swade-better-setting.UI.updateItem_fc765ef48a"), sbsI18n("swade-better-setting.UI.deleteItem_0259ed622a"), sbsI18n("swade-better-setting.UI.createActiveEffect_4607bdbb60"), sbsI18n("swade-better-setting.UI.updateActiveEffect_5ddfac034c"), sbsI18n("swade-better-setting.UI.deleteActiveEffect_1194b28b56")]) {
    Hooks.on(hook, doc => refresh(doc.actor));
  }
  if (ui.actors?.rendered) void ui.actors.render();
}
