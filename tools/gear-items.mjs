export const effect = (key, duration, units) => ({type: "effect", key, ...(duration == null ? {} : {duration, units})});
export const macro = key => ({type: "macro", key});
export const note = text => ({type: "note", note: "<p>" + text + "</p>"});
const roll = (formula, flags, damage = false) => ({type: "roll", formula, flags, damage});
const request = (trait, tn, description, flags, penalty = 0) => ({
  type: "request", request: {trait, tn, description, flags, penalty}
});
const use = (key, name, behaviours, options = {}) => ({key, name, behaviours, ...options});
const potion = (name, icon, price, text, options = {}) => ({name, icon, price, text, group: "Potions & Tonics", ...options});
const poison = (name, icon, price, key, text, tags = []) => ({
  name, icon, price, text, group: "Poisons", tags: ["poison", ...tags], behaviours: [effect(key), note(text)]
});
const coating = (name, icon, price, key, text, coatingFilter = "weapon") => ({
  name, icon, price, text, group: "Coatings", coatingFilter, tags: ["coating"], capacity: 2,
  behaviours: [effect(key), macro("replace-coating"), note(text + " Replaces the previous catalog coating on this weapon.")]
});
const makeElixir = (name, icon, price, key, text, tags = []) => potion(name, icon, price, text, {
  tags: ["elixir", ...tags], behaviours: [effect(key)]
});
const recovery = (name, icon, price, track, amount, text) => potion(name, icon, price, text, {
  tags: ["healing", track],
  uses: [use("drink", "Drink", [macro("restore-condition")], {details: {track, amount}})]
});

