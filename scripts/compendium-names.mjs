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
  prompt.textContent = `“${name}” already exists. Replace it or save a copy as “${copy}”?`;
  const action = await foundry.applications.api.DialogV2.wait({
    classes: ["sbs-compendium-dialog", ...classes], window: {title: `Save ${noun}`}, content: prompt.outerHTML, rejectClose: false,
    buttons: [{action: "replace", label: "Replace"}, {action: "copy", label: "Save Copy"}, {action: "cancel", label: "Cancel"}]
  });
  if (action === "replace") return {name, replace: existing};
  if (action === "copy") return {name: copy};
}
