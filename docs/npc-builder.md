# SWADE NPC Builder and Creature Rating

Open **NPC Builder** from the Actors sidebar or from Browse Bestiary. Give the NPC a name, then choose a rank, an archetype, an optional ancestry, and Extra or Wild Card. Changing rank or archetype refreshes suggested values and keeps manually edited fields, individually chosen items, and explicit skill edits and removals. **Reset profile** restores the suggested stat fields and primary skill. The builder makes a native NPC and opens its sheet.

Use **Token art** to open Tokenizer 2, Tokenizer, or Foundry’s File Picker in that order. Shift-click always opens the File Picker, which also handles uploads. The builder holds the token selection until you create the actor.

## Profiles and rank

**Primary skill** is the archetype’s specialty. With the usual d6 starting die, it reaches d12+1 at Legendary. Trained supporting skills and the archetype’s strongest attribute also improve with rank. The Wild Card preset adds one die step to the strongest attribute and a supporting skill, up to d12. SWADE itself gives Wild Cards the Wild Die, additional Wounds, and personal Bennies.

Use **Edit archetypes** beside the dropdown to edit or restore a standard archetype, duplicate one, or build a custom entry. The library is shared across the world.

- **Traits and progression** has skill and trait pickers, starting dice, per-rank progression, optional weighted die increases, and an Extra or Wild Card preview. Supporting skills can have an inclusion chance or require an Arcane Background.
- **Loadout** accepts searchable selections and dragged library items. Each row can specify a rank range, chance, quantity, and equipment location. A named slot picks one weighted kit. Items that share the slot and kit names can be granted together. For example, a bow and shield can share a kit while a spear is an alternate kit in the same slot. Armor in a separate slot is selected independently. Weapons can carry a linked ammunition item and starting quantity.
- **Spellcasting pools** sets the casting trait, starting Power Points, growth per rank, casting rule, and an optional required Edge. Match the pool name on a power’s loadout row.

The **Ancestry** dropdown lists native SWADE Ancestry items from the world and eligible compendiums. **Build or edit ancestries** opens the point tracker, native stat effects, Better Effects flags, and item grants. A world ancestry can be edited in place. Editing a compendium ancestry saves a world copy. The point target is a guide for NPC design.

- **Attribute ranges and anomalies** constrain the suggested dice. Set an anomaly chance and maximum shift to allow exceptions to those ranges. Individually edited builder values take precedence.
- **Ancestral traits** includes the Size Table, movement and running settings, Animal Smarts, Hardy, defense and recovery modifiers, Wounds, Fatigue, and Bennies.
- **Granted items** separates starting skills, Edges, Hindrances, powers, natural weapons, and other items. Pick existing items or drop them into the editor. Set starting skill dice, add the setting’s core skills, and customize a natural weapon’s damage, AP, trait, and range for the ancestry. Assign granted powers to named **Spellcasting pools**.
- **Roll tables** draws the configured results at NPC creation and appends them to the biography. It uses rolls that leave the original table intact.

Weighted options and anomalies stay fixed while you edit a draft. **Reroll preset options** under **Features** generates a new selection.

Rank sets the native SWADE rank and the Better Effects rank tag. The builder also writes the role, `extra` or `wildcard`, and any tags you enter. Better Effects continues to derive its usual flags from actor and effect data. Bestiary’s **Rank** filter combines with any other filter. Existing NPCs use their native rank when available. **Max Wounds** filters by the NPC’s prepared Wound capacity, including active effects. Set an inclusive range with the slider or the **From** and **To** dropdowns. The top step, **3+**, includes higher Wound capacities. A standard Extra has a maximum of 0 and is incapacitated by its first Wound.

In **Browse Bestiary**, use the left sidebar to search and combine filters. Leave all sources unchecked to search the world and every available compendium. Results show rank and CR side by side, rounding CR to the nearest whole number while using the precise value to sort. Automatic CR fills in for visible results, and sorting by CR calculates it for the current matches. A dash means an automatic rating is unavailable. **All selected** and **Any selected** change how selections within a detailed filter group combine.

In **Features**, select a type and use **Add New** to configure an item or actor effect in its native editor. **Add from library** browses existing features of that type. Use the eye to preview a source item. Click an added feature to reopen and edit the NPC’s copy. The Edge picker can filter by category. Better module pickers exclude the system’s Basic packs.

