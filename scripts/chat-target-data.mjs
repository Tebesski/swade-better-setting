export function usesTargetRows({item, context = {}, damage = false} = {}) {
  if (damage || context.rollType === "damage" || context.opposition || context.response) return false;
  if ((context.rollKinds ?? context.roll ?? []).includes("attack")) return false;
  if (item?.type === "weapon") return false;
  if (item?.type === "power" && String(item.system?.damage ?? "").trim()) return false;
  return true;
}

export function shakeOffAction(actions = {}, strong = false) {
  const entries = Object.entries(actions).filter(([, action]) => action.type === "resist");
  const named = entries.filter(([, action]) => /shake[\s-]*off/i.test(action.name));
  const candidates = named.length ? named : entries;
  if (strong) return candidates.find(([, action]) => /strong/i.test(action.name))
    ?? (candidates.length > 1 ? [...candidates].sort((a, b) => Number(a[1].modifier ?? 0) - Number(b[1].modifier ?? 0))[0] : null);
  return candidates.find(([, action]) => !/strong/i.test(action.name)) ?? candidates[0] ?? null;
}
