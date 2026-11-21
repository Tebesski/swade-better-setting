import {t as sbsI18n} from "./i18n.mjs";
export function isSelfRange(range, localized = sbsI18n("swade-better-setting.UI.Self_85bc0f9585")) {
  const value = String(range ?? "").trim().toLocaleLowerCase();
  return value === String(localized).trim().toLocaleLowerCase() || /^self(?:\s*\([^)]*\))?$/i.test(value);
}

export function includeSelfTarget(source, targets, setTargets) {
  if (!source) return false;
  const ids = new Set(Array.from(targets ?? [], token => token.id));
  if (!ids.has(source.id)) { ids.add(source.id); setTargets([...ids]); }
  return true;
}
