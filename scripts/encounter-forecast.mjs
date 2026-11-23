import {attackRating, attackTrait, hitChances, hitDamage, traitAtLeast, volleyOdds, woundPenalty, woundsFromHit} from "./npc-math.mjs";

// All randomness is local to the forecast. An unchanged roster gives a stable estimate.
const TRIALS = 2048;
const ROUND_LIMIT = 100;
export const MAX_FORECAST_COMBATANTS = 32;

function shuffle(array, random) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function roundOrder(alive, grouped, random) {
  const order = [...alive[0], ...alive[1]];
  if (!grouped) {
    shuffle(order, random);
    return order;
  }
  const blocks = new Map();
  for (const unit of order) {
    const key = unit.group ?? unit;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key).push(unit);
  }
  const turns = [...blocks.values()];
  shuffle(turns, random);
  return turns.flat();
}

function sampleBin(odds, random) {
  let draw = random();
  for (let bin = 0; bin < odds.length - 1; bin++) {
    draw -= odds[bin];
    if (draw < 0) return bin;
  }
  return odds.length - 1;
}

function takeHit(target, distribution, random) {
  const bin = sampleBin(distribution, random);
  if (!bin) return;
  let wounds = woundsFromHit(bin, target.shaken, target.profile.hardy);
  target.shaken = true;
  if (wounds && target.bennies > 0) {
    target.bennies--;
    const vigor = target.profile.vigor;
    const die = {...vigor, modifier: (vigor.modifier ?? 0) - woundPenalty(target.profile, target.wounds, target.fatigue)};
    const draw = random();
    let soaked = 0;
    while (soaked < wounds && draw < traitAtLeast(die, 4 * (soaked + 1))) soaked++;
    wounds -= soaked;
    target.shaken = wounds > 0;
  }
  target.wounds += wounds;
}

function attackChoices(profile, target, cap) {
  const options = profile.attacks.flatMap(attack => attack.shots > 1 ? [attack, {...attack, shots: 1}] : [attack]);
  const damage = new Map();
  const byPenalty = new Map();
  return penalty => {
    if (byPenalty.has(penalty)) return byPenalty.get(penalty);
    const choices = [];
    for (const attack of options) {
      const {pressure} = attackRating(attack, target, -penalty, cap);
      if (!(pressure > 0)) continue;
      if (!damage.has(attack)) damage.set(attack, hitDamage(attack, target, cap, true));
      const {normal, raised} = damage.get(attack);
      const chance = hitChances(attack, target, -penalty);
      let volleys, volleyMass;
      if (attack.shots > 1) {
        const trait = attackTrait(attack, target, -penalty - (attack.recoil ? 2 : 0));
        volleys = volleyOdds(trait, 4, attack.shots);
        volleyMass = volleys.map(v => v.chance);
      }
      choices.push({pressure, resource: attack.resource, normal, raised, chance, volleys, volleyMass});
    }
    choices.sort((a, b) => b.pressure - a.pressure || (a.resource?.cost ?? 0) - (b.resource?.cost ?? 0));
    byPenalty.set(penalty, choices);
    return choices;
  };
}

function attackTarget(attacker, target, choice, random) {
  let hits = 0, raises = 0;
  if (choice.volleys) {
    ({hits, raises} = choice.volleys[sampleBin(choice.volleyMass, random)]);
  } else {
    // Activation, hit and raise all come from the same roll.
    const draw = random();
    const {resource, chance} = choice;
    if (resource) attacker.pools[resource.key] -= draw < chance.activation ? resource.cost : Math.min(1, resource.cost);
    if (draw < chance.raise) raises = 1;
    else if (draw < chance.hit) hits = 1;
  }
  for (let i = 0; i < hits + raises && target.wounds <= target.profile.wounds; i++) {
    takeHit(target, i < hits ? choice.normal : choice.raised, random);
  }
}

export function forecastEncounter(sides, cap = 0, {trials = TRIALS, seed = 32003} = {}) {
  const random = () => (seed = seed * 48271 % 2147483647) / 2147483647;
  const profiles = new Map();
  const units = sides.flatMap((entries, side) => entries.map(entry => {
    const signature = JSON.stringify(entry.profile);
    if (!profiles.has(signature)) profiles.set(signature, profiles.size);
    const pools = Object.fromEntries(entry.profile.attacks.filter(a => a.resource)
      .map(({resource}) => [resource.key, resource.capacity]));
    return {id: profiles.get(signature), side, group: entry.group, profile: entry.profile, wounds: entry.wounds ?? 0,
      shaken: !!entry.shaken, fatigue: entry.fatigue ?? 0, bennies: entry.bennies ?? entry.profile.bennies,
      pools: {...pools, ...entry.pools}};
  }));
  const grouped = units.some(unit => unit.group != null);
  const matches = new Map();
  function choose(attacker, defender, malus) {
    const key = attacker.id * profiles.size + defender.id;
    if (!matches.has(key)) matches.set(key, attackChoices(attacker.profile, defender.profile, cap));
    return matches.get(key)(malus).find(({resource}) => !resource || attacker.pools[resource.key] >= resource.cost);
  }

  function fight() {
    const roster = units.map(unit => ({...unit, pools: {...unit.pools}}));
    shuffle(roster, random); // Pick initial focus independently of tracker display order.
    const alive = sides.map((_, side) => roster.filter(unit => unit.side === side && unit.wounds <= unit.profile.wounds));
    for (let round = 0; round < ROUND_LIMIT && alive[0].length && alive[1].length; round++) {
      const order = roundOrder(alive, grouped, random);
      let canContinue = false;
      for (const unit of order) {
        if (unit.wounds > unit.profile.wounds) continue;
        const malus = woundPenalty(unit.profile, unit.wounds, unit.fatigue);
        if (unit.shaken) {
          const spirit = unit.profile.spirit;
          canContinue = true;
          if (random() >= traitAtLeast({...spirit, modifier: (spirit.modifier ?? 0) - malus}, 4)) continue;
          unit.shaken = false;
        }
        const opponents = alive[1 - unit.side];
        for (const [index, target] of opponents.entries()) {
          const choice = choose(unit, target, malus);
          if (!choice) continue;
          canContinue = true;
          attackTarget(unit, target, choice, random);
          if (target.wounds > target.profile.wounds) opponents.splice(index, 1);
          break;
        }
        if (!opponents.length) return unit.side;
      }
      if (!canContinue) break;
    }
    if (alive[0].length && !alive[1].length) return 0;
    if (alive[1].length && !alive[0].length) return 1;
    return -1;
  }

  let wins = 0, unresolved = 0;
  for (let i = 0; i < trials; i++) {
    const side = fight();
    if (side === 0) wins++;
    if (side === -1) unresolved++;
  }
  return {wins, unresolved, trials};
}
