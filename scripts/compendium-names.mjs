import {t as sbsI18n} from "./i18n.mjs";
import {normalizeName} from "./skills.mjs";

export async function resolveCompendiumName(name, rows, noun, {exclude, classes = []} = {}) {
  const others = rows.filter(row => row.id !== exclude);
  const taken = candidate => others.find(row => normalizeName(row.name) === normalizeName(candidate));
  const existing = taken(name);
  if (!existing) return {name};
  const base = name.replace(/ \(\d+\)$/, "");
  let number = 1;
  while (taken(`${base} (${number})`)) number++;
  const copy = `${base} (${number})`;
  const prompt = document.createElement("p");
  prompt.textContent = sbsI18n("swade-better-setting.UI.alreadyexistsReplaceitorsave_194e393945", {p0: (name), p1: (copy)});
  const action = await foundry.applications.api.DialogV2.wait({
    classes: ["sbs-compendium-dialog", ...classes], window: {title: sbsI18n("swade-better-setting.UI.Save_9ee47a0dfe", {p0: (noun)})}, content: prompt.outerHTML, rejectClose: false,
    buttons: [{action: "replace", label: sbsI18n("swade-better-setting.UI.Replace_95e154398a")}, {action: "copy", label: sbsI18n("swade-better-setting.UI.SaveCopy_ffe7d40232")}, {action: "cancel", label: sbsI18n("swade-better-setting.UI.Cancel_19766ed6cc")}]
  });
  if (action === "replace") return {name, replace: existing};
  if (action === "copy") return {name: copy};
}
