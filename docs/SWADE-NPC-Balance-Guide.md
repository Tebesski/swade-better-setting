# Building balanced SWADE NPCs with Better Setting

**Instructions for Codex · Savage Worlds Adventure Edition v5.4 · Better Setting for Foundry v14 · audited 23 November 2026**

Use this reference when designing NPCs, reviewing a stat block, or budgeting an encounter. **Rank** governs advancement and access to abilities. **Creature Rating (CR)** is Better Setting’s index of direct combat strength, expressed in equivalent PC advances. The SWADE rules supply the dice and combat mechanics. Better Setting supplies the reference PCs, the four-round benchmark, the CR scale, and the encounter estimate.

## 1. Start with the encounter

1. Establish the party’s headcount, advances, usual attacks, typical Parry and Toughness, armor, and remaining resources. Count friendly NPCs that will participate. If only rank is known, use the first advance of that rank and disclose the assumption.
2. State what each side needs to achieve and how many rounds it has. Holding a gate for three rounds calls for a different opponent from hunting someone to incapacitation. Record starting distance, cover, lighting, surprise, and who can realistically reach whom.
3. Give the NPC one job, one credible way to do it, and one weakness a player can exploit. A guard might delay intruders with decent Parry and a shield while remaining vulnerable to Tests. A scout might outrun the party without posing much direct danger.
4. Choose Extra or Wild Card deliberately. For an elite subordinate, first consider a Resilient Extra. For a recurring antagonist who should make reliable Trait rolls, start with a Wild Card. **Resilient and Very Resilient are exclusive to Extras.** An ordinary Wild Card can take three Wounds. Additional Wounds from Size are a separate rule.
5. Build the actor, read its automatic CR and coverage, then test its opening move against a representative party member. Give a numerical CR as verified only when calculated from the actual profile. If working from this attachment alone, label a reference comparison as an estimate and name the closest profile.

## 2. Use these reference PCs to interpret CR

These are the module’s reproducible calibration fixtures. Actual PCs with the same number of advances can differ considerably. Each reference is normal Size, has three Wounds and three personal Bennies, rolls a d6 Wild Die, and has a melee and a ranged attack with the listed skill and damage. Toughness includes armor.

| Rank | Advances at anchor | Attack skill | Spirit / Vigor | Parry | Toughness (armor) | Base damage / AP | Strength relative to a Novice |
|---|---:|---|---|---:|---|---|---:|
| Novice | 0 | d6 | d6 / d6 | 5 | 6 (1) | 2d6 / 0 | 1.000 |
| Seasoned | 4 | d8 | d6 / d8 | 6 | 7 (1) | d6+d8 / 0 | 1.454 |
| Veteran | 8 | d10 | d8 / d8 | 7 | 8 (2) | 2d8 / 0 | 2.187 |
| Heroic | 12 | d12 | d8 / d10 | 8 | 9 (2) | d8+d10 / 0 | 2.987 |
| Legendary | 16 | d12+1 | d10 / d10 | 8 | 10 (3) | 2d10 / 1 | 4.338 |

The table uses the standard uncapped wound rule. Enabling Wound Cap recalibrates the five strengths to approximately 1.000, 1.454, 2.185, 2.984, and 4.334. The rank boundaries stay at 0, 4, 8, 12, and 16 advances.

**Read CR 4 as equivalent to the reference Seasoned PC’s overall benchmark score.** CR 5 represents one further advance and corresponds to about 1.637 Novice units without Wound Cap. A Seasoned NPC can score below 4 if its advances represent healing, research, or social skills. This is expected. Keep the rank and describe what those skills accomplish.

## 3. Construct the NPC

