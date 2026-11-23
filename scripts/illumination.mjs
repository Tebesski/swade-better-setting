import {t} from "./i18n.mjs";
const ID = "swade-better-setting";
const levels = ["dim", "dark", "pitch"];
const defaults = [0.4, 0.8, 0.9];
const text = key => t(`${ID}.Illumination.${key}`);
export const LIGHT_FLAGS = Object.freeze(["bright-light", "dim-light", "dark-light", "pitch-dark-light"]);
export function illuminationFlags(penalty, suffersPenalty = true) {
  const flag = LIGHT_FLAGS[Math.min(3, Math.max(0, Math.abs(penalty) / 2))];
  return penalty < 0 && suffersPenalty ? [flag, `${flag}-penalty`] : [flag];
}
function visionPenalty(actor, penalty) {
  return actor?.items?.some(item => item.system.swid === "low-light-vision") && penalty >= -4 ? 0 : penalty;
}
export function darknessPenalty(darkness, thresholds = defaults) {
  for (let i = 2; i >= 0; i--) if (darkness >= thresholds[i]) return -2 * (i + 1);
  return 0;
}
export function registerIllumination() {
  game.settings.register(ID, "illuminationEnabled", {name: text("Enable"), scope: "world", config: true, type: Boolean, default: true});
  levels.forEach((level, index) => game.settings.register(ID, `illumination-${level}`, {
    name: text(level), scope: "world", config: true, type: Number, default: defaults[index], range: {min: 0, max: 1, step: 0.05}
  }));
  Hooks.on("renderSettingsConfig", (_app, html) => {
    const root = html instanceof HTMLElement ? html : html[0];
    const rows = ["illuminationEnabled", ...levels.map(level => `illumination-${level}`)].map(key =>
      root.querySelector(`[name="${ID}.${key}"]`)?.closest(".form-group")).filter(Boolean);
    if (!rows.length) return;
    const accordion = document.createElement("details"), summary = document.createElement("summary");
    summary.textContent = text("Title"); accordion.className = "sbs-illumination-settings";
    rows[0].before(accordion); accordion.append(summary, ...rows);
    const toggle = rows[0].querySelector("input");
    const refresh = () => rows.slice(1).forEach(row => row.hidden = !toggle.checked);
    toggle.addEventListener("change", refresh); refresh();
  });
}

function penaltyAt(token) {
  const document = token.document ?? token;
  const point = {...document.getCenterPoint(), elevation: document.elevation};
  const thresholds = levels.map(level => game.settings.get(ID, `illumination-${level}`)).sort((a, b) => a - b);
  let penalty = darknessPenalty(canvas.effects.getDarknessLevel(point), thresholds);
  // Ignore global illumination: its visibility switch does not make night daylight.
  const local = source => source !== canvas.environment.globalLightSource;
  if (canvas.effects.testInsideLight(point, {condition: source => local(source) && Math.hypot(point.x - source.x, point.y - source.y) <= Math.max(0, source.data.bright ?? 0)})) penalty = 0;
  else if (canvas.effects.testInsideLight(point, {condition: local})) penalty = Math.max(penalty, -2);
  for (const region of document.regions ?? []) for (const behavior of region.behaviors ?? []) {
    if (!behavior.disabled && behavior.type === "attackModifiers") {
      const index = levels.indexOf(behavior.system.illumination);
      if (index >= 0) penalty = Math.min(penalty, -2 * (index + 1));
    }
  }
  return penalty;
}

export function installIllumination() {
  // Resolve in token context, so linked copies of one actor can be in different light.
  // The hook is read-only and never writes generated flags back into the document.
  Hooks.on("swadeBetterEffectsDocumentFlags", (document, token, flags) => {
    if (!document || !globalThis.canvas?.ready) return;
    let actor;
    if (document.documentName === "Token") { token = document; actor = document.actor; }
    else if (document.documentName === "Actor") {
      actor = document;
      token ??= actor.token ?? actor.getActiveTokens?.()[0];
    } else return;
    if (!token || (token.document ?? token).parent?.id !== canvas.scene?.id) return;
    const penalty = penaltyAt(token);
    const suffers = game.settings.get(ID, "illuminationEnabled") && visionPenalty(actor, penalty) < 0;
    flags.push(...illuminationFlags(penalty, suffers));
  });
  const apply = (actor, trait, _roll, modifiers, options = {}) => {
    if (!game.settings.get(ID, "illuminationEnabled") || !canvas?.ready) return;
    const skill = typeof trait === "object" ? trait : null;
    const swid = skill?.system.swid ?? skill?.name?.toLowerCase();
    const item = typeof options.item === "string" ? actor.items.get(options.item) : options.item;
    const visual = new Set(["fighting", "shooting", "athletics", "notice", "thievery", "repair", "healing", "survival", "driving", "piloting", "boating"]);
    if (!visual.has(swid) && item?.type !== "power" && item?.type !== "weapon" && trait !== "agility") return;
    const source = actor.getActiveTokens()[0];
    if (!source) return;
    const targets = [...game.user.targets];
    let penalty = Math.min(...(targets.length ? targets : [source]).map(penaltyAt));
    const catalog = CONFIG.SWADE.rollModifiers.illumination.modifiers;
    const labels = new Set(Object.values(catalog).flatMap(mod => [mod.label, game.i18n.localize(mod.label)]));
    const existing = modifiers.filter(mod => labels.has(mod.label));
    penalty = Math.min(penalty, ...existing.map(mod => Number(mod.value)));
    penalty = visionPenalty(actor, penalty);
    for (let i = modifiers.length - 1; i >= 0; i--) if (labels.has(modifiers[i].label)) modifiers.splice(i, 1);
    if (!penalty) return;
    const level = levels[Math.min(2, Math.abs(penalty) / 2 - 1)];
    modifiers.push({...catalog[level], label: game.i18n.localize(catalog[level].label), value: penalty, ignore: false});
  };
  Hooks.on("swadePreRollSkill", apply);
  Hooks.on("swadePreRollAttribute", apply);
}
