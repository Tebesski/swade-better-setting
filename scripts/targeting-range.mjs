import {t as sbsI18n} from "./i18n.mjs";
const ATTRIBUTES = {
  agi: "agility", agility: "agility", sma: "smarts", sm: "smarts", smarts: "smarts",
  spi: "spirit", spirit: "spirit", str: "strength", strength: "strength", vig: "vigor", vigor: "vigor"
};

// Range formulas are deterministic. Dice, functions and executable expressions are excluded.
export function rangeNumber(text, values = {}) {
  const input = String(text).trim().replace(/[×]/g, "*")
    .replace(/\bx(?=\s*(?:\d|@|\())/gi, "*").replace(/(\d|\))\s*x\s*(?=\d|@|\()/gi, "$1*");
  const tokens = input.match(/@?[a-z_][\w.]*|(?:\d+(?:\.\d+)?|\.\d+)|[()+*/-]|\S/gi) ?? [];
  if (!tokens.length || tokens.length > 64) return null;
  let cursor = 0;
  function primary(depth) {
    if (depth > 12) throw new Error(sbsI18n("swade-better-setting.UI.Rangeexpressiontoodeep_587ea9697d"));
    const token = tokens[cursor++];
    if (token === "+") return primary(depth + 1);
    if (token === "-") return -primary(depth + 1);
    if (token === "(") {
      const result = sum(depth + 1);
      if (tokens[cursor++] !== ")") throw new Error(sbsI18n("swade-better-setting.UI.Invalidrange_37ef0f0cb3"));
      return result;
    }
    if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token ?? "")) return Number(token);
    const key = token?.replace(/^@/, "").toLowerCase();
    const value = values[key];
    if (!Number.isFinite(value)) throw new Error(sbsI18n("swade-better-setting.UI.Unknownrangevalue_4c867e4f5c"));
    return value;
  }
  function product(depth) {
    let value = primary(depth);
    while (["*", "/"].includes(tokens[cursor])) {
      const operation = tokens[cursor++];
      const operand = primary(depth);
      value = operation === "*" ? value * operand : value / operand;
    }
    return value;
  }
  function sum(depth) {
    let value = product(depth);
    while (["+", "-"].includes(tokens[cursor])) {
      const operation = tokens[cursor++];
      const operand = product(depth);
      value += operation === "+" ? operand : -operand;
    }
    return value;
  }
  try {
    const result = sum(0);
    return cursor === tokens.length && Number.isFinite(result) && result > 0 ? result : null;
  } catch { return null; }
}

export function rangeValues(actor, labels = {}) {
  const values = {};
  function numericData(data, prefix = "", depth = 0) {
    if (!data || typeof data !== "object" || depth > 4) return;
    for (const [key, value] of Object.entries(data)) {
      const path = prefix + key;
      if (Number.isFinite(value)) values[path.toLowerCase()] = value;
      else if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) values[path.toLowerCase()] = Number(value);
      else if (value && typeof value === "object") numericData(value, path + ".", depth + 1);
    }
  }
  numericData(actor?.getRollData?.(false));
  for (const [alias, attribute] of Object.entries(ATTRIBUTES)) {
    const die = actor?.system?.attributes?.[attribute]?.die;
    if (die) values[alias] = Math.min(die.sides, 12) + (Number(die.modifier) || 0) + Math.max(0, (die.sides - 12) / 2);
  }
  for (const [attribute, label] of Object.entries(labels)) {
    if (values[attribute] && /^[a-z_][\w.]*$/i.test(label)) values[label.toLowerCase()] = values[attribute];
  }
  return values;
}

export function parseTargetRange(text, values = {}) {
  const clean = String(text ?? "").trim().replace(/[″"]/g, "").replace(/\s*(?:inches|inch|in\.)\s*$/i, "").trim();
  if (!clean) return null;
  // Slash-separated ascending numbers are the familiar short/medium/long range notation.
  const parts = clean.split("/");
  if (parts.length >= 2 && parts.length <= 4) {
    const increments = parts.map(part => rangeNumber(part, values));
    if (increments.every((value, index) => value !== null && (!index || value >= increments[index - 1]))) return increments;
  }
  const value = rangeNumber(clean, values);
  return value === null ? null : [value];
}

export function rangeBand(distance, increments) {
  if (!Number.isFinite(distance) || !increments?.length) return "";
  const index = increments.findIndex(value => distance <= value);
  return index === 0 ? "short" : index === 1 && increments.length > 2 ? "medium" : "long";
}