| Decision | How to use it |
|---|---|
| Archetype and primary skill | Choose the skill the NPC is known for. The builder scales this focus with rank and uses it for appropriate attacks or casting. Check the actual attack trait separately. A healer’s high Healing die does not raise their chance to hit with a staff. |
| Attributes and skills | Start near the appropriate reference, then redistribute toward the concept. Give a bruiser Strength and Fighting, a sentry Notice, and a negotiator Persuasion. Check the linked attribute and any custom archetype settings. A Wild Die already improves reliability substantially. |
| Attacks | Specify a readied weapon or a damaging power, its trait, base formula, AP, and any raise die. Use the builder’s Low, Standard, and High formulas as starting choices. Check actual chances against the party before increasing a die. An extra attack option supplies flexibility. An ability that grants an extra attack changes action economy. |
| Defenses | Begin with SWADE’s derived Parry and Toughness. Verify the sheet totals after applying armor, Size, shield, and special abilities. AP bypasses only armor. A counter based on Heavy Weapons is useful only if the party can actually access one. |
| Wounds and Soak | Standard, Resilient, and Very Resilient Extras take 0, 1, and 2 Wounds respectively before a further Wound incapacitates them. A Wild Card starts at 3. Large, Huge, and Gargantuan add 1, 2, and 3 respectively when size-derived Wounds apply. Hardy prevents a second damage-induced Shaken from converting to a Wound. A direct damage raise can still wound a Hardy creature. |
| Powers | Assign the correct casting entry, trait, PP pool or No Power Points rule, and effective cost. Give the NPC a plausible second action when its pool runs dry. Describe likely template coverage, resistance, duration, escape options, and what changes on a raise. Include a utility spell because it fits the role, independent of its contribution to CR. |
| Features and flags | Enter features as actual items/effects and set required Better Effects flags, including rank and relevant attack flags. Verify their predicates on an intended target. A tag naming an ability does not, by itself, supply its mechanical effect or raise automatic CR. |

To tune difficulty, change **one cause** and recalculate. If the attack rarely connects, change accuracy, engagement range, or access to the target. If it connects but rarely Shakes, change damage or suitable AP. If a creature disappears before acting, examine positioning, Parry, Toughness, Soak, or Extra Resilience. If it takes too long to defeat but is barely dangerous, adding more armor will prolong the same problem.

## 4. Check the dice before trusting the rating

For a die with `s` sides that Aces and an integer threshold `t > 1`, set `q = floor((t−1)/s)` and `r = (t−1) mod s`. The probability of reaching the threshold is `(s−r)/s^(q+1)`. For an attack modifier `m`, use `t = TN−m`. A Wild Card rolls the Trait die and Wild Die, keeps the higher, and applies the modifier once. With independent dice the unadjusted hit probability is `1−(1−P_trait)(1−P_wild)`. Enforce automatic failures when bonuses would otherwise make every result succeed. A d12+1 is an acing d12 with a flat +1.

- A d6 Extra succeeds at TN 4 half the time. A d6 Wild Card with a d6 Wild Die succeeds 75% of the time and reaches 8 about 25.85% of the time. The Wild Die changes accuracy, raises, recovery, and Soak. It is never an extra damage die simply for being a Wild Card.
- For a normal melee attack use the defender’s Parry. For a normal shot use TN 4, then account for applicable modifiers. For attacks subject to Scale, use the target’s Scale modifier minus the attacker’s. In a real encounter, check range, cover, illumination, and situational Edges separately.
- A hit that raises usually adds one acing d6 to damage. Against Toughness 7, totals of 7–10 Shake, 11–14 cause one Wound, and 15–18 cause two. The calculation uses `effective Toughness = Toughness − min(max(AP, 0), armor)`. Against 7 (1), raising AP from 1 to 4 gives no additional benefit. Heavy Armor also has a Heavy Weapon requirement.
- Soak uses Vigor. A success cancels one Wound and each raise cancels another. Apply penalties from earlier Wounds, then apply any newly sustained Wounds after the roll. Soaking all the Wounds also clears Shaken. Track Wounds **and** opportunities to act when comparing foes.
- For a damaging power, distinguish activating it from hitting or affecting a target. An activation of 4+ spends the full allocated cost even if the target is missed or resists. A failed standard activation normally costs one PP. With No Power Points the casting penalty is `−ceil(total PP cost/2)`, so 3 and 4 PP both give −2. Check any power-specific exception.

## 5. How Better Setting calculates automatic CR

