const flag = (source, flag) => ({op: "flag", source, flag});
const any = (...children) => ({op: "any", children});
const change = (key, value, predicate, type = "add") => ({key, value: String(value), predicate, type});
const global = (name, value, predicate) => change("system.stats.globalMods." + name, value, predicate);
const trait = (name, value) => change("system.attributes." + name + ".die.modifier", value, flag("roll", name));
const skill = (name, value) => change("@Skill{" + name + "}[system.die.modifier]", value, flag("roll", name.toLowerCase()));
const note = (key, value, predicate) => change("sbe.rollNote." + encodeURIComponent("system.stats.globalMods." + key), "<p>" + value + "</p>", predicate, "override");
const resist = (value, predicate) => change("sbe.resistance", value, predicate, "subtract");
const weakness = (value, predicate) => change("sbe.weakness", value, predicate);
const incoming = (...types) => types.length === 1 ? flag("roll", types[0]) : any(...types.map(type => flag("roll", type)));
const target = (...types) => types.length === 1 ? flag("target", types[0]) : any(...types.map(type => flag("target", type)));

export const effects = {
  "fleetfoot": {
    name: "Fleetfoot", icon: "wingfoot", duration: [5, "rounds"], tags: ["elixir", "movement"],
    text: "+2 ground Pace and +1 to the running roll for five rounds. Other movement modes are unchanged.",
    changes: [change("system.pace.ground", 2), change("system.pace.running.mod", 1)]
  },
  "bastion": {
    name: "Ironbark Mantle", icon: "shield", duration: [5, "rounds"], tags: ["elixir", "protective"],
    text: "+2 Toughness from hardened skin for five rounds. This bonus is not Armor.",
    changes: [change("system.stats.toughness.value", 2)]
  },
  "nightglass": {
    name: "Nightglass Eyes", icon: "eye", duration: [10, "minutes"], tags: ["elixir", "nightglass"],
    text: "+2 to Notice rolls for ten minutes. Concealment and Illumination are adjudicated separately.",
    changes: [skill("Notice", 2), note("trait", "Reflective eyes catch the faintest movement. Apply normal concealment and illumination rules.", flag("roll", "notice"))]
  },
  "galehand": {
    name: "Galehand", icon: "wing", duration: [5, "rounds"], tags: ["elixir", "movement"],
    text: "+2 to Athletics rolls for five rounds.",
    changes: [skill("Athletics", 2)]
  },
  "stillwater": {
    name: "Stillwater Resolve", icon: "aura", duration: [10, "minutes"], tags: ["elixir", "resolve"],
    text: "+2 to Spirit rolls and +1 to Intimidation for ten minutes. This does not remove conditions.",
    changes: [trait("spirit", 2), skill("Intimidation", 1)]
  },
  "siltlung": {
    name: "Siltlung", icon: "waterfall", duration: [10, "minutes"], tags: ["elixir", "water-breathing"],
    text: "Can breathe underwater for ten minutes. Base Swim Pace is set to at least 4 before penalties.",
    changes: [change("system.pace.swim", 4, undefined, "upgrade")]
  },
  "witchsalt": {
    name: "Witchsalt Aegis", icon: "mage-shield", duration: [5, "rounds"], tags: ["elixir", "ward"],
    text: "Reduce incoming damage tagged power or magic by 4 for five rounds. A roll with both tags is reduced once.",
    changes: [resist(4, incoming("power", "magic"))]
  },
  "rimefire": {
    name: "Rimefire Ward", icon: "ice-shield", duration: [10, "minutes"], tags: ["elixir", "elemental-ward"],
    text: "Reduce incoming fire or cold damage by 4 for ten minutes. A roll with both tags is reduced once.",
    changes: [resist(4, incoming("fire", "cold"))]
  },
  "stormskin": {
    name: "Stormskin", icon: "lightning", duration: [5, "rounds"], tags: ["elixir", "elemental-ward"],
    text: "Reduce lightning damage by 5 for five rounds, but take 2 extra damage from attacks tagged acid.",
    changes: [resist(5, incoming("lightning")), weakness(2, incoming("acid"))]
  },
  "sunward": {
    name: "Sunward", icon: "sun", duration: [5, "rounds"], tags: ["elixir", "sunward"],
    text: "Gain +1 to attack rolls against undead and reduce incoming necrotic damage by 3 for five rounds.",
    changes: [global("attack", 1, target("undead")), resist(3, incoming("necrotic"))]
  },
  "sablevein": {
    name: "Sablevein Poisoning", icon: "poison", tags: ["poison", "sablevein"], family: "catalog-poison",
    text: "At the end of each turn roll Vigor TN 4. One success clears the poison. Failure offers 1d6 acing poison damage. Critical failure offers 1d6+2.",
    lingering: {timing: "end", trait: "vigor", tn: 4, required: 1,
      fail: {damage: "1d6x"}, critical: {damage: "1d6x+2"}}
  },
  "mirror-pollen": {
    name: "Mirror Pollen Delirium", icon: "blind", tags: ["poison", "mirror-pollen"], family: "catalog-poison",
    text: "At the start of each turn roll Smarts TN 4. Two successes clear the poison, or one raise. On a failure apply Double Vision for one round.",
    lingering: {timing: "start", trait: "smarts", tn: 4, required: 2,
      fail: {effect: "double-vision"}, raise: {progress: 2}}
  },
  "glass-rot": {
    name: "Glass Rot", icon: "acid", tags: ["poison", "glass-rot"], family: "catalog-poison",
    text: "At the end of each turn roll Vigor TN 4. Two successes clear Glass Rot, or one raise. Failure offers 1d6+1 acing poison damage. Critical failure also applies Fracture Shock.",
    lingering: {timing: "end", trait: "vigor", tn: 4, required: 2,
      fail: {damage: "1d6x+1"}, critical: {damage: "1d6x+1", effect: "fracture-shock"}, raise: {progress: 2}}
  },
  "double-vision": {
    name: "Double Vision", icon: "blind", duration: [1, "rounds"], expiry: "turnEnd", tags: ["poison", "double-vision"],
    family: "catalog-poison", text: "Distracted until the end-of-turn expiry.",
    statuses: ["distracted"]
  },
  "fracture-shock": {
    name: "Fracture Shock", icon: "daze", duration: [1, "rounds"], expiry: "turnEnd", tags: ["poison", "fracture-shock"],
    family: "catalog-poison", text: "Vulnerable until the effect expires at the end of the next turn.",
    statuses: ["vulnerable"]
  },
  "grave-silver": {
    name: "Grave-Silver Finish", icon: "holy-shield", family: "catalog-coating", tags: ["coating", "silver"],
    text: "Coated weapon deals +2 damage against targets flagged undead or lycanthrope.",
    changes: [global("damage", 2, target("undead", "lycanthrope")), note("damage", "Grave-silver bites against the undead and lycanthropes.", target("undead", "lycanthrope"))]
  },
  "cinder-lacquer": {
    name: "Cinder Lacquer Finish", icon: "fire", family: "catalog-coating", tags: ["coating", "cinder"],
    text: "The coated weapon deals +2 damage against targets flagged plant, swarm, or cold-creature. It retains its original damage flags.",
    changes: [global("damage", 2, target("plant", "swarm", "cold-creature"))]
  },
  "rift-oil": {
    name: "Rift Oil Finish", icon: "aura", family: "catalog-coating", tags: ["coating", "rift"],
    text: "Coated weapon gains +3 Armor Piercing against targets flagged construct or elemental.",
    changes: [global("ap", 3, target("construct", "elemental"))]
  },
  "duskshot": {
    name: "Duskshot Finish", icon: "eye", family: "catalog-coating", tags: ["coating", "duskshot"],
    text: "Coated weapon gains +1 to ranged attacks. It has no effect on melee attacks.",
    changes: [global("attack", 1, flag("roll", "ranged"))]
  },
  "ward-breaker": {
    name: "Wardbreaker Finish", icon: "lightning", family: "catalog-coating", tags: ["coating", "wardbreaker"],
    text: "Coated weapon deals +2 damage against targets flagged ward or arcane-ward.",
    changes: [global("damage", 2, target("ward", "arcane-ward"))]
  }
};
