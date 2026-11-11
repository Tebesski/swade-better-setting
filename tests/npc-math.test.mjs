import assert from "node:assert/strict";
import {test} from "node:test";
import {STANDARD, aceAtLeast, advancementStrength, attackPressure, attackRating, combatEstimate, creatureRating, damageOutcomes, encounterThreat, parseDamage, recoveryOdds, referencePC, strike, traitAtLeast, volleyOdds, woundPenalty} from "../scripts/npc-math.mjs";
import {BETTER_POWERS, addCastingEntry, compileCasting} from "../scripts/npc-casting.mjs";
import {damageBenchmarks, makePreset, managedTags, npcRank, npcSource, sizeStrength} from "../scripts/npc-data.mjs";
import {setMagazineField} from "../scripts/npc-attack.mjs";
import {powerCandidates} from "../scripts/npc-powers.mjs";

const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-9, `${value} != ${expected}`);

test("aces use the full tail and Wild Cards keep the higher die with critical failures", () => {
  close(aceAtLeast(6, 6), 1 / 6);
  close(aceAtLeast(6, 7), 1 / 6);
  close(aceAtLeast(6, 12), 1 / 36);
  close(aceAtLeast(6, 14), 5 / 216);
  close(traitAtLeast({sides: 6}, 4), .5);
  close(traitAtLeast({sides: 6, wild: 6}, 4), .75);
  close(traitAtLeast({sides: 6, wild: 6, modifier: 9}, 4), 35 / 36);
  close(traitAtLeast({sides: 4, wild: 6, modifier: -2}, 4), 31 / 96);
});

test("damage bins preserve probability, use AP only against Armor, and add the raise die once", () => {
  assert.deepEqual(parseDamage("1d8x[Strength] + d6 + 2 - 1"), {dice: [8, 6], flat: 1});
  assert.equal(parseDamage("1d8 * 2"), null);
  const bins = damageOutcomes({dice: [6], flat: 0}, 4, 2);
  [1 / 2, 13 / 36, 4 / 36, 1 / 36].forEach((p, i) => close(bins[i], p));
  const attack = {...STANDARD.attacks[0], ap: 8};
  const raised = strike(attack, STANDARD, 0, 4);
  const noRaiseDie = strike({...attack, raiseDice: []}, STANDARD, 0, 4);
  assert.ok(raised.outcomes[0] < noRaiseDie.outcomes[0]);
  assert.deepEqual(strike({...attack, ap: 1}, STANDARD, 0, 4).outcomes, raised.outcomes);
  close(raised.outcomes.reduce((sum, p) => sum + p), 1);
  assert.equal(raised.outcomes.length, 6);
});

test("combat estimates distinguish Extras, resilient creatures, Wild Cards, and noncombat specialists", () => {
  const extra = {...structuredClone(STANDARD), wounds: 0, bennies: 0, spirit: {sides: 6}, vigor: {sides: 6},
    attacks: STANDARD.attacks.map(attack => ({...attack, trait: {sides: 6}}))};
  const base = creatureRating(extra);
  assert.equal(base.cr, 0);
  assert.ok(base.strength > 0 && base.strength < 1);
  assert.ok(creatureRating({...extra, wounds: 1}).strength > base.strength);
  assert.ok(creatureRating({...extra, hardy: true}).survival > base.survival);
  assert.ok(combatEstimate({...STANDARD, bennies: 0}).survival < combatEstimate(STANDARD).survival);
  assert.equal(creatureRating({...STANDARD, attacks: []}).strength, 0);
});

test("the reference rank anchors and encounter budgets share the Advancement scale", () => {
  for (const cap of [0, 4]) {
    for (const rank of [0, 1, 2, 3, 4]) {
      const rating = creatureRating(referencePC(rank), cap);
      close(rating.rawCR, rank * 4);
      close(rating.strength, advancementStrength(rank * 4, cap));
    }
    for (let advances = 1; advances <= 24; advances++) {
      assert.ok(advancementStrength(advances, cap) > advancementStrength(advances - 1, cap));
    }
    assert.ok(Number.isFinite(advancementStrength(9999, cap)));
  }
  assert.equal(encounterThreat(0, 0).threat, null);
  assert.equal(encounterThreat(0, 1).partyWin, 1);
  assert.deepEqual(encounterThreat(2, 2), {label: "High", threat: .5, partyWin: .5});
  close(encounterThreat(2, 1).partyWin, .2);
  close(encounterThreat(1, 2).partyWin, .8);
});

