import {t as sbsI18n} from "./i18n.mjs";
import {usesTargetRows} from "./chat-target-data.mjs";

const observers = new Map();
const rootObservers = new WeakMap();
const wiredRoots = new WeakSet();
const descriptions = new WeakMap();

function after(anchor, node) {
  if (node && anchor.nextElementSibling !== node) anchor.after(node);
  return node ?? anchor;
}

function powerDescription(root, content, item) {
  let state = descriptions.get(root);
  if (state) return state;
  const description = document.createElement("section"); description.className = "sbs-power-description";
  const modifiers = document.createElement("section"); modifiers.className = "sbs-power-description-modifiers";
  const accordion = document.createElement("details"); accordion.className = "sbs-chat-description"; accordion.open = true;
  const divider = document.createElement("summary"); divider.className = "sbs-description-divider";
  divider.setAttribute("aria-label", sbsI18n("swade-better-setting.UI.Itemdescription_89ed70057c"));
  divider.dataset.tooltipText = sbsI18n("swade-better-setting.UI.Collapseorexpanditemdescription_53c9288942");
  const label = document.createElement("span"); label.className = "sbs-description-label"; label.textContent = sbsI18n("swade-better-setting.UI.Description_526e0087cc");
  divider.append(label); accordion.append(divider, description, modifiers);
  state = {description, modifiers, accordion}; descriptions.set(root, state);
  const powers = game.modules.get("swade-better-powers")?.api;
  const load = powers?.powerChatDescription ? powers.powerChatDescription(item) : (async () => {
    const source = document.createElement("div"); source.innerHTML = item.system.description ?? "";
    const legacy = source.querySelector(".sbs-power-modifier-summary"); legacy?.remove();
    const enrich = text => foundry.applications.ux.TextEditor.implementation.enrichHTML(text, {relativeTo: item, secrets: false});
    return {description: await enrich(source.innerHTML), modifiers: await enrich(legacy?.outerHTML ?? "")};
  })();
  void load.then(data => {
    if (!content.contains(description)) return;
    description.innerHTML = data.description; modifiers.innerHTML = data.modifiers;
  }).catch(error => console.error("Better Setting | Power chat description", error));
  return state;
}

