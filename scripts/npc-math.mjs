export const RANKS = ["Novice", "Seasoned", "Veteran", "Heroic", "Legendary"];
export const ATTRIBUTES = ["agility", "smarts", "spirit", "strength", "vigor"];
export const ROUNDS = 4;
export const bounded = (value, min, max) => Math.min(max, Math.max(min, value));
export const MIN_CR = -2;
export function roundCR(value) {
  const step = value > 0 && value < 1 ? .5 : 1;
  return Math.max(MIN_CR, Math.round(value / step) * step) + 0;
}
export const formatCR = value => value === .5 ? "1/2" : String(value ?? "—");

export function parseCR(value) {
  const text = value.trim().replace(/^−/, "-");
  if (!text) return null;
  if (text === "½" || /^1\s*\/\s*2$/.test(text)) return .5;
  if (!/^-?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(text)) return undefined;
  const number = Number(text.replace(",", "."));
  if (!Number.isFinite(number) || number < MIN_CR || number > 9999) return undefined;
  return roundCR(number);
}
const TAIL_TOLERANCE = 1e-14;

// P(acing die >= target), including every possible continuation of an Ace.
export function aceAtLeast(sides, target) {
  target = Math.ceil(target);
  if (target <= 1) return 1;
  const full = Math.floor((target - 1) / sides);
  return (sides - (target - 1) % sides) / sides ** (full + 1);
}

export function traitAtLeast({sides, modifier = 0, wild = 0, extraCritChance = 1 / 6}, target) {
  if (sides === 1) return 0; // Tiny Strength is a fixed score and is not rolled.
  const threshold = target - modifier;
  const primary = aceAtLeast(sides, threshold);
  if (!wild) return threshold <= 1 ? primary - extraCritChance / sides : primary;
  const secondary = aceAtLeast(wild, threshold);
  const critical = threshold <= 1 ? 1 / (sides * wild) : 0;
  return primary + (1 - primary) * secondary - critical;
}

// Accept additive damage terms. A caller can substitute native SWADE roll data first.
export function parseDamage(formula) {
  const terms = String(formula ?? "").replace(/\[[^\]]*\]/g, "").toLowerCase()
    .match(/\d*d\d+x?|\d+(?:\.\d+)?|\.\d+|\S/g);
  if (!terms || terms.length > 128) return null;
  const dice = [];
  let flat = 0;
  let cursor = 0;
  function sum(sign, depth) {
    if (depth > 12) return false;
    let nextSign = sign;
    while (cursor < terms.length) {
      while (terms[cursor] === "+" || terms[cursor] === "-") {
        if (terms[cursor++] === "-") nextSign *= -1;
      }
      const term = terms[cursor++];
      if (term === "(") {
        if (!sum(nextSign, depth + 1) || terms[cursor++] !== ")") return false;
      } else if (/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(term)) {
        flat += nextSign * Number(term);
      } else {
        const die = /^(\d*)d(\d+)(x?)$/.exec(term);
        if (!die) return false;
        const count = Number(die[1] || 1), sides = Number(die[2]);
        if (count < 1 || sides < 1 || sides > 100 || dice.length + count > 12) return false;
        if (sides === 1 && !die[3]) flat += nextSign * count;
        else {
          if (nextSign < 0 || sides === 1) return false;
          for (let i = 0; i < count; i++) dice.push(sides);
        }
      }
      const operator = terms[cursor];
      if (operator !== "+" && operator !== "-") return true;
      nextSign = sign * (terms[cursor++] === "-" ? -1 : 1);
    }
    return false;
  }
  return sum(1, 0) && cursor === terms.length && Math.abs(flat) <= 200 ? {dice, flat} : null;
}

// If a sum exceeds the sum of these bounds, at least one die exceeded its bound.
// The union bound limits that tail to TAIL_TOLERANCE even for mixed dice.
function diceTail(dice) {
  return dice.reduce((sum, sides) => sum + sides * Math.ceil(Math.log(dice.length / TAIL_TOLERANCE) / Math.log(sides)), 0);
}

function sumDistribution(dice, cap) {
  // Totals at or above the cap share one bucket. This retains the full upper tail.
  let totals = new Float64Array(cap + 1);
  totals[0] = 1;
  for (const sides of dice) {
    const next = new Float64Array(cap + 1);
    for (let total = 0; total < cap; total++) {
      // A maximum face adds `sides` and leaves the same exploding die to roll again.
      let chance = total >= sides ? next[total - sides] : 0;
      for (let face = 1; face < sides && face <= total; face++) chance += totals[total - face];
      next[total] = chance / sides;
    }
    for (let base = 0; base <= cap; base++) next[cap] += totals[base] * aceAtLeast(sides, cap - base);
    totals = next;
  }
  return totals;
}