test("rank presets preserve specialization and source data retains native defenses and rank flags", () => {
  const novice = makePreset("caster", "Novice");
  const legendary = makePreset("caster", "Legendary", "Faith");
  assert.equal(novice.skills.Spellcasting.sides, 6);
  assert.deepEqual(legendary.skills.Faith, {sides: 12, modifier: 1});
  assert.equal(legendary.trait, "Faith");
  assert.ok(legendary.attributes.strength.sides < legendary.attributes.smarts.sides);
  const soldier = makePreset("soldier", "Novice");
  const wildSoldier = makePreset("soldier", "Novice", undefined, undefined, true);
  const seasoned = makePreset("soldier", "Seasoned");
  assert.ok(seasoned.skills.Notice.sides > soldier.skills.Notice.sides);
  assert.ok(wildSoldier.skills.Athletics.sides > soldier.skills.Athletics.sides);
  assert.ok(wildSoldier.attributes.agility.sides > soldier.attributes.agility.sides);
  assert.equal(soldier.damage, wildSoldier.damage);
  assert.deepEqual(managedTags(["novice", "wildcard", "undead"], "Veteran", false, "defender"), ["defender", "extra", "undead", "veteran"]);
  const draft = {...makePreset("beast", "Heroic"), name: "Hound", rank: "Heroic", role: "beast", size: 4,
    wildcard: false, resilience: 1, tags: "demon", cr: 0, disposition: -1};
  const actor = npcSource(draft, [], {prototypeToken: {}}, () => "id");
  assert.equal(npcRank(actor), "Heroic");
  assert.equal(actor.system.wounds.max, 2);
  assert.equal(actor.system.attributes.smarts.animal, true);
  assert.equal(actor.prototypeToken.width, 2);
  assert.equal(actor.flags["swade-better-setting"].npc.cr, 0);
  assert.ok(actor.flags["swade-better-effects"].tags.includes("demon"));
});

test("size changes Strength suggestions and Tiny natural damage follows the creature limit", () => {
  assert.deepEqual(sizeStrength(8, {sides: 8, modifier: 0}), {sides: 12, modifier: 5});
  assert.deepEqual(sizeStrength(-2, {sides: 12, modifier: 1}), {sides: 4, modifier: -1});
  assert.deepEqual(parseDamage("1d1[Strength]"), {dice: [], flat: 1});
  const attack = {...STANDARD.attacks[0], scale: -6, tinyMelee: true, damage: {dice: [], flat: 1}};
  assert.equal(strike(attack, STANDARD).outcomes[0], 1);
  assert.ok(strike(attack, {...STANDARD, scale: -4, toughness: 1, armor: 0}).outcomes[1] > 0);
});

test("attack benchmarks progress with rank and keep native melee Strength and Tiny damage", () => {
  assert.deepEqual(damageBenchmarks("Novice", "ranged").map(row => row.formula), ["1d4+1d6", "2d6", "1d6+1d8"]);
  assert.deepEqual(damageBenchmarks("Legendary", "melee").map(row => row.formula), ["@str+1d8+1", "@str+1d10", "@str+1d12"]);
  assert.deepEqual(damageBenchmarks("Veteran", "melee", -4).map(row => row.formula), ["1"]);
  assert.deepEqual(damageBenchmarks("Novice", "none"), []);
  assert.equal(makePreset("marksman", "Heroic").damage, damageBenchmarks("Heroic", "ranged")[1].formula);
});

