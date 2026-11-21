import {t as sbsI18n} from "./i18n.mjs";
const bindings = new WeakMap();
const targetTooltips = new WeakMap();

function updateTargetTooltips(root) {
  for (const section of root.querySelectorAll(".sbs-roll-targets")) {
    const list = section.querySelector(".sbs-roll-target-list");
    if (list.scrollWidth > list.clientWidth + 1) {
      section.dataset.tooltipHtml = targetTooltips.get(section);
      delete section.dataset.tooltipText;
      section.dataset.tooltipDirection = "UP";
      section.dataset.tooltipClass = "sbs-roll-target-tooltip";
    } else {
      delete section.dataset.tooltipHtml;
      delete section.dataset.tooltipText;
      delete section.dataset.tooltipDirection;
      delete section.dataset.tooltipClass;
    }
  }
}

function rollTargets(root) {
  const buttons = [...root.querySelectorAll(".form-footer button[type=submit]")];
  if (!buttons.length) return;
  const targets = [...(game.user.targets ?? [])];
  const selected = canvas?.ready ? canvas.tokens.controlled : [];
  const tokens = (targets.length ? targets : selected).filter(token => token.visible !== false && token.isVisible !== false
    && (!token.document.hidden || game.user.isGM));
  const status = tokens.length ? targets.length ? "TARGETS" : "SELECTED" : "NO TARGET";
  for (const button of buttons) {
    let section = button.querySelector(".sbs-roll-targets");
    if (!section) {
      section = root.ownerDocument.createElement("span");
      section.className = "sbs-roll-targets";
      button.append(section);
    }
    const caption = root.ownerDocument.createElement("strong");
    caption.textContent = status + (tokens.length ? ":" : "");
    const list = root.ownerDocument.createElement("span");
    list.className = "sbs-roll-target-list";
    const tooltip = root.ownerDocument.createElement("div");
    const heading = root.ownerDocument.createElement("strong");
    heading.textContent = status;
    tooltip.append(heading);
    for (const token of tokens) {
      const entry = root.ownerDocument.createElement("span");
      entry.className = "sbs-roll-target";
      const image = root.ownerDocument.createElement("img");
      image.src = token.document.texture.src;
      image.alt = "";
      const name = root.ownerDocument.createElement("span");
      name.textContent = token.name;
      entry.append(image, name);
      list.append(entry);
      const row = root.ownerDocument.createElement("div");
      row.append(image.cloneNode(true), name.cloneNode(true));
      tooltip.append(row);
    }
    section.replaceChildren(caption, list);
    delete section.dataset.tooltipHtml;
    targetTooltips.set(section, tooltip.outerHTML);
    section.setAttribute("aria-label", status + (tokens.length ? ": " + tokens.map(token => token.name).join(", ") : ""));
  }
  updateTargetTooltips(root);
}

export function installRollLayout() {
  const dialogs = new Set();
  const release = app => {
    const binding = bindings.get(app);
    binding?.resize.disconnect();
    binding?.mutation.disconnect();
    binding?.layout.disconnect();
    if (binding) window.removeEventListener("resize", binding.viewport);
    if (binding?.frame) cancelAnimationFrame(binding.frame);
    bindings.delete(app);
    dialogs.delete(app);
  };
  Hooks.on("closeApplicationV2", release);
  Hooks.on("renderApplicationV2", (app, root) => {
    release(app);
    if (!root.matches(".swade.roll-dialog")) return;
    root.querySelector(".form-footer [data-action=close]")?.remove();
    root.querySelector(".form-footer")?.classList.add("sbs-roll-footer");
    const content = root.querySelector(".window-content");
    let body = content.querySelector(":scope > .sbs-roll-body");
    if (!body) {
      body = root.ownerDocument.createElement("div");
      body.className = "sbs-roll-body";
      content.prepend(body);
    }
    // Forecasts and power controls may be inserted by other modules after this
    // render hook. Keep all content except the submit footer in the scroll area.
    const containBody = () => {
      for (const child of [...content.children]) {
        if (child !== body && !child.matches(".form-footer")) body.append(child);
      }
    };
    containBody();
    dialogs.add(app);
    rollTargets(root);
    const list = root.querySelector("ul.modifiers");
    if (!list) return;
    list.classList.add("sbs-scroll-modifiers");
    const binding = {frame: null};
    const measure = () => {
      binding.frame = null;
      if (!list.isConnected) return;
      updateTargetTooltips(root);
      const bounds = root.getBoundingClientRect();
      const top = Math.max(8, Math.min(bounds.top, window.innerHeight - bounds.height - 8));
      if (Math.abs(top - bounds.top) > 1) app.setPosition({top});
      const rows = [...list.querySelectorAll(":scope > .modifier-entry")].filter(row => !row.hidden);
      for (const row of rows.slice(0, 4)) binding.resize.observe(row);
      list.style.removeProperty("--sbs-modifier-row-height");
      if (rows.length > 4) {
        const rowHeight = Math.max(...rows.map(row => row.offsetHeight));
        list.style.setProperty("--sbs-modifier-row-height", rowHeight + "px");
      }
      const first = rows[0]?.getBoundingClientRect();
      const fourth = rows[3]?.getBoundingClientRect();
      const scale = root.getBoundingClientRect().width / root.offsetWidth || 1;
      const height = fourth ? Math.ceil((fourth.bottom - first.top) / scale) : 0;
      const limit = rows.length > 4 ? height + "px" : "";
      if (list.style.maxHeight !== limit) {
        list.style.maxHeight = limit;
      }
    };
    const schedule = () => {
      if (!binding.frame) binding.frame = requestAnimationFrame(measure);
    };
    binding.resize = new ResizeObserver(schedule);
    binding.resize.observe(list);
    binding.resize.observe(root);
    for (const section of root.querySelectorAll(".sbs-roll-targets")) binding.resize.observe(section);
    binding.mutation = new MutationObserver(schedule);
    binding.mutation.observe(list, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden"]});
    binding.layout = new MutationObserver(() => { containBody(); schedule(); });
    binding.layout.observe(content, {childList: true});
    binding.viewport = schedule;
    window.addEventListener("resize", schedule);
    bindings.set(app, binding);
    measure();
    schedule();
  });
  const refresh = () => {
    for (const app of dialogs) if (app.rendered) rollTargets(app.element);
  };
  for (const hook of [sbsI18n("swade-better-setting.UI.targetToken_0acd860981"), sbsI18n("swade-better-setting.UI.controlToken_93dbf3f69c"), sbsI18n("swade-better-setting.UI.updateToken_0a526b9437"), sbsI18n("swade-better-setting.UI.deleteToken_816f3e587e"), sbsI18n("swade-better-setting.UI.canvasTearDown_c4285d6f05")]) Hooks.on(hook, refresh);
}