Use the **Size Table** next to **Resilience** to see the Toughness adjustment, Scale, Strength range, extra Wounds, and token footprint. SWADE applies relative Scale to targeted attacks. The builder applies Size and Wounds and sets the token footprint and suggested Strength. Tiny creatures get fixed Strength 1 and fixed melee damage. Better Effects enforces the Tiny melee target restriction through the roll flags. Resilience adds one or two Wounds to Extras or Wild Cards. You can edit Parry, Toughness, and Armour below the name. Clear a field to restore its derived value.

**Combat profile** sets native SWADE Hardy and initiative traits. To group followers, add the leader to the encounter first and enter the leader’s exact actor, token, or combatant name in **Follow**. Each follower joins the leader’s group and uses its Action Card when added.

Open **Movement presets** in the separate **Movement** accordion. Click a row to apply its Walk, Fly, Swim, Burrow, running die and modifier, and default movement mode. GMs can save the current fields as a new preset and edit or delete entries from the shared table.

### Attacks and spellcasting

Open **Combat profile → Attacks** to configure the preset attack, create another attack, or choose an existing weapon. The preset attack uses the same SWADE roll rules and CR calculation as other attacks. Select **None** to omit it.

The scale icon beside **Damage formula** opens the Low, Standard, and High base damage formulas for the rank. Melee formulas include the NPC’s Strength. CR evaluates AP against each reference target’s Armor and includes how often a Wild Card hits or raises. You can enter a formula directly and override CR separately.

Expand **Attack options and flags** to set raise dice, attack or damage modifiers, area templates, and Better Effects flags on the item. Weapon fields include location, Parry bonus, minimum Strength, Trademark, and Heavy Weapon. Ranged weapons also support starting shots, magazine capacity, ammo, and reload procedure.

In **Spellcasting entries**, set each entry’s name, trait, and starting pool. With Better Powers active, each entry can use its own Power Points rule or inherit the world setting. Use **Add Power** inside the entry. The power inherits the entry’s trait and Arcane value and uses its pool and casting rule. **Generate Powers** can draw a themed or random repertoire. It checks Rank and casting affordability, favors a mix of damaging and utility powers when available, and checks damaging additions against a budget based on the current draft and CR. Exploration selects non-damaging travel and scouting powers by name or Better Effects tags. Other themes also look at trappings.

## Probability and rating model

Each acing die is evaluated by its tail probability. For threshold `T > 1` on a die with `d` sides, split `T − 1` into `q` full groups of `d` and a remainder `r`. The probability of meeting the threshold is `(d − r) / d^(q + 1)`. A Wild Card keeps the better die, so the chance that both dice miss is the product of their individual miss chances. A natural double 1 is a critical failure. For instance, d6 at TN 4 succeeds 50% of the time for an Extra and 75% for a Wild Card with a d6 Wild Die, before modifiers.

The damage model convolves acing dice distributions into four-point Wound bands. It retains probability mass in the highest outcome bucket and uses a conservative tail bound of `10⁻¹⁴` for truncation that could otherwise change the outcome. As a check, a single acing d6 versus Toughness 4 has a 50% chance of Shaken or worse and a `5/36` chance of at least one direct Wound. Melee attacks target Parry. Ranged attacks and damaging powers in the benchmark use TN 4, with relative Scale. A raise adds the attack’s bonus damage dice. AP offsets Armor, and effective Toughness uses the prepared value, including values at zero or above 80.

The model reads SWADE’s prepared modifiers for the supported attack and defense paths. It handles ordinary additive damage expressions, including grouped terms and roll-data substitutions such as Strength. It also applies per-entry No Power Points from Better Powers, the native active power cost, and Unarmored Hero’s Soak bonus when enabled. A Wild Die can replace one Shooting die during rapid fire. The model applies hits before raises when resolving a volley against one target. An Extra’s single natural 1 is classified as a critical failure by the installed SWADE 6.0.4 roll. Its Wound Cap setting limits damage to four Wounds per hit in the native damage applicator.

CR averages four-exchange benchmarks against Novice, Veteran, and Legendary reference Wild Cards. Incoming attacks are evenly split between melee and short-range shots. In each exchange the model applies the incoming attack first. It tracks Wounds, Shaken, Hardy, recovery, Wound penalties, and personal Bennies. It subtracts ignored Wounds before applying the three-point penalty cap. When Wounds come in, the defender spends one available Benny on a single Soak attempt. Total Soak clears Shaken. The model assumes no shared GM Bennies, no rerolls, and an equal chance of each incoming attack type each round.

After recovery, the creature chooses the best affordable attack against one fresh target. A weapon with a higher Rate of Fire can use a single shot or a volley with recoil, whichever yields more pressure. Hits in a volley carry Wounds and Shaken forward and stop dealing damage once the target is incapacitated. The benchmark uses one action per turn and measures outgoing pressure before the target Soaks.

