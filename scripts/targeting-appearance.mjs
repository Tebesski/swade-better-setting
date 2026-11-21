import {t as sbsI18n} from "./i18n.mjs";
export const TARGET_ICONS = {
  get "ic_system_target_01.svg"() { return sbsI18n("swade-better-setting.UI.Target_978354db0c"); },
  get "ic_item_crosshair_01.svg"() { return sbsI18n("swade-better-setting.UI.Crosshair_8b3214b0ce"); },
  get "ic_system_docking-align-reticle.svg"() { return sbsI18n("swade-better-setting.UI.Dockingreticle_c0c5df95f1"); },
  get "ic_achievement_target-complete_01.svg"() { return sbsI18n("swade-better-setting.UI.Targetcomplete_59488824ae"); },
  get "ic_input_button-round_04.svg"() { return sbsI18n("swade-better-setting.UI.Roundtarget_7d610bb8c3"); }
};
export const ALIGNMENTS = {
  friendly: {get label() { return sbsI18n("swade-better-setting.UI.Friendly_397423500c"); }, color: "#60d878"},
  neutral: {get label() { return sbsI18n("swade-better-setting.UI.Neutral_1c6ac69f1e"); }, color: "#f5d253"},
  hostile: {get label() { return sbsI18n("swade-better-setting.UI.Hostile_b3478c03ae"); }, color: "#ed5555"},
  secret: {get label() { return sbsI18n("swade-better-setting.UI.Secret_7e32a729b1"); }, color: "#bb77ff"}
};

const crosshairFilters = new WeakMap();
let filterSequence = 0;

// Grow the original alpha once, then subtract it: an outside contour, not
// successive shadows (which also expand and blur the previous shadows).
export function updateCrosshairOutline(image, enabled, color) {
  let filter = crosshairFilters.get(image);
  if (!filter) {
    const svg = image.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg");
    const id = "sbs-crosshair-outline-" + ++filterSequence;
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none";
    svg.innerHTML = `<defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius="0.4" result="expanded"/>
      <feComposite in="expanded" in2="SourceAlpha" operator="out" result="contour"/>
      <feFlood result="color"/>
      <feComposite in="color" in2="contour" operator="in" result="outline"/>
      <feGaussianBlur in="outline" stdDeviation="0.6" result="glow"/>
      <feComponentTransfer in="glow" result="faintGlow"><feFuncA type="linear" slope="0.2"/></feComponentTransfer>
      <feMerge><feMergeNode in="faintGlow"/><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>`;
    image.before(svg);
    filter = {id, flood: svg.querySelector("feFlood")};
    crosshairFilters.set(image, filter);
  }
  filter.flood.setAttribute("flood-color", color);
  image.style.filter = enabled ? `url(#${filter.id})` : "none";
}

export function targetAlignment(token, source) {
  if (token === source || token?.document?.uuid && token.document.uuid === source?.document?.uuid
    || token?.actor?.uuid && token.actor.uuid === source?.actor?.uuid) return "friendly";
  return ({"-2": "secret", "-1": "hostile", "0": "neutral", "1": "friendly"})[token?.document?.disposition] ?? "neutral";
}

export function targetingAppearance(get, alignment = sbsI18n("swade-better-setting.UI.neutral_7e2372f411")) {
  const common = get("targetingIcon");
  const selected = get("targetingUseOne") ? common : get("targetingIcon-" + alignment);
  const color = get("targetingColor-" + alignment);
  return {icon: Object.hasOwn(TARGET_ICONS, selected) ? selected : "ic_system_target_01.svg",
    outline: get("targetingOutline-" + alignment) !== false,
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : ALIGNMENTS[alignment].color};
}

export function renderCrosshairSettings(root, moduleId) {
  const field = key => root.querySelector(`[name="${moduleId}.${key}"]`);
  const common = field("targetingIcon");
  if (!common || root.querySelector(".sbs-crosshair-options")) return;
  const doc = root.ownerDocument;
  const accordion = doc.createElement("details");
  accordion.className = "sbs-crosshair-options";
  const title = doc.createElement("summary");
  title.textContent = sbsI18n("swade-better-setting.UI.Advancedtargetingcrosshair_af46fac08e");
  accordion.append(title);
  const row = key => field(key)?.closest(".form-group");
  row("targetingUseOne").before(accordion);
  accordion.append(row("targetingUseOne"));
  accordion.append(row("targetingAnimation"));
  const commonRow = row("targetingIcon");
  accordion.append(commonRow);
  const previews = [];
  function preview(select, alignment) {
    const image = doc.createElement("img");
    image.className = "sbs-crosshair-preview";
    const box = doc.createElement("span");
    box.className = "sbs-crosshair-preview-box";
    box.append(image);
    select.after(box);
    previews.push({image, alignment});
  }
  preview(common, "neutral");
  const individual = [];
  for (const [alignment, {label}] of Object.entries(ALIGNMENTS)) {
    const group = doc.createElement("fieldset");
    const legend = doc.createElement("legend");
    legend.textContent = label;
    group.append(legend);
    const iconRow = row("targetingIcon-" + alignment);
    individual.push(iconRow);
    group.append(iconRow, row("targetingOutline-" + alignment), row("targetingColor-" + alignment));
    accordion.append(group);
    const color = field("targetingColor-" + alignment);
    color.type = "color";
    preview(field("targetingIcon-" + alignment), alignment);
  }
  const get = key => {
    const control = field(key);
    return control.type === "checkbox" ? control.checked : control.value;
  };
  const update = () => {
    const shared = get("targetingUseOne");
    commonRow.hidden = !shared;
    for (const entry of individual) entry.hidden = shared;
    for (const [alignment] of Object.entries(ALIGNMENTS)) {
      field("targetingColor-" + alignment).disabled = !get("targetingOutline-" + alignment);
    }
    for (const {image, alignment} of previews) {
      const appearance = targetingAppearance(get, alignment);
      image.src = `modules/${moduleId}/assets/${appearance.icon}`;
      image.alt = ALIGNMENTS[alignment].label + " crosshair preview";
      image.classList.toggle("has-outline", appearance.outline);
      image.style.setProperty("--target-color", appearance.color);
      updateCrosshairOutline(image, appearance.outline, appearance.color);
    }
  };
  accordion.addEventListener("change", update);
  accordion.addEventListener("input", update);
  update();
}
