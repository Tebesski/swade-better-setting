import {t as sbsI18n} from "./i18n.mjs";
import {MODULE_ID} from "./skills.mjs";
import {isSelfRange, includeSelfTarget} from "./self-targeting.mjs";
import {extendTargetingSchemas} from "./targeting-schema.mjs";
import {wrapMethod} from "./integrations.mjs";
import {parseTargetRange, rangeBand, rangeValues} from "./targeting-range.mjs";
import {ALIGNMENTS, TARGET_ICONS as ICONS, renderCrosshairSettings, targetAlignment, targetingAppearance, updateCrosshairOutline} from "./targeting-appearance.mjs";

let session;
const usable = token => token?.actor && !token.destroyed && token.visible !== false && token.isVisible !== false
  && (!token.document.hidden || game.user.isGM);

function sourceToken(actor) {
  const tokens = canvas.tokens.placeables.filter(token => usable(token) && (token.actor.uuid === actor?.uuid
    || (!actor?.isToken && token.document.actorId === actor?.id)));
  return tokens.find(token => token.controlled) ?? tokens.find(token => token.id === actor?.token?.id)
    ?? tokens.find(token => token === game.modules.get("swade-hud")?.api?.token) ?? tokens[0];
}

function actionRange(item, action) {
  const extra = item?.system?.actions?.additional?.[action];
  return extra?.range?.trim() || item?.system?.range || "";
}

function requestRange(actor, item, action) {
  const labels = Object.fromEntries(Object.entries(CONFIG.SWADE.attributes).map(([key, value]) => [key, game.i18n.localize(value.long)]));
  return parseTargetRange(actionRange(item, action), rangeValues(actor, labels));
}

export function registerAdvancedTargeting() {
  game.settings.register(MODULE_ID, "advancedTargeting", {
    name: sbsI18n("swade-better-setting.UI.Advancedtargeting_e1a25a0d3a"), hint: sbsI18n("swade-better-setting.UI.Choosetargetsbeforeitemrollsconsumable_100eebe280"),
    scope: "user", config: true, type: Boolean, default: false,
    onChange: () => session?.cancel()
  });
  game.settings.register(MODULE_ID, "targetingIcon", {
    name: sbsI18n("swade-better-setting.UI.Crosshair_8b3214b0ce"), scope: "user", config: true, type: String,
    default: "ic_system_target_01.svg", choices: ICONS, onChange: () => session?.cancel()
  });
  game.settings.register(MODULE_ID, "targetingUseOne", {
    name: sbsI18n("swade-better-setting.UI.Useonecrosshairforall_1b48381f6a"), scope: "user", config: true, type: Boolean, default: true,
    onChange: () => session?.cancel()
  });
  game.settings.register(MODULE_ID, "targetingAnimation", {
    name: sbsI18n("swade-better-setting.UI.Animatecrosshaironhover_25c6e182b8"), scope: "user", config: true, type: Boolean, default: true,
    onChange: () => session?.cancel()
  });
  for (const [alignment, {color}] of Object.entries(ALIGNMENTS)) {
    game.settings.register(MODULE_ID, "targetingIcon-" + alignment, {
      name: sbsI18n("swade-better-setting.UI.Crosshair_8b3214b0ce"), scope: "user", config: true, type: String, choices: ICONS,
      default: "ic_system_target_01.svg", onChange: () => session?.cancel()
    });
    game.settings.register(MODULE_ID, "targetingOutline-" + alignment, {
      name: sbsI18n("swade-better-setting.UI.Outline_eabbf3abaf"), scope: "user", config: true, type: Boolean, default: true, onChange: () => session?.cancel()
    });
    game.settings.register(MODULE_ID, "targetingColor-" + alignment, {
      name: sbsI18n("swade-better-setting.UI.Outlinecolor_375b9bf724"), scope: "user", config: true, type: String, default: color, onChange: () => session?.cancel()
    });
  }
  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (root) renderCrosshairSettings(root, MODULE_ID);
  });

  // Keep item data in the system schema so ranges survive compendium copies and exports.
  extendTargetingSchemas(CONFIG.Item.dataModels, foundry.data.fields.StringField);
}

function addRangeField(root, name, value, disabled) {
  if (root.querySelector(`[name="${CSS.escape(name)}"]`)) return;
  const doc = root.ownerDocument;
  const row = doc.createElement("label");
  row.className = "form-group sbs-item-range";
  const caption = doc.createElement("span");
  caption.textContent = sbsI18n("swade-better-setting.UI.Range_5de74a81b1");
  const fields = doc.createElement("span");
  fields.className = "form-fields";
  const input = doc.createElement("input");
  Object.assign(input, {type: "text", name, value: value ?? "", placeholder: sbsI18n("swade-better-setting.UI.61218orspi_b0147236f6"), disabled});
  fields.append(input);
  row.append(caption, fields);
  const additional = root.querySelector(".additional-stats-header");
  if (additional) additional.before(row);
  else root.append(row);
}