// Bins are miss/no damage, Shaken only, then one or more Wounds.
export function damageOutcomes({dice, flat}, toughness, maxWounds) {
  const cap = bounded(Math.ceil(toughness + 4 * maxWounds - flat), 0, diceTail(dice));
  const result = new Float64Array(maxWounds + 2);
  const totals = sumDistribution(dice, cap);
  for (let total = 0; total <= cap; total++) {
    const over = total + flat - toughness;
    const bin = over < 0 ? 0 : 1 + Math.min(maxWounds, Math.floor(over / 4));
    result[bin] += totals[total];
  }
  return result;
}

function attackTrait(attack, target, penalty) {
  const defense = target.attackModifiers?.[attack.mode] ?? 0;
  return {...attack.trait, modifier: (attack.trait.modifier ?? 0) + penalty + target.scale - attack.scale + defense};
}

function hitDamage(attack, target, woundCap, soak) {
  if (attack.tinyMelee && (target.scale >= -2 || target.toughness > 1)) {
    const miss = Float64Array.of(1, 0);
    return {normal: miss, raised: miss};
  }
  const toughness = target.toughness - Math.min(target.armor, attack.ap ?? 0);
  const damage = {dice: [...attack.damage.dice, ...(target.damageModifier?.dice ?? [])], flat: attack.damage.flat + (target.damageModifier?.flat ?? 0)};
  const raisedDamage = {...damage, dice: [...damage.dice, ...(attack.tinyMelee ? [] : attack.raiseDice ?? [6])]};
  const threshold = target.wounds + 1;
  // Keep distinct overkill results until their chance of being Soaked falls below the tail tolerance.
  const vigorDice = soak && target.bennies > 0 ? [target.vigor.sides, target.vigor.wild].filter(sides => sides > 1) : [];
  const soakTail = vigorDice.length ? Math.max(0, Math.ceil((diceTail(vigorDice) + (target.vigor.modifier ?? 0)) / 4)) : 0;
  const highest = Math.max(1, Math.floor((diceTail(raisedDamage.dice) + raisedDamage.flat - toughness) / 4));
  const max = woundCap || Math.min(highest, threshold + soakTail);
  return {normal: damageOutcomes(damage, toughness, max), raised: damageOutcomes(raisedDamage, toughness, max)};
}

export function strike(attack, target, penalty = 0, woundCap = 0, {soak = false} = {}) {
  if (!attack?.damage) return {hit: 0, raise: 0, outcomes: Float64Array.of(1, 0)};
  const trait = attackTrait(attack, target, penalty);
  const tn = attack.mode === "melee" ? target.parry : 4;
  const hit = traitAtLeast(trait, tn), raise = traitAtLeast(trait, tn + 4);
  const {normal, raised} = hitDamage(attack, target, woundCap, soak);
  const outcomes = normal.map((chance, i) => chance * (hit - raise) + raised[i] * raise);
  outcomes[0] += 1 - hit;
  return {hit, raise, outcomes};
}

export const STANDARD = {
  parry: 5, toughness: 6, armor: 1, scale: 0, wounds: 3, bennies: 2, hardy: false, ignored: 0,
  spirit: {sides: 6, wild: 6}, vigor: {sides: 6, wild: 6},
  attacks: ["melee", "ranged"].map(mode => ({mode, scale: 0, trait: {sides: 6, wild: 6}, damage: {dice: [6, 6], flat: 0}}))
};

export const woundPenalty = (profile, wounds) => Math.max(0, bounded(wounds - (profile.ignored ?? 0), 0, 3) - (profile.woundsOrFatigueIgnored ?? 0));

function soakOdds(profile, wounds, priorWounds) {
  const vigor = {...profile.vigor, modifier: (profile.vigor.modifier ?? 0) - woundPenalty(profile, priorWounds)};
  const chances = [1];
  for (let n = 1; n <= wounds; n++) chances.push(traitAtLeast(vigor, 4 * n));
  return chances.map((chance, n) => chance - (chances[n + 1] ?? 0));
}

export function recoveryOdds(profile, wounds = 0) {
  return traitAtLeast({...profile.spirit, modifier: (profile.spirit.modifier ?? 0) - woundPenalty(profile, wounds)}, 4);
}