export const alchemy = [
  recovery("Redwake Draught", "potion-flask-corked-shiny-red", 110, "wounds", 1,
    "A warmth like a banked hearth. Use to restore one Wound on yourself or an owned actor you target. It does not remove injuries."),
  recovery("Phoenix Root Reserve", "potion-tube-corked-glowing-red", 320, "wounds", 2,
    "A concentrated emergency restorative. Restores up to two Wounds on an owned recipient. It does not remove injuries."),
  recovery("Daybreak Tonic", "potion-flask-corked-yellow", 60, "fatigue", 1,
    "A bracing sweet citrus tonic. Restores one level of Fatigue on an owned recipient."),
  recovery("Whitewater Restorative", "vial-cork-blue", 150, "fatigue", 2,
    "A cold, mineral-rich draught. Restores up to two levels of Fatigue on an owned recipient."),
  makeElixir("Fleetfoot Cordial", "potion-tube-corked-orange", 55, "fleetfoot",
    "Drink to gain +2 ground Pace and +1 to running rolls for five rounds."),
  makeElixir("Ironbark Draught", "potion-jar-corked-green", 90, "bastion", "Drink for +2 Toughness for five rounds."),
  makeElixir("Nightglass Drops", "potion-vial-corked-purple", 65, "nightglass",
    "Drink for +2 to Notice for ten minutes. Illumination and concealment still apply."),
  makeElixir("Galehand Ampoule", "potion-tube-corked-labeled-cyan", 60, "galehand", "Drink for +2 Athletics for five rounds."),
  makeElixir("Stillwater Elixir", "potion-jar-capped-teal", 65, "stillwater", "Drink for +2 Spirit and +1 Intimidation for ten minutes."),
  makeElixir("Siltlung Syrup", "potion-flask-corked-teal", 55, "siltlung",
    "Drink to breathe underwater and gain a minimum base Swim Pace of 4 before penalties for ten minutes."),
  makeElixir("Witchsalt Cordial", "potion-jar-corked-glowing-blue", 100, "witchsalt",
    "Drink to reduce incoming damage tagged magic or power by 4 for five rounds.", ["ward"]),
  makeElixir("Rimefire Emulsion", "potion-flask-corked-cyan", 90, "rimefire",
    "Drink to reduce incoming fire or cold damage by 4 for ten minutes.", ["ward", "elemental"]),
  makeElixir("Stormskin Tonic", "potion-tube-corked-blue", 75, "stormskin",
    "Drink to reduce lightning damage by 5 and take 2 extra damage from acid for five rounds.", ["ward", "elemental"]),
  makeElixir("Sunward Sacrament", "potion-flask-stopped-labeled-yellow", 90, "sunward",
    "For five rounds, gain +1 to attacks against undead and reduce necrotic damage by 3.", ["undead", "ward"]),
  potion("Silver-Sage Antidote", "vial-cork-green", 85,
    "Removes Sablevein, Mirror Pollen, Glass Rot, and their linked catalog conditions from an owned recipient.", {
      tags: ["antidote", "healing"], behaviours: [macro("clear-poisons")]
    }),
  potion("Aetherwell Phial", "potion-flask-corked-blue", 80,
    "Restore 3 Power Points to one eligible depleted pool. If several qualify, choose one. No Power Points pools are skipped.", {
      tags: ["mana", "restorative"], uses: [use("drink", "Drink", [macro("restore-pp")], {details: {amount: 3}})]
    }),
  potion("Wayfarer's Twin Flask", "potion-jar-corked-orange", 145,
    "Three doses in one shared supply. Sip to gain Fleetfoot for three rounds, or spend two doses for ten minutes of Rimefire Ward.", {
      capacity: 3, width: 1, height: 2, weight: 1,
      uses: [use("sip", "Trail sip", [effect("fleetfoot", 3, "rounds")], {description: "+2 ground Pace and +1 running for three rounds."}),
        use("ward", "Full measure", [effect("rimefire")], {cost: 2, description: "Reduce fire or cold damage by 4 for ten minutes."})]
    }),
  potion("Stormglass Capacitor", "potion-flask-corked-tied-necklace-teal", 360,
    "A reusable ampoule with two independent chambers. Charge both at day recharge. Use one chamber to gain Stormskin or the other to restore 2 Power Points.", {
      shared: false, reusable: true, width: 1, height: 2, weight: 1, tags: ["mana", "elemental"],
      uses: [use("ward", "Storm chamber", [effect("stormskin")], {pool: {max: 1, rechargeType: "day"}, description: "Stormskin for five rounds."}),
        use("mana", "Aether chamber", [macro("restore-pp")], {pool: {max: 2, rechargeType: "day", rechargeAmount: "1d2"}, details: {amount: 2},
          description: "Restore 2 Power Points. Daily recharge refills 1d2 charges."})]
    }),
  potion("Oracle's Bitter", "potion-jar-corked-labeled-purple-pink", 45,
    "Drink to receive a private Notice request at TN 4. On success the GM gives a useful impression tied to a visible clue.", {
      tags: ["divination"], behaviours: [request("Notice", 4, "On a success, ask the GM for an impression tied to something you can see. On a raise, ask one follow-up.", ["divination", "oracle"])]
    }),
  potion("Pilgrim's Trial", "potion-round-corked-glowing-green", 55,
    "A ritual stimulant with a price. Make the requested Spirit test at −2. Success steadies your voice for the rite, a narrative benefit adjudicated by the GM.", {
      tags: ["ritual"], behaviours: [request("Spirit", 4, "On success, your voice holds through the rite. On a raise the GM may also reveal who last performed it.", ["ritual", "pilgrim"], 2)]
    }),
  {
    name: "Phial of Uncertain Sparks", icon: "potion-tube-corked-bubbling-green", group: "Special Supplies", price: 40,
    tags: ["alchemical", "utility"], text: "Roll 1d6 to learn which color the phial sheds. This is a signal, not a damage roll.",
    behaviours: [roll("1d6", ["signal", "alchemical"]), note("1 red, 2 amber, 3 white, 4 green, 5 blue, 6 violet. The color marks your signal in the scene.")]
  },
  {
    name: "Cinderburst Capsule", icon: "potion-jar-corked-labeled-red", group: "Special Supplies", price: 80, tags: ["alchemical", "fire"],
    text: "Activate after the GM confirms a splash or hit. Choose the intended target in the activation dialog. Roll 2d6 acing fire damage against that target.",
    behaviours: [roll("2d6x", ["fire", "alchemical"], true), note("For a thrown attack, resolve the hit first. This use rolls damage only.")]
  },
  poison("Sablevein Extract", "potion-jar-corked-labeled-poison-skull-green", 95, "sablevein",
    "Apply after an exposed creature has ingested the extract. Select that creature in the activation dialog. Its end-of-turn Vigor test governs whether it shakes off the poison or takes damage.", ["sablevein"]),
  poison("Mirror Pollen Concentrate", "potion-labeled-poison-white", 105, "mirror-pollen",
    "Apply after the target is exposed. It makes a start-of-turn Smarts test and needs two successes to clear the poison. A failure applies Distracted through Double Vision.", ["mirror-pollen"]),
  poison("Glass Rot Reagent", "vial-ornet-silver-black", 155, "glass-rot",
    "Apply after exposure. End-of-turn Vigor tests can clear the poison, prompt poison damage, or add Fracture Shock on a critical failure.", ["glass-rot"]),
  coating("Grave-Silver Oil", "potion-tube-corked-labeled-cyan", 85, "grave-silver",
    "Apply to a weapon. Deal +2 damage to targets flagged undead or lycanthrope."),
  coating("Cinder Lacquer", "potion-tube-corked-red", 65, "cinder-lacquer",
    "Apply to a weapon. Deal +2 damage to targets flagged plant, swarm, or cold-creature."),
  coating("Rift Oil", "potion-vial-corked-labeled-purple", 85, "rift-oil",
    "Apply to a weapon. Gain +3 AP against targets flagged construct or elemental."),
  coating("Duskshot Lacquer", "potion-flask-corked-flat-red", 75, "duskshot",
    "Apply to a weapon. Gain +1 on ranged attacks with it."),
  coating("Wardbreaker Paste", "potion-tube-corked-green", 80, "ward-breaker",
    "Apply to a weapon. Deal +2 damage against targets flagged ward or arcane-ward."),
  {name: "Alchemist's Wiping Cloth", icon: "potion-vial-tube-yellow", price: 8, coatingFilter: "weapon", group: "Coatings",
    tags: ["cleaning", "utility"], text: "Choose an owned weapon and remove its catalog coatings. It can be reused.",
    reusable: true, shared: false, uses: [use("wipe", "Wipe weapon", [macro("wipe-coating")], {cost: 0})]}
];

