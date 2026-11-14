import {isPrimaryGM} from "./library.mjs";
import {normalizeName, slug} from "./skills.mjs";

const PACK_NAME = "better-setting-actions";
const PACK_ID = "world." + PACK_NAME;
const MODULE_ID = "swade-better-setting";
const rules = (chapter, page, label) =>
  `@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.${chapter}.JournalEntryPage.${page}]{${label}}`;
const falling = rules("swadecor04theadv", "04falling0000000", "Falling");
const drowning = rules("swadecor04theadv", "04drowning000000", "Drowning");
const evasion = rules("swadecor03rules0", "03evasion0000000", "Evasion");
const chases = rules("swadecor04theadv", "04chasesandveh00", "Chases and Vehicles");

function action(name, trait, description, {modifier = "", alternatives = {}, kind} = {}) {
  return {
    name, type: "action", img: "systems/swade/assets/icons/action.svg",
    system: {swid: slug(name), description: `<p>${description}</p>`,
      actions: {trait, traitMod: modifier, additional: alternatives}},
    flags: {[MODULE_ID]: {basicAction: slug(name), actionKind: kind ?? slug(name)}}
  };
}

const trait = (name, override = "", modifier = "") => ({name, type: "trait", override, modifier});
const maneuvers = [
  ["Board", "Oppose the other pilot or driver from the same Chase Card. Success joins the vessels for boarding. Check the boarding rules for Hold and escape from restraints."],
  ["Change Position", "Move up to one Chase Card on a success or two with a raise. Once per turn. Taking it as an action adds +2. Enter any speed bonus in the roll dialog.", {
    asAction: trait("Change Position as an action", "", "2"),
    faster: trait("Free action · faster than rivals", "", "1"),
    twiceAsFast: trait("Free action · twice as fast", "", "2"),
  }],
  ["Flee", "Escape on a success. You need at least four intervening Chase Cards. Apply −4 for four cards, −2 for five, or no penalty for six or more.",
    {fourCards: trait("Four intervening cards", "", "-4"), fiveCards: trait("Five intervening cards", "", "-2")}],
  ["Force", "Oppose a rival on the same Chase Card. A success Bumps the rival, a raise triggers a maneuvering mishap, and a critical failure backfires."],
  ["Ram", "Oppose a rival on the same Chase Card. On a win, resolve collision damage for both sides using Scale, relative Toughness, speed, and any attacker raise."],
  ["Handle Complications", "When the Action Card is a Club, make a free maneuvering roll. Use your Chase Card’s suit. On failure, Hearts and Diamonds Bump you, Clubs and Spades trigger a mishap, and a Joker can Bump you two cards.", {
    clubs: trait("Clubs", "", "-2"), diamonds: trait("Diamonds", "", "-2"), joker: trait("Joker", "", "2"),
  }],
];