const woundsFromHit = (bin, shaken, hardy) => bin === 1 && shaken && !hardy ? 1 : Math.max(0, bin - 1);
const mergeProbability = (map, key, probability) => map.set(key, (map.get(key) ?? 0) + probability);

function applyHit(states, outcomes, target) {
  const capacity = target.wounds + 1;
  const incapacitated = capacity * 2;
  const next = new Map();
  for (const [state, probability] of states) {
    if (state === incapacitated) { mergeProbability(next, state, probability); continue; }
    const shaken = state % 2 === 1, wounds = Math.floor(state / 2);
    for (let bin = 0; bin < outcomes.length; bin++) {
      if (!outcomes[bin]) continue;
      const total = wounds + woundsFromHit(bin, shaken, target.hardy);
      const key = total >= capacity ? incapacitated : total * 2 + Number(shaken || bin > 0);
      mergeProbability(next, key, probability * outcomes[bin]);
    }
  }
  return next;
}

function impact(states, target) {
  let pressure = 0;
  let wound = 0;
  for (const [state, chance] of states) {
    const wounds = Math.floor(state / 2);
    if (wounds) wound += chance;
    const delay = state % 2 ? .5 * (1 - recoveryOdds(target, wounds)) : 0;
    pressure += chance * (wounds + delay);
  }
  return {pressure, wound};
}

export function attackPressure(outcomes, target, attacks = 1) {
  let states = new Map([[0, 1]]);
  for (let action = 0; action < attacks; action++) states = applyHit(states, outcomes, target);
  return impact(states, target).pressure;
}

function dieKinds(sides, modifier, tn) {
  const one = modifier + 1 >= tn + 4 ? 2 : modifier + 1 >= tn ? 1 : 0;
  const hit = aceAtLeast(sides, tn - modifier), raise = aceAtLeast(sides, tn + 4 - modifier);
  return [1 - hit, hit - raise, raise].map((chance, kind) => ({kind, one: 0, chance: Math.max(0, chance - (one === kind ? 1 / sides : 0))}))
    .concat({kind: one, one: 1, chance: 1 / sides}).filter(kind => kind.chance > 0);
}

export function volleyOdds({sides, modifier = 0, wild = 0, extraCritChance = 1 / 6}, tn, shots) {
  if (sides === 1) return [{hits: 0, raises: 0, chance: 1}]; // Fixed Tiny Strength is not rolled.
  const outcomes = dieKinds(sides, modifier, tn);
  let pool = new Map([["0,0,0", 1]]);
  for (let shot = 0; shot < shots; shot++) {
    const next = new Map();
    for (const [key, mass] of pool) {
      const [hit, raise, ones] = key.split(",").map(Number);
      for (const die of outcomes) mergeProbability(next, `${hit + Number(die.kind === 1)},${raise + Number(die.kind === 2)},${ones + die.one}`, mass * die.chance);
    }
    pool = next;
  }
  const result = new Map();
  const wildOutcomes = wild ? dieKinds(wild, modifier, tn) : [{kind: 0, one: 0, chance: 1}];
  for (const [key, mass] of pool) {
    for (const die of wildOutcomes) {
      let [hit, raise, ones] = key.split(",").map(Number);
      const critical = wild ? Number(die.one && (ones + 1) * 2 > shots + 1) : ones * 2 > shots ? extraCritChance : 0;
      const chance = mass * die.chance;
      if (critical) mergeProbability(result, "0,0", chance * critical);
      if (critical === 1) continue;
      // The Wild Die replaces the lowest Shooting result only if it improves it.
      if (hit + raise < shots) { hit += Number(die.kind === 1); raise += Number(die.kind === 2); }
      else if (hit && die.kind === 2) { hit--; raise++; }
      mergeProbability(result, `${hit},${raise}`, chance * (1 - critical));
    }
  }
  return [...result].map(([key, chance]) => {
    const [hits, raises] = key.split(",").map(Number);
    return {hits, raises, chance};
  });
}

