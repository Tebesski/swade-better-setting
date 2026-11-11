const dieTypes = [4, 6, 8, 10, 12];
const dieToken = /\[[^\]]*\]|@[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*|(?<![\p{L}\p{N}_@.])(\d*)d(\d+)(?![\d.])([a-z][a-z\d<>=]*)?(\s*\[[^\]]*\])?/giu;

function diceFormula(source) {
  const formula = String(source ?? "");
  const dice = [];
  for (const match of formula.matchAll(dieToken)) {
    const [term, count, faces, modifiers = "", flavor = ""] = match;
    if (faces === undefined) continue;
    const start = match.index;
    const end = start + term.length;
    const before = formula.slice(0, start).trimEnd().at(-1);
    const after = formula.slice(end).trimStart()[0];
    // Preserve the precedence of a die under subtraction, multiplication, or division.
    const groupBonus = (before && !"+({,".includes(before)) || (after && !"+-)},]".includes(after));
    dice.push({start, end, term, count, faces: Number(faces), modifiers, flavor, flat: 0, groupBonus});
  }
  return {formula, dice};
}

function increaseDice({dice}, {steps, flatOverflow}) {
  if (!steps) return;
  for (const die of dice) {
    const index = dieTypes.indexOf(die.faces);
    if (index < 0) continue;
    const next = index + steps;
    const last = dieTypes.length - 1;
    if (index !== last) {
      die.faces = dieTypes[Math.min(next, last)];
      die.changed = true;
    }
    if (flatOverflow && next > last) die.flat += (next - last) * Number(die.count || 1);
  }
}

function renderDice({formula, dice}) {
  let result = "";
  let cursor = 0;
  for (const die of dice) {
    const term = die.changed ? `${die.count}d${die.faces}${die.modifiers}${die.flavor}` : die.term;
    const adjusted = die.flat ? `${term}+${die.flat}` : term;
    result += formula.slice(cursor, die.start) + (die.flat && die.groupBonus ? `(${adjusted})` : adjusted);
    cursor = die.end;
  }
  return result + formula.slice(cursor);
}

export const damageState = base => ({base: diceFormula(base), bonuses: [], allUpgrades: [], adjustments: []});
const combineDamage = (base, bonuses) => bonuses.reduce((formula, bonus) => `(${formula}) + (${bonus})`, base);
const renderDamage = state => combineDamage(renderDice(state.base), state.bonuses.map(renderDice));

export function damagePlan(state) {
  const base = renderDice(state.base);
  const bonuses = state.bonuses.map(renderDice);
  return {base, bonuses, formula: combineDamage(base, bonuses), adjustments: state.adjustments};
}

export function applyDamageAdjustment(state, change, source, readAmount) {
  const {formula, legacyCount, steps, scope, flatOverflow} = change.system;
  const add = change.type === "addDamageDice";
  const all = !add && scope === "all";
  const display = () => add || all ? renderDamage(state) : renderDice(state.base);
  const before = display();

  if (add && formula?.trim()) {
    const bonus = diceFormula(formula.trim());
    for (const upgrade of state.allUpgrades) increaseDice(bonus, upgrade);
    state.bonuses.push(bonus);
  } else if (add) {
    const die = state.base.dice[0];
    const count = readAmount(legacyCount, 100);
    if (die && count) {
      die.count = String(Number(die.count || 1) + count);
      die.changed = true;
    }
  } else {
    const upgrade = {steps: readAmount(steps, flatOverflow ? Number.MAX_SAFE_INTEGER : dieTypes.length - 1), flatOverflow};
    increaseDice(state.base, upgrade);
    if (all && upgrade.steps) {
      state.allUpgrades.push(upgrade);
      for (const bonus of state.bonuses) increaseDice(bonus, upgrade);
    }
  }

  const after = display();
  if (before !== after) state.adjustments.push({source, label: change.label || (add ? "Add Damage Dice" : "Increase Die Type"), before, after});
}