const bag = icon => "containers/bags/" + icon;
const belt = icon => "equipment/waist/" + icon;
const box = icon => "containers/chest/" + icon;
const slot = (id, label, types, icon) => ({id, label, types, icon});
const pouch = slot("pouch", "Side pouch", ["pouch"], "bag-shopping");
const sheath = slot("sheath", "Sheath mount", ["sheath"], "knife");
const caseMount = slot("case", "Case clip", ["kit-case"], "briefcase");
const wallet = slot("wallet", "Wallet hook", ["wallet"], "wallet");
const ammo = slot("quiver", "Quiver mount", ["quiver"], "arrows-up-to-line");

export const storage = [
  {name: "Marlowe Trail Pack", icon: bag("pack-leather-strapped-tan"), group: "Packs & Satchels", price: 48, weight: 3, equipped: 2,
    size: [2, 3], slot: "backpack", type: "backpack", shape: ["#####", "#####", "#####", ".###."], limit: 32,
    mounts: [pouch, caseMount], text: "A broad trail pack with a taper at the bottom, a side pouch mount, and a case clip."},
  {name: "Alchemist's Frame Pack", icon: bag("pack-leather-red"), group: "Packs & Satchels", price: 90, weight: 4, equipped: 2,
    size: [2, 3], slot: "backpack", type: "backpack", shape: ["######", "######", ".####."], limit: 22,
    types: ["potion", "poison", "coating", "alchemical", "kit-case"], mounts: [pouch, caseMount], text: "A padded frame for bottles, doses, and reagent cases. The storage grid accepts alchemy and kit cases."},
  {name: "Raven Courier Satchel", icon: bag("satchel-worn-leather-teal"), group: "Packs & Satchels", price: 42, weight: 2, equipped: 1,
    size: [2, 2], slot: "backpack", type: "backpack", shape: ["####", "####", "##.."], limit: 15,
    mounts: [wallet], text: "A flat satchel with a wallet hook and a narrow corner for smaller articles."},
  {name: "Foldspace Expedition Pack", icon: bag("pack-silver-purple"), group: "Packs & Satchels", price: 450, weight: 4, equipped: 2,
    size: [2, 3], slot: "backpack", type: "backpack", shape: ["######", "######", "######", "######"], limit: 50, factor: .5,
    mounts: [caseMount], sound: "magic", text: "Carries up to 50 weight before reduction. Contents count at half weight for carrying. The shell and attachments keep their own weight."},
  {name: "Rook's Draw Belt", icon: belt("belt-leather-black-brass"), group: "Belts & Attachments", price: 58, weight: 2, equipped: 1,
    size: [2, 1], slot: "belt", type: "belt", shape: ["######", "#....#", "#.....", "#....."], limit: 12,
    mounts: [pouch, sheath], text: "Six cells across with a deep sheath on the left and a short sheath on the right. Add a shoulder pouch or a separate scabbard to the mounts."},
  {name: "Tinker's Modular Belt", icon: belt("belt-utility-green"), group: "Belts & Attachments", price: 54, weight: 2, equipped: 1,
    size: [2, 1], slot: "belt", type: "belt", shape: ["###.##", "###.##"], limit: 10,
    mounts: [{...pouch, id: "left-pouch", label: "Left pouch"}, {...pouch, id: "right-pouch", label: "Right pouch"}, caseMount],
    text: "Two separated storage pockets and three external mounts. The two pouch mounts can be used independently."},
  {name: "Ranger's Cartridge Harness", icon: belt("belt-leather-green"), group: "Belts & Attachments", price: 46, weight: 2, equipped: 1,
    size: [2, 1], slot: "belt", type: "belt", shape: ["#####", "##.##"], limit: 9,
    types: ["consumable"], flags: ["#ammunition"], mounts: [ammo, sheath], text: "A harness for carried consumables and tagged ammunition, with a quiver and a scabbard mount."},
  {name: "Waxed Utility Pouch", icon: bag("pouch-leather-brown-green"), group: "Belts & Attachments", price: 12, weight: .5, equipped: .5,
    size: [1, 1], type: "pouch", shape: ["##", "##"], limit: 4, text: "A square pouch that fits a pouch attachment, or the paper doll's Pouches slot."},
  {name: "Glasskeeper Dose Pouch", icon: bag("pouch-leather-silver-green"), group: "Belts & Attachments", price: 18, weight: .5, equipped: .5,
    size: [1, 1], type: "pouch", shape: ["###", ".#."], limit: 3, types: ["potion", "poison", "coating", "alchemical"],
    text: "Holds alchemical doses only. The center accepts a long ampoule as well as ordinary one-cell vials."},
  {name: "Shortblade Sheath", icon: bag("case-simple-leather-brown"), group: "Belts & Attachments", price: 17, weight: 1, equipped: .5,
    size: [1, 2], type: "sheath", shape: ["#", "#"], limit: 4, types: ["weapon"],
    text: "Attaches to a sheath mount. Accepts a weapon whose footprint fits a narrow two-cell sheath."},
  {name: "Longblade Scabbard", icon: bag("case-leather-tan"), group: "Belts & Attachments", price: 25, weight: 2, equipped: 1,
    size: [1, 3], type: "sheath", shape: ["#", "#", "#", "#"], limit: 9, types: ["weapon"],
    text: "A four-cell scabbard for narrow weapons. Attaches to a sheath mount."},
  {name: "Reedrunner Quiver", icon: "containers/ammunition/arrows-quiver-green-brown", group: "Belts & Attachments", price: 23, weight: 1.5, equipped: 1,
    size: [1, 2], type: "quiver", shape: ["##", "##", "##"], limit: 7, flags: ["#ammunition", "#arrow", "#bolt"],
    text: "Fits a quiver mount. Accepts Grid Inventory tags ammunition, arrow, or bolt."},
  {name: "Coppergate Coin Purse", icon: bag("coinpouch-simple-leather-tan"), group: "Wallets & Money Cases", price: 10, weight: .25, equipped: .25,
    size: [1, 1], type: "wallet", shape: ["##", "##"], limit: 4, types: ["money"], text: "Dedicated coin storage for physical currency from Better Money. Fits a wallet hook."},
  {name: "Ledgerkeeper Wallet", icon: bag("case-embossed-leather-tan"), group: "Wallets & Money Cases", price: 16, weight: .25, equipped: .25,
    size: [1, 1], type: "wallet", shape: ["###", "#.."], limit: 2, types: ["money"], flags: ["#voucher", "#papers"],
    text: "Stores Better Money currency, or gear tagged voucher or papers in Grid Inventory. Fits a wallet hook."},
  {name: "Ironclasp Payroll Case", icon: box("chest-simple-box-steel-brown"), group: "Wallets & Money Cases", price: 75, weight: 5, equipped: 5,
    size: [3, 2], type: "cashbox", shape: ["#####", "#####", "#####"], limit: 35, types: ["money"], sound: "metal",
    text: "A metal payroll box for physical currency stacks. Its filter accepts money only."},
  {name: "Quartermaster's List Chest", icon: box("chest-reinforced-steel-walnut-brown"), group: "Cases & Field Storage", price: 90, weight: 12, equipped: 12,
    size: [3, 3], type: "trunk", shape: ["#####", "#####", "#####"], layout: "list", limit: 80, sound: "wood",
    text: "List storage for bulky luggage. Contents are checked against its weight limit without a footprint restriction."},
  {name: "Field Surgeon's Case", icon: box("chest-simple-box-red"), group: "Cases & Field Storage", price: 45, weight: 2, equipped: 1,
    size: [2, 2], type: "kit-case", shape: ["####", ".##.", ".##."], limit: 8, types: ["potion"], flags: ["#medical"], sound: "wood",
    text: "Accepts potions or gear tagged medical. Fits a kit-case clip. The tall center has room for ampoules."},
  {name: "Viperproof Transit Case", icon: box("chest-simple-box-gold-brown"), group: "Cases & Field Storage", price: 56, weight: 3, equipped: 2,
    size: [2, 2], type: "kit-case", shape: ["###", "###"], limit: 8, types: ["poison", "coating"], sound: "metal",
    text: "A rigid case for poisons and coatings. Fits a kit-case clip. The storage filter does not grant poison resistance."},
  {name: "Dryscroll Tube", icon: bag("case-scroll-leather-tan"), group: "Cases & Field Storage", price: 18, weight: 1, equipped: 1,
    size: [1, 2], type: "kit-case", shape: ["#", "#", "#", "#"], limit: 5, flags: ["#scroll", "#papers"],
    text: "Stores gear tagged scroll or papers. It fits a kit-case clip."}
];

