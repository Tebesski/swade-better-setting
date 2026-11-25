import {wrapMethod} from "./integrations.mjs";

export function installDefeatedAppearance() {
  const incapacitated = CONFIG.statusEffects.find(effect => effect.id === "incapacitated");
  const defeatedId = CONFIG.specialStatusEffects.DEFEATED;
  const defeated = CONFIG.statusEffects.find(effect => effect.id === defeatedId);
  if (defeated && incapacitated) defeated.img = incapacitated.img;
  wrapMethod(CONFIG.ActiveEffect.documentClass.prototype, "prepareDerivedData", function (original, ...args) {
    const result = original(...args);
    if (this.statuses.has("incapacitated") || this.statuses.has(defeatedId)) {
      this.showIcon = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER;
      if (this.statuses.has(defeatedId) && incapacitated) this.img = incapacitated.img;
    }
    return result;
  });
}

const pending = new WeakMap();
async function setShaken(actor, active) {
  const document = actor.token ?? actor;
  const task = (pending.get(document) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const current = actor.token?.actor ?? actor;
    if (current.statuses.has("shaken") !== active) await current.toggleActiveEffect("shaken", {active});
  });
  pending.set(document, task);
  try { await task; } finally { if (pending.get(document) === task) pending.delete(document); }
}

export async function installStatusCompatibility() {
  if (!game.modules.get("swade-tools")?.active) return;
  const path = foundry.utils.getRoute("modules/swade-tools/");
  const moduleBase = game.modules.get("swade-better-effects")?.active
    ? await (await import("../../swade-better-effects/scripts/module-imports.mjs")).moduleScriptBase("swade-tools")
    : new URL(path, window.location.href);
  const base = new URL("scripts/class/", moduleBase);
  const [{default: Char}, {default: RollControl}] = await Promise.all([
    import(new URL("Char.js", base).href), import(new URL("RollControl.js", base).href)
  ]);
  for (const [method, active] of [["on", true], ["off", false]]) {
    wrapMethod(Char.prototype, method, function (original, status) {
      if (status !== "isShaken") return original(status);
      // Tools' status helper treats synthetic Actors as Token objects, losing
      // their ActiveEffects when a character token is unlinked.
      const actor = this.getActor();
      if (!actor?.isOwner) return;
      return setShaken(actor, active);
    });
  }
  wrapMethod(RollControl.prototype, "unshaken", async function (original, ...args) {
    const result = await original(...args);
    const entity = this.getActor(true);
    const actor = entity?.documentName === "Token" ? entity.actor : entity;
    if (actor?.isOwner && actor.statuses.has("shaken") && !this.roll?.isCritfail && this.roll.total + (Number(this.gmmod) || 0) >= 4) {
      await setShaken(actor, false);
    }
    return result;
  });
}