An encounter starts with full Power Point pools. A successful cast spends the full cost and a failed cast spends up to one point. Powers assigned to the same entry share a pool, and all pools carry their remaining points into the next round. The combat-strength score combines expected Wounds, half the probability of a lost turn from Shaken, and a small weight for turns in which an armed creature can still act.

CR maps that score onto the measured strength of five reference Wild Card PCs. The anchors are **0, 4, 8, 12, and 16 advances**. Each uses three Wounds, two personal Bennies, and a d6 Wild Die. The calibration uses combat-oriented builds, so two real PCs with the same advances can have different strengths.

| CR | Rank | Attack | Spirit / Vigor | Parry | Toughness (Armor) | Base damage |
| ---: | --- | --- | --- | ---: | --- | --- |
| 0 | Novice | d6 | d6 / d6 | 5 | 6 (1) | 2d6 |
| 4 | Seasoned | d8 | d6 / d8 | 6 | 7 (1) | d6+d8 |
| 8 | Veteran | d10 | d8 / d8 | 7 | 8 (2) | 2d8 |
| 12 | Heroic | d12 | d8 / d10 | 8 | 9 (2) | d8+d10 |
| 16 | Legendary | d12+1 | d10 / d10 | 8 | 10 (3) | 2d10, AP 1 |

The model interpolates between those scores and continues the last interval above Legendary. CR 5 matches the estimated strength of a Seasoned reference PC one advance past that rank boundary. Creatures weaker than the Novice reference display CR 0 and retain their measured strength in the encounter calculation. PCs use their recorded advances. Existing manual CR numbers keep their values and now use the advance scale.

### Reading an encounter

The GM’s initiative meter compares summed hostile and allied combat strengths. It includes grouped Extras individually and excludes defeated, incapacitated, unrated, and unaligned combatants. Dramatic Tasks have no meter. Hover over the meter for the average CR of each side and the estimated party win chance.

The chance model uses `party strength² / (party strength² + enemy strength²)`. Equal sides give 50%. A side with twice its opponent’s strength gives 80%. The marker shows the enemy’s share of the resulting odds. The five color bands divide that share at 20%, 40%, 60%, and 80%. These odds are an encounter heuristic. Cover, ammunition, positioning, surprise, gang-up, Tests, Support, initiative edges, offensive Bennies, immunities, and objectives can change the result.

## Source review

- *Savage Worlds Adventure Edition v5.4*, pp. 54, 87–96, 175–191. Primary rules for rank, Aces, Wild Dice, attacks, defenses, Wounds, Soak and creature abilities.
- *SWADE Combat Survival Guide v11*, pp. 1–2. Situational modifiers, Tests, Support and combat options illustrate what the reference encounter holds constant.
- *Companions & Familiars*, pp. 8–15 and 17–19. Its comparative work on small creatures informs sparse animal skill sets, separate movement and size choices, and editable natural attacks. Its companion point budget solves a different problem from combat threat.
- *Fantasy Bestiary Toolkit*, pp. 4–5, and *Horror Bestiary Toolkit*, monster creation and Demon sections. Both start with concept, then select the traits and signature abilities that bring it into play. The horror material illustrates how fear and exploitable weaknesses can dominate an encounter.
- *Fantasy World Builder Toolkit*, cultural and racial abilities and new spell sections. Setting-specific traits, gear and magic belong in selectable content. The older-edition stat and power assumptions were checked against the supplied SWADE core rules.
- *Wizards & Mystics*, Core Design and Starting Kit, and *Tomes & Prayers*, Power Customization and Sample Characters. These informed the separation of arcane skill, PP and the effect of a power. Conditional trappings, backlash, amplifiers and alternate casting are evaluated by the GM.
- *SWADE World Builder and Game Master’s Guide*, pp. 36–43. Its discussion of danger and unpredictability informed the finite reference scenario, the use of Wound Cap, and the clear distinction between combat threat and the stakes of a scene.
- [Pathfinder 2e Building Creatures](https://2e.aonprd.com/Rules.aspx?ID=2874&Redirected=1). Top-down role profiles, benchmark final numbers, and deliberately uneven strengths. The builder applies that design process using SWADE mechanics.
- [Savage Worlds Monster Builder](https://www.godwars2.org/SavageWorlds/monster_builder.html). The compact ordering of traits, movement, natural attacks and special abilities informs the creation flow.
- [SWADE NPC Forge](https://github.com/ephmac/swade-npc-forge-eph). Separate archetype and ancestry workflows informed the two editors.
