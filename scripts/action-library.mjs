import {t as sbsI18n} from "./i18n.mjs";
import {isPrimaryGM} from "./library.mjs";
import {normalizeName, slug} from "./skills.mjs";

const PACK_NAME = "better-setting-actions";
const PACK_ID = "world." + PACK_NAME;
const MODULE_ID = "swade-better-setting";
const rules = (chapter, page, label) =>
  `@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.${chapter}.JournalEntryPage.${page}]{${label}}`;
const falling = rules("swadecor04theadv", "04falling0000000", sbsI18n("swade-better-setting.UI.Falling_6192f18475"));
const drowning = rules("swadecor04theadv", "04drowning000000", sbsI18n("swade-better-setting.UI.Drowning_6328ce017a"));
const evasion = rules("swadecor03rules0", "03evasion0000000", sbsI18n("swade-better-setting.UI.Evasion_3643dd816b"));
const chases = rules("swadecor04theadv", "04chasesandveh00", sbsI18n("swade-better-setting.UI.ChasesandVehicles_79971c2e22"));

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
  [sbsI18n("swade-better-setting.UI.Board_4816cbfd74"), sbsI18n("swade-better-setting.UI.Opposetheotherpilotordriver_b85dd0275b")],
  [sbsI18n("swade-better-setting.UI.ChangePosition_40f28e95e9"), sbsI18n("swade-better-setting.UI.MoveuptooneChaseCard_91e6b2cc7c"), {
    asAction: trait(sbsI18n("swade-better-setting.UI.ChangePositionasanaction_3aba46c8e5"), "", "2"),
    faster: trait(sbsI18n("swade-better-setting.UI.Freeactionfasterthanrivals_e759617aca"), "", "1"),
    twiceAsFast: trait(sbsI18n("swade-better-setting.UI.Freeactiontwiceasfast_09c77abf98"), "", "2"),
  }],
  [sbsI18n("swade-better-setting.UI.Flee_4c629e5d13"), sbsI18n("swade-better-setting.UI.EscapeonasuccessYouneed_7db4dcf714"),
    {fourCards: trait(sbsI18n("swade-better-setting.UI.Fourinterveningcards_a378676c13"), "", "-4"), fiveCards: trait(sbsI18n("swade-better-setting.UI.Fiveinterveningcards_e95fb4705d"), "", "-2")}],
  [sbsI18n("swade-better-setting.UI.Force_cfda1755ff"), sbsI18n("swade-better-setting.UI.Opposearivalonthesame_f998610358")],
  [sbsI18n("swade-better-setting.UI.Ram_76e11af94d"), sbsI18n("swade-better-setting.UI.Opposearivalonthesame_12a4db5b2a")],
  [sbsI18n("swade-better-setting.UI.HandleComplications_1e57a37497"), sbsI18n("swade-better-setting.UI.WhentheActionCardisa_c735ebf2b1"), {
    clubs: trait(sbsI18n("swade-better-setting.UI.Clubs_98348a9036"), "", "-2"), diamonds: trait(sbsI18n("swade-better-setting.UI.Diamonds_dc95f33b58"), "", "-2"), joker: trait(sbsI18n("swade-better-setting.UI.Joker_d7439d3523"), "", "2"),
  }],
];