test("a custom archetype controls starting dice, skill progression, and native attack defaults", () => {
  const archetype = {label: "Trail guard", focus: "Notice", focusDie: 2, mode: "ranged",
    attributes: [2, 0, 0, 0, 0], attributeGrowth: {agility: "fixed"}, skills: {Tracking: 1},
    skillGrowth: {tracking: "rank"}, attack: {name: "Longbow", damage: "2d8", trait: "Shooting", ap: 2}, size: 1};
  const draft = makePreset("custom", "Veteran", undefined, undefined, false, archetype);
  assert.equal(draft.attributes.agility.sides, 10);
  assert.equal(draft.skills.Notice.sides, 12);
  assert.equal(draft.skills.Tracking.sides, 10);
  assert.equal(draft.attackName, "Longbow");
  assert.equal(draft.ap, 2);
  assert.equal(draft.damage, "2d8");
  const melee = makePreset("custom", "Veteran", undefined, "melee", false, archetype);
  assert.equal(melee.trait, "Fighting");
  assert.match(melee.damage, /^@str/);
});

test("magazine edits preserve partial loads and signature options use the native item schema", () => {
  const ranged = {reloadType: "magazine", ammo: "Lead rounds"};
  setMagazineField(ranged, "shots", 6);
  assert.equal(ranged.currentShots, 6);
  setMagazineField(ranged, "currentShots", 4);
  setMagazineField(ranged, "shots", 8);
  assert.equal(ranged.currentShots, 4);
  setMagazineField(ranged, "shots", 3);
  assert.equal(ranged.currentShots, 3);
  const draft = {...makePreset("marksman", "Seasoned"), name: "Guard", role: "marksman", rank: "Seasoned", signatureId: "attack",
    tags: "watch", signatureTags: "Silver, silver, Anti tank",
    signatureOptions: {ranged, weapon: {isHeavyWeapon: true}, shared: {actions: {dmgMod: "1"}, bonusDamageDie: 8}}};
  const source = npcSource(draft, [], {prototypeToken: {}}, () => "id");
  const attack = source.items.find(item => item._id === "attack");
  assert.deepEqual(attack.flags["swade-better-effects"].tags, ["silver", "anti-tank"]);
  assert.ok(!source.flags["swade-better-effects"].tags.includes("silver"));
  assert.deepEqual(attack.system.actions, {dmgMod: "1", trait: "Shooting"});
  assert.equal(attack.system.bonusDamageDie, 8);
  assert.equal(attack.system.isHeavyWeapon, true);
  assert.equal(attack.system.currentShots, 3);
  assert.equal(attack.system.reloadType, "magazine");
});

// Enumerate the face sequences independently of the analytic tail and the production convolution.
function enumerateDie(sides, cap) {
  const totals = new Map();
  function roll(previous, mass) {
    for (let face = 1; face <= sides; face++) {
      const total = Math.min(previous + face, cap);
      const chance = mass / sides;
      if (total < cap && face === sides) roll(total, chance);
      else totals.set(total, (totals.get(total) ?? 0) + chance);
    }
  }
  roll(0, 1);
  return totals;
}

test("analytic Trait odds agree with explicit face enumeration across dice, modifiers, and target numbers", () => {
  for (const sides of [4, 6, 8, 10, 12]) for (const wild of [0, 4, 6, 8, 12]) {
    for (const modifier of [-20, -3, 0, 2, 5, 10]) for (const tn of [0, 1, 4, 6, 8, 12, 18, 30]) {
      const limit = Math.max(2, tn - modifier);
      const primary = enumerateDie(sides, limit);
      const secondary = wild ? enumerateDie(wild, limit) : new Map([[0, 1]]);
      for (const extraCritChance of [1 / 6, 1]) {
        let success = 0;
        for (const [a, pa] of primary) for (const [b, pb] of secondary) {
          if (Math.max(a, b) + modifier < tn) continue;
          const critical = a === 1 ? wild ? Number(b === 1) : extraCritChance : 0;
          success += pa * pb * (1 - critical);
        }
        close(traitAtLeast({sides, wild, modifier, extraCritChance}, tn), success);
      }
    }
  }
});