export function attackRating(attack, target, penalty = 0, woundCap = 0) {
  if (!(attack.shots > 1)) {
    const {hit, raise, outcomes} = strike(attack, target, penalty, woundCap);
    const states = applyHit(new Map([[0, 1]]), outcomes, target);
    const {pressure, wound} = impact(states, target);
    return {hit, raise, wound, pressure};
  }
  const trait = attackTrait(attack, target, penalty - (attack.recoil ? 2 : 0));
  const volleys = volleyOdds(trait, 4, attack.shots);
  const {normal, raised} = hitDamage(attack, target, woundCap, false);
  const states = new Map();
  for (const volley of volleys) {
    let branch = new Map([[0, 1]]);
    for (let hit = 0; hit < volley.hits; hit++) branch = applyHit(branch, normal, target);
    for (let raise = 0; raise < volley.raises; raise++) branch = applyHit(branch, raised, target);
    for (const [state, chance] of branch) mergeProbability(states, state, chance * volley.chance);
  }
  return {...impact(states, target), hit: volleys.reduce((p, row) => p + (row.hits || row.raises ? row.chance : 0), 0),
    raise: volleys.reduce((p, row) => p + (row.raises ? row.chance : 0), 0)};
}

function turnOptions(profile, opponent, woundCap) {
  const pools = new Map();
  for (const attack of profile.attacks) {
    if (attack.resource) pools.set(attack.resource.key, attack.resource.capacity);
  }
  const indices = new Map([...pools.keys()].map((key, i) => [key, i]));
  const initial = [...pools.values()].join(",");
  const cache = new Map();
  const ratings = new Map();

  function get(wounds, budget) {
    const key = `${wounds}/${budget}`;
    if (cache.has(key)) return cache.get(key);
    const remaining = budget ? budget.split(",").map(Number) : [];
    let best = {pressure: 0, hit: 0, cost: 0, pool: undefined};
    for (const [i, attack] of profile.attacks.entries()) {
      const pool = indices.get(attack.resource?.key);
      const cost = attack.resource?.cost ?? 0;
      if (pool !== undefined && remaining[pool] < cost) continue;
      const ratingKey = `${i}/${wounds}`;
      if (!ratings.has(ratingKey)) {
        const penalty = -woundPenalty(profile, wounds);
        let rating = attackRating(attack, opponent, penalty, woundCap);
        if (attack.shots > 1) {
          const single = attackRating({...attack, shots: 1}, opponent, penalty, woundCap);
          if (single.pressure > rating.pressure) rating = single;
        }
        ratings.set(ratingKey, rating);
      }
      const {pressure, hit} = ratings.get(ratingKey);
      if (pressure > best.pressure || (pressure === best.pressure && cost < best.cost)) best = {pressure, hit, cost, pool};
    }
    const {pressure, hit, cost, pool} = best;
    let budgets = [[budget, 1]];
    if (pool !== undefined) {
      const next = remaining.slice();
      next[pool] -= cost;
      const success = next.join(",");
      next[pool] = remaining[pool] - Math.min(1, cost);
      budgets = [[success, hit], [next.join(","), 1 - hit]];
    }
    const result = {pressure, budgets};
    cache.set(key, result);
    return result;
  }
  return {initial, get};
}

export function combatEstimate(profile, {woundCap = 0, opponent = STANDARD} = {}) {
  const incoming = opponent.attacks.map(attack => strike(attack, profile, 0, woundCap, {soak: true}).outcomes);
  const turnsByBudget = turnOptions(profile, opponent, woundCap);
  const soaks = new Map();
  const maxBennies = bounded(profile.bennies, 0, ROUNDS);
  let states = new Map([[turnsByBudget.initial, new Map([[maxBennies * 2, 1]])]]);
  let turns = 0, output = 0;
  const key = (wounds, bennies, shaken) => (wounds * (maxBennies + 1) + bennies) * 2 + Number(shaken);
  for (let round = 0; round < ROUNDS; round++) {
    const next = new Map();
    const addState = (budget, state, chance) => {
      if (!chance) return;
      if (!next.has(budget)) next.set(budget, new Map());
      mergeProbability(next.get(budget), state, chance);
    };
    const add = (budget, wounds, bennies, shaken, chance) => {
      if (!chance || wounds > profile.wounds) return;
      const canAct = shaken ? recoveryOdds(profile, wounds) : 1;
      const acting = chance * canAct;
      addState(budget, key(wounds, bennies, shaken), chance - acting);
      if (acting) {
        const turn = turnsByBudget.get(wounds, budget);
        turns += acting;
        output += acting * turn.pressure;
        for (const [newBudget, probability] of turn.budgets) addState(newBudget, key(wounds, bennies, false), acting * probability);
      }
    };
    for (const [budget, group] of states) for (const [state, chance] of group) {
      const shaken = state % 2 === 1;
      const pair = (state - Number(shaken)) / 2;
      const wounds = Math.floor(pair / (maxBennies + 1)), bennies = pair % (maxBennies + 1);
      for (const outcomes of incoming) for (let bin = 0; bin < outcomes.length; bin++) {
        const probability = chance * outcomes[bin] / incoming.length;
        if (!probability) continue;
        const suffered = woundsFromHit(bin, shaken, profile.hardy);
        if (suffered && bennies) {
          const soakKey = suffered * (profile.wounds + 1) + wounds;
          if (!soaks.has(soakKey)) soaks.set(soakKey, soakOdds(profile, suffered, wounds));
          soaks.get(soakKey).forEach((p, soaked) => {
            add(budget, wounds + suffered - soaked, bennies - 1, soaked < suffered, probability * p);
          });
        } else add(budget, wounds + suffered, bennies, shaken || bin > 0, probability);
      }
    }
    states = next;
  }
  const score = output + (profile.attacks.length ? .1 * turns : 0);
  const survival = [...states.values()].reduce((sum, group) => sum + [...group.values()].reduce((subtotal, chance) => subtotal + chance, 0), 0);
  return {score, turns, output, survival};
}