export function withAdvancedTargeting({actor, item, action = "formula", traitAction = false, skip = false}, execute) {
  if (skip || !canvas?.ready || !actor?.isOwner) return execute();
  if (item && action !== "damage" && isSelfRange(actionRange(item, action), game.i18n.localize("SWADE.Range.Self"))) {
    includeSelfTarget(sourceToken(actor), game.user.targets, ids => canvas.tokens.setTargets(ids, {mode: "replace"}));
    return execute();
  }
  if (!game.settings.get(MODULE_ID, "advancedTargeting")
    || game.user.targets.size) return execute();
  const range = requestRange(actor, item, action);
  const rangeText = String(actionRange(item, action)).trim().toLocaleLowerCase();
  const touch = rangeText === "touch" || rangeText === game.i18n.localize("SWADE.Range.Touch").trim().toLocaleLowerCase();
  if (!range && !touch && !traitAction && item?.type !== "weapon") return execute();
  const source = sourceToken(actor);
  if (!source) return execute();
  session?.cancel();
  return selectTargets(source, range).then(selected => selected ? execute() : null);
}

function selectTargets(source, range) {
  return new Promise(resolve => {
    const scene = canvas.scene;
    const board = canvas.app.view;
    const root = document.documentElement;
    const cursor = document.createElement("div");
    cursor.className = "sbs-targeting-cursor";
    cursor.hidden = true;
    const image = document.createElement("img");
    image.src = `modules/${MODULE_ID}/assets/${game.settings.get(MODULE_ID, "targetingIcon")}`;
    image.alt = "";
    const label = document.createElement("span");
    label.className = "sbs-targeting-range";
    cursor.append(label, image);
    cursor.setAttribute("aria-hidden", "true");
    document.body.append(cursor);
    const selection = new Set();
    const outlines = new Map();
    const controller = new AbortController();
    const {signal} = controller;
    let hover;
    let lastPointer;
    let frame;
    let done = false;
    let batch = false;
    const appearance = token => targetingAppearance(key => game.settings.get(MODULE_ID, key), targetAlignment(token, source));
    const stop = event => { event.preventDefault(); event.stopImmediatePropagation(); };

    function outline(token) {
      if (outlines.has(token)) return;
      const style = appearance(token);
      if (!style.outline) return;
      const graphic = new PIXI.Graphics();
      graphic.eventMode = "none";
      graphic.lineStyle(2, Number.parseInt(style.color.slice(1), 16), 1);
      graphic.drawShape(token.shape ?? token.getShape());
      token.addChild(graphic);
      outlines.set(token, graphic);
    }
    function clearOutline(token) {
      const graphic = outlines.get(token);
      if (graphic && !graphic.destroyed) graphic.destroy();
      outlines.delete(token);
    }
    function finish(commit) {
      if (done) return;
      const valid = [...selection].filter(token => usable(token) && canvas.scene === scene && token.document.parent === scene);
      if (commit && !valid.length) return;
      done = true;
      controller.abort();
      cancelAnimationFrame(frame);
      cursor.remove();
      root.classList.remove("sbs-advanced-targeting");
      for (const token of outlines.keys()) clearOutline(token);
      session = undefined;
      Hooks.callAll("sbsAdvancedTargeting", false);
      if (commit && usable(source) && source.actor.isOwner) {
        canvas.tokens.setTargets(valid.map(token => token.id), {mode: "replace"});
        resolve(valid);
      } else resolve(null);
    }
    const current = {cancel: () => finish(false)};
    session = current;
    Hooks.callAll("sbsAdvancedTargeting", true);
    root.classList.add("sbs-advanced-targeting");
    game.tooltip.deactivate();

    function paint() {
      frame = undefined;
      if (!lastPointer || done) return;
      const event = lastPointer;
      const onCanvas = document.elementFromPoint(event.clientX, event.clientY) === board;
      cursor.hidden = !onCanvas;
      if (!onCanvas) return;
      const point = canvas.stage.toLocal(new PIXI.Point(event.clientX, event.clientY));
      const tokens = canvas.tokens.placeables.filter(token => usable(token)
        && token.shape?.contains(point.x - token.x, point.y - token.y));
      tokens.sort((a, b) => (b.document.sort ?? 0) - (a.document.sort ?? 0));
      const next = tokens[0];
      if (next !== hover) {
        if (hover && !selection.has(hover)) clearOutline(hover);
        hover = next;
        if (hover) outline(hover);
      }
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
      const style = appearance(hover);
      image.src = `modules/${MODULE_ID}/assets/${style.icon}`;
      cursor.style.setProperty("--target-color", hover ? style.color : "#ddd");
      cursor.classList.toggle("has-target", !!hover);
      cursor.classList.toggle("has-outline", !!hover && style.outline);
      updateCrosshairOutline(image, !!hover && style.outline, style.color);
      cursor.classList.toggle("is-animated", !!hover && game.settings.get(MODULE_ID, "targetingAnimation"));
      if (range && hover) {
        const end = hover.center;
        const distance = canvas.grid.measurePath([source.center, end]).distance;
        label.textContent = `${Number(distance.toFixed(1))}″ (${range.join("/")})`;
        label.dataset.band = rangeBand(distance, range);
      } else label.textContent = "";
    }
    function move(event) {
      lastPointer = event;
      if (!frame) frame = requestAnimationFrame(paint);
    }
    document.addEventListener("pointermove", move, {capture: true, signal});
    document.addEventListener("pointerdown", event => {
      if (event.target !== board || event.button !== 0) return;
      stop(event);
      lastPointer = event;
      paint();
      if (!hover) return;
      if (event.shiftKey) {
        batch = true;
        if (selection.has(hover)) selection.delete(hover);
        else { selection.add(hover); outline(hover); }
      } else {
        selection.add(hover);
        finish(true);
      }
    }, {capture: true, signal});
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") { stop(event); finish(false); }
    }, {capture: true, signal});
    document.addEventListener("keyup", event => {
      if (event.key === "Shift" && batch) { stop(event); finish(true); }
    }, {capture: true, signal});
    window.addEventListener("blur", () => finish(false), {signal});
    current.source = source;
  });
}