test("damage bins agree with face enumeration for mixed dice, fractions, and extreme Toughness", () => {
  assert.deepEqual(parseDamage("(1d8x[Strength] - 1 + 1d6) + (2.25 - 1)"), {dice: [8, 6], flat: .25});
  assert.deepEqual(parseDamage("d6 + -2 - (-3 + .5)"), {dice: [6], flat: .5});
  for (const malformed of ["d6 4", "d6 - (d4 + 1)", "d6*2", "d6 +", "d6 + (2", "1d1x", "()", "d6r1"]) {
    assert.equal(parseDamage(malformed), null, malformed);
  }
  for (const [dice, flat, toughness, maxWounds] of [
    [[4, 6, 8], -1.75, 6.5, 5], [[4, 4], 2, 0, 4], [[12, 10], 30, 96, 6], [[], -.25, -1, 2]
  ]) {
    const cap = Math.max(2, Math.ceil(toughness + 4 * maxWounds - flat));
    const expected = Array(maxWounds + 2).fill(0);
    const rolls = dice.map(sides => enumerateDie(sides, cap));
    function tally(index, sum, chance) {
      if (index < rolls.length) {
        for (const [result, mass] of rolls[index]) tally(index + 1, sum + result, chance * mass);
      } else {
        const excess = sum + flat - toughness;
        expected[excess < 0 ? 0 : 1 + Math.min(maxWounds, Math.floor(excess / 4))] += chance;
      }
    }
    tally(0, 0, 1);
    damageOutcomes({dice, flat}, toughness, maxWounds).forEach((chance, bin) => close(chance, expected[bin]));
    close(expected.reduce((sum, p) => sum + p), 1);
  }
  const attack = {mode: "melee", scale: 0, trait: {sides: 6, modifier: 10, extraCritChance: 0}, damage: {dice: [], flat: 4}, raiseDice: []};
  assert.equal(strike(attack, {...STANDARD, toughness: 0, armor: 0}).outcomes[2], 1);
  assert.equal(strike({...attack, damage: {dice: [], flat: 85}}, {...STANDARD, toughness: 90, armor: 0}).outcomes[0], 1);
});

test("multi-action pressure carries Shaken forward and stops on incapacitation", () => {
  const target = {...STANDARD, wounds: 0, spirit: {sides: 6}};
  close(attackPressure([0, 1], target, 1), .25);
  close(attackPressure([0, 1], target, 2), 1);
  close(attackPressure([0, 1], {...target, hardy: true}, 3), .25);
  close(attackPressure([0, 0, 1], STANDARD, 3), 3 + .5 * (1 - recoveryOdds(STANDARD, 3)));
  close(attackPressure([0, 0, 0, 0, 0, 1], STANDARD, 3), 4);
  close(attackPressure([.5, .5], target, 2), .5 * .25 + .25);
});

test("rapid fire matches independent face enumeration with a single replacing Wild Die", () => {
  assert.deepEqual(volleyOdds({sides: 1, wild: 6}, 4, 3), [{hits: 0, raises: 0, chance: 1}]);
  for (const shots of [1, 2, 3, 6]) for (const wild of [0, 6]) for (const modifier of shots === 6 ? [5] : [-2, 0, 5]) {
    const tn = 4;
    const cap = Math.max(2, tn + 4 - modifier);
    const expected = new Map();
    const traitFaces = enumerateDie(4, cap), wildFaces = wild ? enumerateDie(wild, cap) : [[0, 1]];
    const accumulate = (faces, p) => {
      if (faces.length < shots) {
        for (const [face, mass] of traitFaces) accumulate([...faces, face], p * mass);
        return;
      }
      for (const [face, mass] of wildFaces) {
        const ones = faces.filter(value => value === 1).length;
        const critical = wild ? face === 1 && ones + 1 > (shots + 1) / 2 : ones > shots / 2;
        const rolls = critical ? [] : wild ? [...faces, face].sort((a, b) => b - a).slice(0, shots) : faces;
        const raises = rolls.filter(value => value + modifier >= tn + 4).length;
        const hits = rolls.filter(value => value + modifier >= tn).length - raises;
        const key = `${hits},${raises}`;
        expected.set(key, (expected.get(key) ?? 0) + p * mass);
      }
    };
    accumulate([], 1);
    const result = volleyOdds({sides: 4, wild, modifier, extraCritChance: 1}, tn, shots);
    close(result.reduce((sum, row) => sum + row.chance, 0), 1);
    for (const row of result) {
      const key = `${row.hits},${row.raises}`;
      close(row.chance, expected.get(key) ?? 0);
      expected.delete(key);
    }
    assert.ok([...expected.values()].every(p => p < 1e-9));
  }
});