1. Prepare the Foundry actor. Read derived defenses, readied attacks, usable damaging powers, traits and active supported modifiers, Wound capacity, personal Benny capacity, Spirit, and Vigor. The calculator models a fresh combatant. For a PC the tracker normally uses its recorded advances. An explicit CR override takes precedence.
2. Benchmark the NPC separately against the Novice, Veteran, and Legendary references. In each of four rounds a reference opponent makes one incoming attack, sampling melee and ranged equally. The NPC may be Shaken, wounded, incapacitated, or able to act. It spends a personal Benny to attempt a Soak on each wounding hit while it can. Its Spirit recovery and attack accuracy reflect prior Wounds.
3. On an available turn, choose the affordable attack with the highest immediate expected single-target pressure. Follow each casting entry’s remaining pool across rounds. A ranged volley uses its RoF and recoil, and a Wild Card can replace one Shooting die with its Wild Die. The model can prefer a single shot. Alternative attacks do not all fire together.
4. For each attack, enumerate the damage distributions, including Aces. Score Wounds up to incapacitation and add half the probability-weighted loss of the target’s next action to Shaken. For that turn’s outgoing comparison the target starts fresh, without defensive Benny spending. Incoming attacks, recovery, and the NPC’s resources do carry over between rounds. The reference opponent continues to exert pressure throughout the benchmark.
5. Each benchmark score is the four-round expected outgoing pressure plus 0.1 per expected acting turn for a profile with an attack. Average the three scores. Divide by the Novice reference’s score to get relative strength. The four rounds, equal weighting, half-action Shaken weight, and 0.1 activity credit are design choices.
6. Below Novice, raw CR is `log2(max(0.25, strength))`. Above Novice, linearly interpolate between adjacent measured strengths and continue the last interval past Legendary. Display uses the nearest whole CR, with a half-step available between 0 and 1 and a floor of −2. The tracker retains continuous strength for automatically rated NPCs. Two creatures both displaying CR −2 can therefore contribute different budgets.

A manually assigned CR uses the **reference** strength at that CR. Manual −2, −1, 0, and ½ mean approximately 0.25, 0.50, 1.00, and 1.057 Novice units. Changing only the manual CR alters the tracker’s estimate. To make the creature itself stronger or weaker, edit its actual capabilities.

## 6. Budget the encounter, then test the matchup

Sum active Friendly strength as `P` and active Hostile and Secret strength as `E`. Neutral units sit outside this calculation. Defeated and incapacitated combatants contribute no active strength. Count every participating token, including linked Extras. The tooltip’s average CR is descriptive. Use summed strength for the budget.

The tracker normally forecasts the specific matchup. It samples 2,048 fights using the active actors’ actual attacks and defenses, Wounds, Fatigue, Shaken status, remaining personal Bennies and current PP in each casting pool. At the start of each fight, each side picks a random target order for focused fire. Every round shuffles initiative, keeping combatants in the same Foundry initiative group together. Each actor gets one action and chooses its strongest affordable modeled attack against the first target it can affect. Soaking spends one personal Benny per wounding hit. A casualty immediately loses any remaining turn. This assumes targets are in reach and the goal is incapacitation. Terrain, initiative Edges and Jokers, gang-up bonuses, movement, area coverage, summons, and control tactics require a GM judgment.

The percentage is the share of trials the party won. The tooltip reports fights still undecided at 100 rounds or when both sides have exhausted their damaging options. If assigning those outcomes either way would change the threat band, the tracker displays **Inconclusive**. Its bands begin at 0% Low, 20% Moderate, 40% High, 60% Severe, and 80% Extreme. No active opposition gives None. Missing party information gives an unknown estimate. A friendly roster entirely down against active opposition gives Extreme.

For planning from stat blocks alone, the **CR budget** gives `party win estimate = P²/(P²+E²)` and `threat = E²/(P²+E²)`. The tracker uses this budget when a GM supplies a manual CR on an active actor, a combatant lacks a modeled attack, the roster exceeds 32 active combatants, or the simulation is unavailable. The tooltip identifies the method and discloses its CR −2 fallback for unrated combatants. A manual override is useful when a monster’s principal threat is outside the direct-damage forecast.

**Worked budget.** Two PCs with four advances each give `P ≈ 2.907`. One reference-strength CR 4 opponent gives `E ≈ 1.454`. The budget gives 80% party win and 20% threat, the Moderate boundary. Adding another CR 4 opponent brings both sides level at 50% by budget. The matchup forecast also accounts for who gets to act and how quickly a side can lose combatants.

**Independent check.** The CR budget column uses the full reference profiles. For the matchup and independent columns, both sides have only their reference melee attack available, focus fire, shuffle initiative each round, and spend personal Bennies only on Soak. The matchup column uses the same background calculation as the tracker. The independent column rolls the dice directly in a separate implementation with 20,000 seeded fights per row. There were no draws.

