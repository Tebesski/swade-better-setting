export function usesTargetRows({item, context = {}, damage = false} = {}) {
  if (context.opposition || context.response) return false;
  return true;
}

export function shakeOffAction(actions = {}, strong = false) {
  const entries = Object.entries(actions).filter(([, action]) => action.type === "resist");
  const named = entries.filter(([, action]) => /shake[\s-]*off/i.test(action.name));
  const candidates = named.length ? named : entries;
  if (!candidates.length) return ["", {type: "resist", override: "vigor", modifier: strong ? "-2" : "0", dice: 1}];
  if (strong) return candidates.find(([, action]) => /strong/i.test(action.name))
    ?? (candidates.length > 1 ? [...candidates].sort((a, b) => Number(a[1].modifier ?? 0) - Number(b[1].modifier ?? 0))[0]
      : ["", {...candidates[0][1], name: undefined, modifier: Number.isFinite(Number(candidates[0][1].modifier || 0))
        ? String(Number(candidates[0][1].modifier || 0) - 2) : `(${candidates[0][1].modifier}) - 2`}]);
  return candidates.find(([, action]) => !/strong/i.test(action.name)) ?? candidates[0] ?? null;
}