test("legacy target counts do not multiply pressure and rapid fire considers a single shot", () => {
  const sword = {...STANDARD.attacks[0], trait: {sides: 12, wild: 6}, damage: {dice: [8, 8], flat: 0}};
  const blast = {...STANDARD.attacks[1], mode: "power", trait: {sides: 4, modifier: -3}, damage: {dice: [4], flat: 0}};
  const one = attackRating(blast, STANDARD);
  const legacy = attackRating({...blast, targets: 3}, STANDARD);
  assert.deepEqual(legacy, one);
  close(creatureRating({...STANDARD, attacks: [sword, {...blast, targets: 3}]}).strength,
    creatureRating({...STANDARD, attacks: [sword]}).strength);
  const volley = {...STANDARD.attacks[1], shots: 3};
  assert.ok(attackRating({...volley, recoil: true}, STANDARD).hit < attackRating(volley, STANDARD).hit);
  assert.ok(creatureRating({...STANDARD, attacks: [{...volley, recoil: true}]}).strength >=
    creatureRating({...STANDARD, attacks: [{...volley, shots: 1}]}).strength);
});

test("Power Points carry between turns with separate pools and failure costs while legacy limits are ignored", () => {
  const attack = {mode: "power", scale: 0, trait: {sides: 6, modifier: 20, extraCritChance: 0}, damage: {dice: [], flat: 10}, raiseDice: []};
  const opponent = {...STANDARD, wounds: 0, attacks: [{...attack, damage: {dice: [], flat: 0}}]};
  const estimate = (attacks, actions = 1) => combatEstimate({...STANDARD, attacks, actions}, {opponent}).output;
  const spell = {...attack, resource: {key: "faith", capacity: 2, cost: 2}};
  close(estimate([attack]), 4);
  close(estimate([{...attack, encounterUses: 1}], 3), 4);
  close(estimate([spell, {...spell}]), 1);
  close(estimate([spell, {...spell, resource: {...spell.resource, key: "focus"}}]), 2);
  close(estimate([{...spell, trait: {sides: 6}, resource: {...spell.resource, capacity: 3}}]), .75);
  close(estimate([{...spell, actionCost: 2}], 1), 1);
});

test("compiled casting assigns the native arcane name, trait, and pool separately for each power", () => {
  let index = 0;
  const id = () => String(++index);
  const spellcasting = {};
  const faith = addCastingEntry(spellcasting, id, {name: "Miracles", trait: "Faith", points: 7});
  faith.rule = "no-pp";
  const magic = addCastingEntry(spellcasting, id, {name: "Magic", trait: "Spellcasting", points: 12});
  const items = [
    {_id: "bolt", type: "power", system: {arcane: "Old", pp: 2, actions: {trait: "Focus", dmgMod: "1"}}},
    {_id: "blast", type: "power", system: {arcane: "Science", pp: 11, actions: {trait: "Weird Science"}}},
    {_id: "heal", type: "power", system: {arcane: "", pp: 3, actions: {trait: "Faith"}}}
  ];
  const draft = {...makePreset("caster", "Novice"), name: "Caster", rank: "Novice", role: "caster",
    spellcasting, signatureEntry: magic.id, powerEntries: {bolt: faith.id}, wildcard: true, resilience: 2,
    defenses: {scale: -2}, effects: [{_id: "effect", name: "Ward"}]};
  const actor = npcSource(draft, items, {prototypeToken: {}}, id);
  assert.deepEqual(actor.system.powerPoints, {general: {value: 10, max: 10}, Miracles: {value: 7, max: 7},
    Magic: {value: 12, max: 12}, Science: {value: 11, max: 11}});
  assert.equal(actor.flags[BETTER_POWERS].spellcastingEntries[faith.id].noPowerPoints, true);
  assert.equal(actor.items[0].system.arcane, "Miracles");
  assert.deepEqual(actor.items[0].system.actions, {trait: "Faith", dmgMod: "1"});
  assert.equal(actor.items[2].system.arcane, "");
  assert.equal(actor.items.find(item => item.name === draft.attackName).system.arcane, "Magic");
  assert.equal(actor.system.wounds.max, 5);
  assert.deepEqual(actor.flags["swade-better-setting"].npc.defenses, {scale: -2});
  assert.equal(actor.effects[0].name, "Ward");
  assert.equal(items[0].system.arcane, "Old");
  assert.equal(compileCasting({}, [{...items[0], system: {arcane: "Unsupported.Name"}}], id).flags.general.name, "General");
});