export function installAdvancedTargeting() {
  const actor = CONFIG.Actor.documentClass.prototype;
  for (const method of [sbsI18n("swade-better-setting.UI.rollSkill_54151af40b"), sbsI18n("swade-better-setting.UI.rollAttribute_722362ed79")]) {
    wrapMethod(actor, method, function(original, trait, options = {}, ...args) {
      return withAdvancedTargeting({actor: this, item: options.item, action: options.sbsTargetingAction,
        traitAction: options.effectFlags?.some(flag => ["support", "test"].includes(flag)),
        skip: options.suppressChat || options.sbsResistance}, () => original(trait, options, ...args));
    });
  }
  const item = CONFIG.Item.documentClass.prototype;
  wrapMethod(item, "rollDamage", function(original, options = {}) {
    const action = options.sbsTargetingAction ?? Object.entries(this.system.actions?.additional ?? {})
      .find(([, entry]) => entry.name === options.flavour)?.[0];
    return withAdvancedTargeting({actor: this.actor, item: this, action, skip: options.suppressChat || !!options.sbeInlineTargetUuid}, () => original(options));
  });
  wrapMethod(item, "consume", function(original, ...args) {
    if (this.type !== "consumable") return original(...args);
    return withAdvancedTargeting({actor: this.actor, item: this, action: "consume"}, () => original(...args));
  });
  const helper = game.swade.itemChatCardHelper;
  for (const method of [sbsI18n("swade-better-setting.UI.handleAction_e9ec4dde2a"), sbsI18n("swade-better-setting.UI.handleFormulaAction_c5515a7f3f"), sbsI18n("swade-better-setting.UI.handleDamageAction_bb6a8a28cb"), sbsI18n("swade-better-setting.UI.handleAdditionalActions_fd8afa85ff")]) {
    if (typeof helper[method] !== "function") continue;
    wrapMethod(helper, method, function(original, item, actor, action, ...args) {
      const key = method === "handleFormulaAction" ? "formula" : method === "handleDamageAction" ? "damage" : action;
      const extra = item.system.actions?.additional?.[key];
      const eligible = ["formula", "damage", "consume"].includes(key) || !!extra;
      return withAdvancedTargeting({actor, item, action: key, skip: !eligible},
        () => original(item, actor, action, ...args));
    });
  }
  wrapMethod(CONFIG.ChatMessage.dataModels.itemCard.prototype, "_handleButtonClick", function(original, event, button, html) {
    const item = this._item;
    const action = button.dataset.action;
    const extra = item?.system.actions?.additional?.[action];
    const eligible = ["formula", "damage", "consume"].includes(action) || !!extra;
    return withAdvancedTargeting({actor: item?.actor, item, action, skip: !eligible}, () => original(event, button, html));
  });
  Hooks.on("canvasTearDown", () => session?.cancel());
  Hooks.on("deleteToken", token => {
    if (session?.source.document === token) session.cancel();
  });
  Hooks.on("renderApplicationV2", (app, root) => {
    const item = app.document;
    if (item?.documentName !== "Item") return;
    const sidebar = root.querySelector(".sheet-sidebar");
    if (sidebar && ["consumable", "action"].includes(item.type)) addRangeField(sidebar, "system.range", item.system.range, !app.isEditable);
    for (const action of root.querySelectorAll("details[data-action-id]")) {
      const id = action.dataset.actionId;
      const data = item.system.actions?.additional?.[id];
      const content = action.querySelector(".content");
      if (data && content && !data.resolved) addRangeField(content, `system.actions.additional.${id}.range`, data.range, !app.isEditable);
    }
  });
}