export function referencePC(rank) {
  const skill = {sides: [6, 8, 10, 12, 12][rank], modifier: Number(rank === 4), wild: 6};
  const vigor = {sides: [6, 8, 8, 10, 10][rank], wild: 6};
  const spirit = {sides: [6, 6, 8, 8, 10][rank], wild: 6};
  const armor = [1, 1, 2, 2, 3][rank];
  const damage = [[6, 6], [6, 8], [8, 8], [8, 10], [10, 10]][rank];
  return {...STANDARD, parry: 2 + skill.sides / 2, toughness: 2 + vigor.sides / 2 + armor,
    armor, vigor, spirit, attacks: STANDARD.attacks.map(attack => ({...attack, trait: skill,
      damage: {dice: damage, flat: 0}, ap: rank === 4 ? 1 : 0}))};
}

const referenceOpponents = [0, 2, 4].map(referencePC);
function combatBenchmark(profile, woundCap) {
  const results = referenceOpponents.map(opponent => combatEstimate(profile, {woundCap, opponent}));
  const mean = key => results.reduce((sum, result) => sum + result[key], 0) / results.length;
  return {score: mean("score"), turns: mean("turns"), output: mean("output"), survival: mean("survival")};
}

const baselines = new Map();
function advancementCurve(woundCap) {
  if (!baselines.has(woundCap)) {
    const scores = RANKS.map((_, rank) => combatBenchmark(referencePC(rank), woundCap).score);
    const novice = scores[0];
    baselines.set(woundCap, {novice, strengths: scores.map(score => score / novice)});
  }
  return baselines.get(woundCap);
}

// Interpolate between measured combat strengths. Continue the last
// interval beyond Legendary so manual CR and high-advance PCs stay comparable.
export function advancementStrength(advances, woundCap = 0) {
  // Below Novice, each CR step halves the strength of the reference combatant.
  if (advances < 0) return 2 ** Math.max(MIN_CR, advances);
  const {strengths} = advancementCurve(woundCap);
  const step = advances / 4;
  const i = Math.min(Math.floor(step), strengths.length - 2);
  return strengths[i] + (strengths[i + 1] - strengths[i]) * (step - i);
}

export function creatureRating(profile, woundCap = 0) {
  const estimate = combatBenchmark(profile, woundCap);
  const {novice, strengths} = advancementCurve(woundCap);
  const strength = estimate.score / novice;
  const upper = strengths.findIndex(anchor => anchor > strength);
  const i = upper === -1 ? strengths.length - 2 : Math.max(0, upper - 1);
  const rawCR = strength <= 1 ? Math.log2(Math.max(2 ** MIN_CR, strength)) : 4 * (i + (strength - strengths[i]) / (strengths[i + 1] - strengths[i]));
  return {...estimate, cr: roundCR(rawCR), rawCR, strength};
}

export function encounterThreat(enemies, party) {
  if (!(enemies > 0)) return {label: "None", threat: 0, partyWin: party > 0 ? 1 : null};
  if (!(party > 0)) return {label: "Add the party to initiative", threat: null};
  const ratio = enemies / party;
  const threat = 1 / (1 + (1 / ratio) ** 2);
  const label = threat < .2 ? "Low" : threat < .4 ? "Moderate" : threat < .6 ? "High" : threat < .8 ? "Severe" : "Extreme";
  return {label, threat, partyWin: 1 - threat};
}
