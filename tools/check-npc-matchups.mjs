// Reproducible external check on the encounter heuristic. Only the reference stat
// blocks and predictions come from the calculator. All combat rolls are sampled here.
import {creatureRating, encounterThreat, referencePC} from "../scripts/npc-math.mjs";
import {forecastEncounter} from "../scripts/encounter-forecast.mjs";

const trials = 20000;
let seed = 54179;
function random() {
  seed = seed * 48271 % 2147483647;
  return seed / 2147483647;
}

function ace(sides) {
  let sum = 0, face;
  do {
    face = 1 + Math.floor(random() * sides);
    sum += face;
  } while (face === sides);
  return sum;
}

function trait(die, wounds) {
  const result = Math.max(ace(die.sides), die.wild ? ace(die.wild) : 0);
  return result === 1 ? 0 : result + (die.modifier ?? 0) - Math.min(3, wounds);
}

function act(attacker, defender) {
  if (attacker.shaken && trait(attacker.profile.spirit, attacker.wounds) < 4) return;
  attacker.shaken = false;
  const attack = attacker.profile.attacks[0]; // These fixtures all use one melee attack.
  const hit = trait(attack.trait, attacker.wounds) - defender.profile.parry;
  if (hit < 0) return;
  const damage = attack.damage.dice.reduce((sum, sides) => sum + ace(sides), attack.damage.flat) + (hit >= 4 ? ace(6) : 0);
  const margin = damage - defender.profile.toughness + Math.min(attack.ap ?? 0, defender.profile.armor);
  if (margin < 0) return;
  let wounds = Math.floor(margin / 4);
  if (!wounds && defender.shaken && !defender.profile.hardy) wounds = 1;
  defender.shaken = true;
  if (wounds && defender.bennies > 0) {
    defender.bennies--;
    wounds = Math.max(0, wounds - Math.max(0, Math.floor(trait(defender.profile.vigor, defender.wounds) / 4)));
    defender.shaken = wounds > 0;
  }
  defender.wounds += wounds;
}

function fight(party, foes) {
  const spawn = (profile, side) => ({profile, side, wounds: 0, bennies: profile.bennies, shaken: false});
  const units = [...party.map(p => spawn(p, 0)), ...foes.map(p => spawn(p, 1))];
  const active = unit => unit.wounds <= unit.profile.wounds;
  for (let round = 0; round < 100; round++) {
    const order = units.filter(active);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const unit of order) {
      if (!active(unit)) continue;
      const target = units.find(other => other.side !== unit.side && active(other));
      if (!target) return unit.side;
      act(unit, target);
    }
  }
  return [0, 1].find(side => !units.some(unit => unit.side !== side && active(unit))) ?? -1;
}

const novice = referencePC(0), seasoned = referencePC(1), veteran = referencePC(2);
const extra = {...novice, wounds: 0, bennies: 0, vigor: {sides: 6}, spirit: {sides: 6},
  attacks: novice.attacks.map(attack => ({...attack, trait: {sides: 6}}))};
const budget = side => side.reduce((sum, profile) => sum + creatureRating(profile).strength, 0);
for (const [scenario, party, foes] of [
  ["Novice vs Novice", [novice], [novice]], ["Seasoned vs Novice", [seasoned], [novice]],
  ["Novice vs Veteran", [novice], [veteran]], ["Novice vs two Extras", [novice], [extra, extra]],
  ["Novice vs four Extras", [novice], Array(4).fill(extra)]
]) {
  const estimate = encounterThreat(budget(foes), budget(party)).partyWin;
  // The independent exercise below is melee only. Give the tracker the same available actions.
  const fixtures = [party, foes].map(side => side.map(profile => ({profile: {...profile, attacks: [profile.attacks[0]]}})));
  const forecast = forecastEncounter(fixtures);
  let wins = 0, draws = 0;
  for (let i = 0; i < trials; i++) {
    const result = fight(party, foes);
    if (result === 0) wins++;
    if (result === -1) draws++;
  }
  console.log(`${scenario}: CR budget ${(100 * estimate).toFixed(1)}%, tracker ${(100 * forecast.wins / forecast.trials).toFixed(1)}%, independent ${(100 * wins / trials).toFixed(1)}%, ${draws} draws / ${trials}`);
}