export const supplies = [
  {name: "Rook's Sideknife", icon: "weapons/daggers/dagger-simple-black", type: "weapon", price: 35, weight: 1,
    size: [1, 2], tags: ["blade", "knife"], system: {rangeType: 0, damage: "@str+1d4", ap: 0, actions: {trait: "Fighting"}},
    text: "A short road knife sized for the Shortblade Sheath. Damage is Strength plus d4."},
  {name: "Marlowe Road Blade", icon: "weapons/swords/sword-simple-white", type: "weapon", price: 110, weight: 3,
    size: [1, 4], tags: ["blade", "sword"], system: {rangeType: 0, damage: "@str+1d8", ap: 0, actions: {trait: "Fighting"}},
    text: "A long, narrow road sword sized for a Longblade Scabbard or the deep end of Rook's Draw Belt. Damage is Strength plus d8."},
  {name: "Reedrunner Arrows", icon: "containers/ammunition/arrows-quiver-brown", price: 1, weight: .1,
    size: [1, 2], tags: ["ammunition", "arrow"], system: {isAmmo: true, quantity: 10},
    text: "A stack of ten plain arrows. The ammunition flag fits the Reedrunner Quiver and Ranger's Cartridge Harness."},
  {name: "Sealed Courier Dispatch", icon: "sundries/scrolls/scroll-bound-sealed-red", price: 1, weight: .1,
    size: [1, 1], tags: ["scroll", "papers"], text: "A blank story prop for a sealed message. Fits a Dryscroll Tube or Ledgerkeeper Wallet."},
  {name: "Coppergate Pay Chit", icon: "sundries/scrolls/scroll-bound-sealed-red-yellow", price: 0, weight: .05,
    size: [1, 1], tags: ["voucher", "papers"], text: "A stamped claim on a Coppergate office. The GM sets its redeemable value. Fits a Ledgerkeeper Wallet."},
  {name: "Surgeon's Field Wraps", icon: "tools/medical/bandages-gauze", price: 12, weight: .5,
    size: [1, 1], tags: ["medical"], text: "Clean wraps for field dressings. Fits the Field Surgeon's Case. Use the normal Healing rules when treating a wound."}
];