export const BASIC_ACTIONS = [
  action(sbsI18n("swade-better-setting.UI.Climb_98ca5f27d9"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.Eachinchcosts2ofPace_857fa6ef1a", {p0: (falling)})),
  action(sbsI18n("swade-better-setting.UI.Swim_dd4fa375c7"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.Eachinchcosts2ofPace_a72f52a8b2", {p0: (drowning)})),
  action(sbsI18n("swade-better-setting.UI.BreakingFreefromaDevice_a7309c98b2"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.UseAthleticsStrengthat2or_e2e5cb5aea"),
    {alternatives: {strength: trait(sbsI18n("swade-better-setting.UI.Strengthfreeaction_ec5527e9be"), sbsI18n("swade-better-setting.UI.Strength_63ee3a1b96"), "-2"), athletics: trait(sbsI18n("swade-better-setting.UI.Athleticsregularaction_be3abe1f0e"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), "2"), strengthAction: trait(sbsI18n("swade-better-setting.UI.Strengthregularaction_1a13d2313a"), sbsI18n("swade-better-setting.UI.Strength_63ee3a1b96"))}}),
  action(sbsI18n("swade-better-setting.UI.ClimbGiantFoe_23a1ff8006"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.AcreatureatleasttwoScales_571de542da", {p0: (falling)})),
  action(sbsI18n("swade-better-setting.UI.Evade_53e75daf07"), sbsI18n("swade-better-setting.UI.Agility_49796694dc"), sbsI18n("swade-better-setting.UI.Iftheattackallowsandyou_2e2588545f", {p0: (evasion)}), {modifier: "-2"}),
  action(sbsI18n("swade-better-setting.UI.SettingWeapons_c464da8734"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.WhileonHoldwithReach1_0c225b7881"),
    {alternatives: {reach: trait(sbsI18n("swade-better-setting.UI.InterruptwithlongerReach_6af5e09cae"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), "2")}}),
  action(sbsI18n("swade-better-setting.UI.HotPotato_7938229cb6"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.Onlyonecreatureinthegrenade_16babbc56e"), {modifier: "-4",
    alternatives: {held: trait(sbsI18n("swade-better-setting.UI.ThrowfromHold2total_2b3d310e17"), sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), "2")}}),
  action(sbsI18n("swade-better-setting.UI.TouchAttack_99f8c28ea3"), sbsI18n("swade-better-setting.UI.Fighting_21e2e5c54b"), sbsI18n("swade-better-setting.UI.Add2toFightingwhenyour_10db4a470f"), {modifier: "2"}),
  action(sbsI18n("swade-better-setting.UI.Earn_a697f90fb1"), "", sbsI18n("swade-better-setting.UI.Rollanappropriateskillorattribute_2d1de2c8bb"), {kind: "each-skill"}),
  action(sbsI18n("swade-better-setting.UI.Gamble_b12075ac7a"), sbsI18n("swade-better-setting.UI.Gambling_a34a9dc897"), sbsI18n("swade-better-setting.UI.Agreeonastaketheneach_be4a76b86c")),
  action(sbsI18n("swade-better-setting.UI.Forensics_64e34ce2ec"), sbsI18n("swade-better-setting.UI.Healing_44bc379989"), sbsI18n("swade-better-setting.UI.UseHealingtoanalyzetraumaincluding_02b01b62b2")),
  action(sbsI18n("swade-better-setting.UI.PoisonTreatment_3da27c8a9f"), sbsI18n("swade-better-setting.UI.Healing_44bc379989"), sbsI18n("swade-better-setting.UI.Applythepoisonspenaltyto_f84cba22e0")),
  action(sbsI18n("swade-better-setting.UI.Intimidation_5459202ae7"), sbsI18n("swade-better-setting.UI.Intimidation_5459202ae7"), sbsI18n("swade-better-setting.UI.OpposedbySpiritIncombatthis_8fa389fb55")),
  action(sbsI18n("swade-better-setting.UI.NoticeSurprise_b03a0db233"), sbsI18n("swade-better-setting.UI.Notice_6565914556"), sbsI18n("swade-better-setting.UI.Asuccessletsthedefenderreceive_471f2f1a4c")),
  ...maneuvers.map(([name, summary, alternatives]) => action(name, sbsI18n("swade-better-setting.UI.Athletics_ec1345a87f"), sbsI18n("swade-better-setting.UI.See_a7226084e1", {p0: (summary), p1: (chases)}), {alternatives, kind: "chase"})),
  action(sbsI18n("swade-better-setting.UI.EvadeChase_b4d0b91496"), "", sbsI18n("swade-better-setting.UI.Onceperroundimpose2on_83d57152d7", {p0: (chases)}), {kind: "chase-evade"}),
  action(sbsI18n("swade-better-setting.UI.HoldSteady_8923414e94"), "", sbsI18n("swade-better-setting.UI.IgnoreRunningandUnstablePlatformpenalties_c5aa2b4070", {p0: (chases)}), {kind: "chase-steady"}),
  action(sbsI18n("swade-better-setting.UI.Bump_9db2cebca8"), "", sbsI18n("swade-better-setting.UI.MovetherivalgrouponeChase_974df7de96", {p0: (chases)}), {kind: "chase-bump"}),
  action(sbsI18n("swade-better-setting.UI.DropBack_e3c4c63d85"), "", sbsI18n("swade-better-setting.UI.Inalinearchasedropback_b77cba74e5", {p0: (chases)}), {kind: "chase-bump"}),
  action(sbsI18n("swade-better-setting.UI.Tracking_36b6ca1886"), sbsI18n("swade-better-setting.UI.Survival_8302496de0"), sbsI18n("swade-better-setting.UI.UseSurvivaltofindandfollow_3eeef6b8db")),
  action(sbsI18n("swade-better-setting.UI.Forage_41134e8046"), sbsI18n("swade-better-setting.UI.Survival_8302496de0"), sbsI18n("swade-better-setting.UI.Findenoughfoodandwaterfor_ac07169d18")),
  action(sbsI18n("swade-better-setting.UI.Support_be91940b79"), "", sbsI18n("swade-better-setting.UI.Chooseanallyandthetrait_3bdea8b25c", {p0: (rules("swadecor03rules0", "03support0000000", sbsI18n("swade-better-setting.UI.Support_be91940b79")))}), {kind: "each-skill"}),
  action(sbsI18n("swade-better-setting.UI.Test_532eaabd95"), "", sbsI18n("swade-better-setting.UI.Thefoeresistswiththeattribute_6822bba420", {p0: (rules("swadecor03rules0", "03test0000000000", sbsI18n("swade-better-setting.UI.Test_532eaabd95")))}), {kind: "each-skill"}),
];

let initialization;
export function initializeActionLibrary() {
  if (!isPrimaryGM()) return Promise.resolve(game.packs.get(PACK_ID));
  initialization ??= seedActionLibrary().catch(error => { initialization = undefined; throw error; });
  return initialization;
}

async function seedActionLibrary() {
  const pack = game.packs.get(PACK_ID) ?? await foundry.documents.collections.CompendiumCollection.createCompendium({
    name: PACK_NAME, label: sbsI18n("swade-better-setting.UI.BetterSettingActions_5cab68eac9"), type: "Item", system: "swade",
    ownership: {PLAYER: "OBSERVER", TRUSTED: "OBSERVER", ASSISTANT: "OWNER", GAMEMASTER: "OWNER"}
  });
  const names = new Set((await pack.getDocuments()).map(item => normalizeName(item.name)));
  const missing = BASIC_ACTIONS.filter(entry => !names.has(normalizeName(entry.name)));
  if (missing.length) {
    if (pack.locked) throw new Error(sbsI18n("swade-better-setting.UI.UnlockBetterSettingActionstoinstall_fc7e7af676"));
    await CONFIG.Item.documentClass.createDocuments(foundry.utils.deepClone(missing), {pack: pack.collection});
  }
  return pack;
}

export async function libraryActions() {
  const pack = await initializeActionLibrary();
  return (await pack?.getDocuments() ?? []).filter(item => item.type === "action");
}