function layout(message, root) {
  if (message.isContentVisible === false || message.visible === false) return;
  const content = root.querySelector(".message-content");
  if (!content || (!message.rolls?.length && !content.querySelector(".swade.chat-card"))) return;
  root.classList.add("sbs-chat-card");
  const speaker = message.speaker ?? {};
  const token = game.scenes.get(speaker.scene)?.tokens.get(speaker.token);
  const actor = token?.actor ?? game.actors.get(speaker.actor);
  const header = root.querySelector(".message-header");
  if (header && actor?.testUserPermission(game.user, "LIMITED") && !header.querySelector(".sbs-chat-avatar")) {
    const portrait = root.ownerDocument.createElement("img");
    portrait.className = "sbs-chat-avatar";
    portrait.src = token && (!token.hidden || game.user.isGM) ? token.texture.src : actor.img;
    portrait.alt = "";
    header.classList.add("sbs-has-avatar");
    header.prepend(portrait);
  }
  const itemUuid = message.flags?.["swade-hud"]?.powerCast?.itemUuid
    ?? message.flags?.["swade-better-powers"]?.powerCast?.itemUuid
    ?? message.flags?.["swade-better-effects"]?.context?.itemUuid
    ?? content.querySelector("[data-item-uuid]")?.dataset.itemUuid;
  const item = (itemUuid ? foundry.utils.fromUuidSync(itemUuid) : null) ?? actor?.items.get(message.flags?.["swade-tools"]?.itemroll);
  const context = message.flags?.["swade-better-effects"]?.context ?? {};
  const weaponDamage = item?.type === "weapon" && (context.rollType === "damage"
    || message.flags?.["swade-tools"]?.rolltype === "damage");
  root.classList.toggle("sbs-weapon-damage-card", weaponDamage);
  if (weaponDamage) {
    // Tools puts an item card and raw damage formula in the speaker's flavor.
    // Keep the item header in the content, and retain unrelated warning text.
    const flavor = header?.querySelector(".flavor-text");
    flavor?.querySelectorAll(".swadetools-pseudocard").forEach(node => node.remove());
    const prefix = game.i18n.localize("SWADE.Dmg") + ":";
    flavor?.querySelectorAll(":scope > div").forEach(node => {
      if (node.textContent.trim().startsWith(prefix)) node.remove();
    });
    if (flavor && !flavor.textContent.trim() && !flavor.children.length) flavor.remove();
  }
  let rows = content.querySelector(".sbe-target-responses");
  if (!usesTargetRows({item, context})) { rows?.remove(); rows = null; }
  root.classList.toggle("sbs-has-target-rows", !!rows);
  const card = content.querySelector(".swade-hud-power-cast") ?? content;
  content.querySelectorAll(".sbs-chat-item-meta").forEach(node => node.remove());
  const flags = content.querySelector(".sbe-chat-roll-flags");
  const hideItem = item?.actor?.type === "npc" && !game.user.isGM && game.settings.get("swade", "hideNpcItemChatCards");
  if (item && !hideItem) {
    let itemHeader = card.querySelector(":scope > .card-header") ?? content.querySelector(".card-header");
    if (!itemHeader) {
      itemHeader = root.ownerDocument.createElement("header");
      itemHeader.className = "card-header flexrow sbs-roll-item-header";
      const icon = root.ownerDocument.createElement("img"); icon.src = item.img; icon.alt = "";
      const title = root.ownerDocument.createElement("strong"); title.textContent = item.name;
      itemHeader.append(icon, title); content.prepend(itemHeader);
    }
    if (item.type === "power") {
      root.classList.add("sbs-power-card");
      root.classList.toggle("sbs-damaging-power", !!String(item.system.damage ?? "").trim());
      // The HUD finishes its native card asynchronously. Reuse its header and
      // discard our interim header rather than nesting both in the result.
      for (const duplicate of content.querySelectorAll(".card-header")) if (duplicate !== itemHeader) duplicate.remove();
      if (card.firstElementChild !== itemHeader) card.prepend(itemHeader);
      content.querySelectorAll(".resist-rolls").forEach(group => group.remove());
    }
    if (item.type === "power" && item.system.rank && !itemHeader.querySelector(".sbs-chat-rank")) {
      const rank = root.ownerDocument.createElement("span");
      rank.className = "sbs-chat-rank"; rank.textContent = item.system.rank; itemHeader.append(rank);
    }
    let meta = content.querySelector(".sbs-chat-stats");
    if (!meta) {
      meta = root.ownerDocument.createElement("div"); meta.className = "sbs-chat-stats";
      for (const [label, value] of [[sbsI18n("swade-better-setting.UI.Range_5de74a81b1"), item.system.range], [sbsI18n("swade-better-setting.UI.Duration_4fc52a3c4c"), item.type === "power" ? item.system.duration : null]]) {
        if (!value) continue;
        const field = root.ownerDocument.createElement("span"), title = root.ownerDocument.createElement("strong");
        title.textContent = label + " "; field.append(title, String(value)); meta.append(field);
      }
    }
    let anchor = after(itemHeader, flags);
    anchor = after(anchor, meta);
    if (item.type === "power") {
      const description = powerDescription(root, content, item);
      after(anchor, description.accordion);
    }
  } else if (flags && content.firstElementChild !== flags) {
    content.prepend(flags);
  }
  if (rows && rows.parentElement !== card) card.append(rows);
  const roll = content.querySelector(".swade-roll-message");
  const modifiers = [...content.querySelectorAll("details.modifiers")];
  if (roll && modifiers.length) {
    const main = modifiers[0]; main.classList.add("sbs-roll-modifier-accordion");
    for (const extra of modifiers.slice(1)) {
      const list = main.querySelector(".modifier-list"), other = extra.querySelector(".modifier-list");
      if (list && other) { list.append(...other.children); extra.remove(); }
    }
    if (roll.lastElementChild !== main) roll.append(main);
  }
  const castingOptions = content.querySelector(".sbp-cast-options-button");
  const modifierAccordion = content.querySelector(".sbs-roll-modifier-accordion, details.modifiers");
  if (castingOptions && modifierAccordion && modifierAccordion.previousElementSibling !== castingOptions) modifierAccordion.before(castingOptions);
  const targetFlags = content.querySelector(".sbe-chat-target-flags");
  if (targetFlags) {
    const damage = context.rollType === "damage" || message.flags?.["swade-tools"]?.rolltype === "damage"
      || message.significantRoll?.options?.rollType === "damage";
    const anchor = damage ? content.querySelector("button.calculate-wounds") ?? content.querySelector(".swadetools-target-title")
      : content.querySelector(".swadetools-target-title");
    if (anchor && anchor.previousElementSibling !== targetFlags) anchor.before(targetFlags);
  }
  // Notes may finish enriching after the other modules have rendered their controls.
  // Keep every note source visible at the bottom of the actual message content.
  const notes = [...root.querySelectorAll(".sbe-roll-notes")];
  const tail = [...content.children].slice(-notes.length);
  if (notes.length && !notes.every((node, index) => tail[index] === node)) content.append(...notes);
}