export const BASIC_ACTIONS = [
  action("Climb", "Athletics", `Each inch costs 2″ of Pace. Ordinary climbs usually require no check. Under stress, a success makes normal progress and a failure makes none. A critical failure causes a ${falling} roll. A secured climber drops half the restraint’s length and takes Bumps &amp; Bruises Fatigue.`),
  action("Swim", "Athletics", `Each inch costs 2″ of Pace. A critical failure starts ${drowning}.`),
  action("Breaking Free from a Device", "Athletics", "Use Athletics, Strength at −2, or base damage from a small accessible weapon that can cut or break the restraint. The weapon hits automatically. As a regular action, add +2 to the trait check or Wild Attack for +2 weapon damage.",
    {alternatives: {strength: trait("Strength (free action)", "Strength", "-2"), athletics: trait("Athletics (regular action)", "Athletics", "2"), strengthAction: trait("Strength (regular action)", "Strength")}}),
  action("Climb Giant Foe", "Athletics", `A creature at least two Scales smaller can oppose the larger foe with Athletics. A win lets the climber stay attached and move with the foe. Losing can cause ${falling} damage. At a suitable spot, the GM may let the climber ignore up to 2 points of Called Shot penalties on melee attacks.`),
  action("Evade", "Agility", `If the attack allows ${evasion} and you are aware of it, roll Agility at −2. A success avoids damage. The GM positions you at the edge of any area of effect.`, {modifier: "-2"}),
  action("Setting Weapons", "Athletics", "While on Hold with Reach 1 or more, oppose the cavalry charge using Athletics. The longer Reach adds +2. The winner attacks first and adds +4 damage if the attack hits.",
    {alternatives: {reach: trait("Interrupt with longer Reach", "Athletics", "2")}}),
  action("Hot Potato", "Athletics", "Only one creature in the grenade blast may try to throw it back. Roll at −4 as a free action, or at −2 by spending a held action. Failure detonates the grenade before the throw, with raise damage.", {modifier: "-4",
    alternatives: {held: trait("Throw from Hold (−2 total)", "Athletics", "2")}}),
  action("Touch Attack", "Fighting", "Add +2 to Fighting when your aim is to touch the target, such as to deliver a power.", {modifier: "2"}),
  action("Earn", "", "Roll an appropriate skill or attribute to earn income. Success pays 100 gp per Rank, doubled on a raise. Failure pays nothing and causes Bumps &amp; Bruises Fatigue. A critical failure pays nothing, causes embarrassment, and can inflict d4 Wounds if the work was dangerous.", {kind: "each-skill"}),
  action("Gamble", "Gambling", "Agree on a stake, then each participant rolls Gambling for an hour of play. Pair highest with lowest, second highest with second lowest, and so on. The lower total pays the higher the difference times the stake. An unpaired player breaks even."),
  action("Forensics", "Healing", "Use Healing to analyze trauma, including how and when the injury or death occurred. Success reveals basic information, and a raise uncovers more detail."),
  action("Poison Treatment", "Healing", "Apply the poison’s penalty to Healing. Success ends its effects and revives the victim if applicable. Each healer may try once per poisoning."),
  action("Intimidation", "Intimidation", "Opposed by Spirit. In combat this is a Test. Outside combat a success pressures the target to back down or reveal information, and a raise can have stronger consequences. On a critical failure, the target ignores this character’s Intimidation for the rest of the encounter."),
  action("Notice Surprise", "Notice", "A success lets the defender receive an Action Card in the first round. Failure leaves them out of that round."),
  ...maneuvers.map(([name, summary, alternatives]) => action(name, "Athletics", `${summary} See ${chases}.`, {alternatives, kind: "chase"})),
  action("Evade (Chase)", "", `Once per round, impose −2 on attacks by and against the maneuvering group until its next turn. As an action the penalty is −4. See ${chases}.`, {kind: "chase-evade"}),
  action("Hold Steady", "", `Ignore Running and Unstable Platform penalties while giving attackers +2 against your group until its next turn. The incoming bonus does not stack with Vulnerable. See ${chases}.`, {kind: "chase-steady"}),
  action("Bump", "", `Move the rival group one Chase Card when a maneuver allows it. An attacker can Bump the same rival once per turn. See ${chases}.`, {kind: "chase-bump"}),
  action("Drop Back", "", `In a linear chase, drop back one or two cards without rolling. You cannot also Change Position this turn. See ${chases}.`, {kind: "chase-bump"}),
  action("Tracking", "Survival", "Use Survival to find and follow tracks. A check usually covers a mile. Adjust for the target, ground, weather, and age of the trail."),
  action("Forage", "Survival", "Find enough food and water for one person for one day on a success, or five people on a raise."),
  action("Support", "", `Choose an ally and the trait they need help with. A success adds +1, a raise adds +2, and a critical failure adds −2. Apply it to the ally’s next relevant roll. See ${rules("swadecor03rules0", "03support0000000", "Support")}.`, {kind: "each-skill"}),
  action("Test", "", `The foe resists with the attribute linked to the skill you use. On a win, choose Distracted or Vulnerable. A raise also leaves the target Shaken. See ${rules("swadecor03rules0", "03test0000000000", "Test")}.`, {kind: "each-skill"}),
];

let initialization;
export function initializeActionLibrary() {
  if (!isPrimaryGM()) return Promise.resolve(game.packs.get(PACK_ID));
  initialization ??= seedActionLibrary().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

async function seedActionLibrary() {
  const pack = game.packs.get(PACK_ID) ?? await foundry.documents.collections.CompendiumCollection.createCompendium({
    name: PACK_NAME, label: "Better Setting — Actions", type: "Item", system: "swade",
    ownership: {PLAYER: "OBSERVER", TRUSTED: "OBSERVER", ASSISTANT: "OWNER", GAMEMASTER: "OWNER"}
  });
  const names = new Set((await pack.getDocuments()).map(item => normalizeName(item.name)));
  const missing = BASIC_ACTIONS.filter(entry => !names.has(normalizeName(entry.name)));
  if (missing.length) {
    if (pack.locked) throw new Error("Unlock Better Setting — Actions to install the missing basic actions.");
    await CONFIG.Item.documentClass.createDocuments(foundry.utils.deepClone(missing), {pack: pack.collection});
  }
  return pack;
}

export async function libraryActions() {
  const pack = await initializeActionLibrary();
  return (await pack?.getDocuments() ?? []).filter(item => item.type === "action");
}