| Friendly side vs opposition | CR budget | Matchup forecast | Independent party wins |
|---|---:|---:|---:|
| Reference Novice vs identical Novice | 50.0% | 49.3% | 49.8% |
| Reference Seasoned vs Novice | 67.9% | 85.1% | 84.4% |
| Reference Novice vs Veteran | 17.3% | 3.5% | 4.3% |
| Reference Novice vs two ordinary Extras | 78.5% | 66.5% | 67.0% |
| Reference Novice vs four ordinary Extras | 47.8% | 11.9% | 13.0% |

The sample Extras use the Novice reference’s attack die, damage, and defenses, without Wild Dice, Wound capacity, or personal Bennies. Each measures about 0.261 Novice units in the original budget. The maximum approximate 95% sampling margin is ±2.2 percentage points for the tracker and ±0.7 for the independent check. **These margins describe dice sampling under fixed assumptions.** They do not capture uncertainty from positioning or player decisions. For example, four Extras attacking in a corridor may reach a defender one at a time. In an open room they may all concentrate on the defender in the same round.

## 7. Decide when judgment is required

| Feature or situation | Check before using the displayed CR |
|---|---|
| Templates, auras, multiple actions, summoned allies | Estimate how many targets or extra turns are plausible from the actual starting positions. Check one favorable and one unfavorable arrangement. |
| Stun, entangle, fear, Tests, Support, healing | Identify the resistance roll, the escape window, and which ally benefits. Estimate actions denied or restored across the encounter. A noncombat specialist can be unrated while its allies become much more dangerous. |
| Heavy Armor, immunity, flight, regeneration, intangibility | List the party’s working counters and who can use them. Losing the sole counter can decide the fight regardless of average CR. |
| Opponent has high AP, low Strength, ammunition limits, or reloads | Compare its gear against actual armor, minimum Strength, starting ammunition, and the number of volleys feasible over four turns. The benchmark does not schedule reload actions. |
| Better Effects predicates, power modifiers, area templates, additional actions | Inspect the actual trigger, frequency, targets, and damage. Run one legal opening sequence with and without the trigger. Coverage marked Partial identifies a reason to inspect the actor. |
| Attrition, terrain, initiative Edges, or an unusual victory condition | The matchup forecast uses current Wounds, Shaken, Fatigue, personal Bennies, and PP. Assess position, initiative advantages, escape routes, and objectives separately. |

Keep a manual override with a one-sentence justification when the automatic comparison misses a persistent ability that matters across this campaign. For a one-scene advantage such as an ambush, annotate that encounter instead. After play, record rounds fought, NPC actions taken, heroes incapacitated, and Bennies spent. Compare similar encounters before changing a recurring NPC’s rating.

## 8. Return a usable result to the GM

Give the NPC’s name, purpose, rank, Extra/Wild Card status, attributes, important skills, derived defenses, Wound capacity, Bennies, readied attacks and powers, relevant flags, and a short opening tactic. Report the **calculated or estimated CR**, coverage, and the comparison used. For a specified party, include its active budget, the threat band, the biggest matchup uncertainty, and one concrete adjustment that preserves the concept.

**Example interpretation.** In the audited Foundry world, the default Seasoned Wild Card caster measured CR 3, and the value on the created actor agreed with the builder preview. For a requested Seasoned caster, keep that measured result unless CR 4 is a design requirement. For a CR 4 commission, try one change to casting accuracy, staying power, or the damaging action, then measure again. An extra utility spell can make the character more interesting without moving the single-target benchmark.

## Verification and sources

- The underlying rules reference is *Savage Worlds Adventure Edition*, v5.4, printed pp. 54 (advances), 88–89 (Trait rolls and Bennies), 94–96 (damage, Shaken, Wounds, Soak), 106 (Scale), 140–141 (optional setting rules), 151 (power activation), and 178–179 (Resilient and Size). The CR curve and tracker percentages belong to Better Setting.
- In a Better Setting checkout, the engine is in `scripts/npc-math.mjs`, the Foundry adapter and source builder in `scripts/npc-data.mjs`, and the tracker in `scripts/npc-tools.mjs`. Use `node --test tests/npc-math.test.mjs` for mathematical regressions and `node tools/check-npc-matchups.mjs` to reproduce the independent comparison. Both run from the module root.