test("power generation respects rank, themes, cost and powers already on the actor", () => {
  const power = (name, rank, pp) => ({name, system: {rank, pp}});
  const healing = power("Healing", "Novice", 3);
  const relief = power("Relief", "Novice", 1);
  const items = [healing, relief, {...relief}, power("Resurrection", "Veteran", 6), power("Blast", "Seasoned", 3)];
  assert.deepEqual(powerCandidates(items, {rank: "Novice", theme: "restoration", existing: [healing], canCast: cost => cost <= 1}), [relief]);
  assert.deepEqual(powerCandidates(items, {rank: "Seasoned", theme: "random", existing: [], canCast: () => true}), [healing, relief, items[4]]);
});

test("Exploration selects travel and scouting utility by purpose without selecting damaging powers", () => {
  const power = (name, system, flags) => ({name, system: {rank: "Novice", pp: 2, ...system}, flags});
  const burst = power("Burst", {trapping: "A flash of light"});
  const lightning = power("Lightning Storm", {damage: "2d6"});
  const light = power("Light/Darkness", {trapping: "Shadows and fireflies"});
  const burrow = power("Burrow", {});
  const assault = power("Scout's Volley", {damage: "2d6"}, {"swade-better-effects": {tags: ["exploration"]}});
  const compass = power("Compass of the Deep", {}, {"swade-better-effects": {tags: ["navigation"]}});
  const items = [burst, lightning, light, burrow, assault, compass];
  assert.deepEqual(powerCandidates(items, {rank: "Novice", theme: "exploration", existing: [], canCast: () => true}), [light, burrow, compass]);
});

test("four-exchange defense matches hand calculations for second Shaken, Hardy, and complete Soak", () => {
  const extra = {...STANDARD, armor: 0, toughness: 4, wounds: 0, bennies: 0, attacks: [], spirit: {sides: 6}, vigor: {sides: 6}};
  const attack = {mode: "melee", scale: 0, trait: {sides: 6, modifier: 20, extraCritChance: 0}, damage: {dice: [], flat: 4}, raiseDice: []};
  const foe = damage => ({...STANDARD, attacks: [{...attack, damage: {dice: [], flat: damage}}]});
  const shaken = combatEstimate(extra, {opponent: foe(4)});
  close(shaken.survival, 1 / 8);
  close(shaken.turns, 15 / 16);
  const hardy = combatEstimate({...extra, hardy: true}, {opponent: foe(4)});
  close(hardy.survival, 1);
  close(hardy.turns, 2);
  const soaked = combatEstimate({...extra, bennies: 1}, {opponent: foe(12)});
  close(soaked.survival, 0);
  close(soaked.turns, 5 / 36);
  assert.equal(woundPenalty({ignored: 1}, 4), 3);
  assert.equal(woundPenalty({ignored: 2, woundsOrFatigueIgnored: 1}, 5), 2);
  assert.equal(woundPenalty({ignored: 2}, 1), 0);
});
