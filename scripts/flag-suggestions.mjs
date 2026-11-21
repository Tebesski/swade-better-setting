import {slug} from "./skills.mjs";

const MAX_SUGGESTIONS = 20;
let nextListId = 0;

export function flagSuggestions(value, flags, {multiple = false, normalize = slug} = {}) {
  const separator = multiple ? value.lastIndexOf(",") : -1;
  const current = value.slice(separator + 1);
  const prefix = value.slice(0, separator + 1) + current.match(/^\s*/)[0];
  const selected = new Set(separator < 0 ? [] : value.slice(0, separator).split(",").map(normalize));
  const query = normalize(current);
  const starts = [];
  const contains = [];
  for (const flag of flags) {
    if (selected.has(flag)) continue;
    if (flag.startsWith(query)) {
      starts.push(flag);
      if (starts.length === MAX_SUGGESTIONS) break;
    } else if (contains.length < MAX_SUGGESTIONS && flag.includes(query)) contains.push(flag);
  }
  return [...starts, ...contains.slice(0, MAX_SUGGESTIONS - starts.length)]
    .map(flag => ({label: flag, value: `${prefix}${flag}`}));
}

export function bindFlagSuggestions(input, getFlags, options) {
  if (input.disabled || input.list) return;
  const list = input.ownerDocument.createElement("datalist");
  list.id = `sbs-flag-options-${++nextListId}`;
  input.after(list);
  input.setAttribute("list", list.id);
  input.autocomplete = "off";
  let shown = [];
  const refresh = () => {
    const matches = flagSuggestions(input.value, getFlags(), options);
    if (matches.length === shown.length && matches.every(({value}, index) => shown[index].value === value)) return;
    shown = matches;
    list.replaceChildren(...matches.map(({label, value}) => {
      const option = list.ownerDocument.createElement("option");
      option.value = value;
      if (label !== value) option.label = label;
      return option;
    }));
  };
  input.addEventListener("focus", refresh);
  input.addEventListener("compositionend", refresh);
  input.addEventListener("input", event => { if (!event.isComposing) refresh(); });
  if (input === input.ownerDocument.activeElement) refresh();
}