export function installChatLayout() {
  Hooks.on("renderChatMessageHTML", (message, root) => {
    const copies = observers.get(message.id) ?? new Set();
    const previous = rootObservers.get(root);
    previous?.release();
    if (previous) copies.delete(previous.ref);
    layout(message, root);
    if (!root.classList.contains("sbs-chat-card")) return;
    // Other modules enrich their cards asynchronously. Move existing nodes so
    // native roll, damage, effect and template handlers remain attached.
    const binding = {frame: null};
    const observe = () => binding.observer.observe(root, {childList: true, subtree: true});
    binding.observer = new MutationObserver(() => {
      if (binding.frame !== null) return;
      binding.frame = requestAnimationFrame(() => {
        binding.frame = null;
        // Layout moves existing nodes. Do not observe our own changes and run
        // the entire layout again in response to them.
        binding.observer.disconnect();
        try { layout(message, root); } finally { observe(); }
      });
    });
    binding.release = () => {
      binding.observer.disconnect();
      if (binding.frame !== null) cancelAnimationFrame(binding.frame);
      binding.frame = null;
    };
    observe();
    rootObservers.set(root, binding);
    binding.ref = new WeakRef(binding);
    copies.add(binding.ref); observers.set(message.id, copies);
    if (!wiredRoots.has(root)) root.addEventListener("click", event => {
      const portrait = event.target.closest(".sbe-target-row img");
      if (!portrait) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const token = foundry.utils.fromUuidSync(portrait.closest(".sbe-target-row").dataset.tokenUuid);
      if (!canvas.ready || token?.parent.id !== canvas.scene.id || !token.object?.visible) return ui.notifications.warn(sbsI18n("swade-better-setting.UI.Thistargetisnotvisibleon_0a78971b2e"));
      void canvas.animatePan({x: token.object.center.x, y: token.object.center.y});
    }, {capture: true});
    wiredRoots.add(root);
    // History cards are initially detached while Foundry builds the batch.
    // Do not disconnect them based on isConnected: later hooks still enrich them.
    // Weak references let discarded cards and their observers be collected.
    // Prune only this message's copies: scanning all history per card is quadratic.
    for (const ref of copies) if (!ref.deref()) copies.delete(ref);
  });
  Hooks.on("deleteChatMessage", message => { for (const ref of observers.get(message.id) ?? []) ref.deref()?.release(); observers.delete(message.id); });
}
