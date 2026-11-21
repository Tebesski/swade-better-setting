# SWADE Better Setting

## Gear, Effects, and Macros compendiums

Open **Compendiums** and look for **Better Setting - Gear**, **Better Setting - Effects**, and **Better Setting - Macros**. Enable Better Effects and Better Usables for alchemy, and Grid Inventory for containers and attachments. Enable Better Money for the physical currency that fills coin purses and cashboxes.

- Drag Gear onto an actor. The **Wayfarer's Twin Flask** offers two ways to spend a shared supply. **Stormglass Capacitor** has two independently rechargeable pools. The **Pilgrim's Trial** posts a trait request with a penalty and a description that follows the roll.
- Use a poison after the GM confirms exposure. Select its recipient in Better Usables. The catalog poisons use Better Effects' combat-turn requests for recovery. Any damage goes through normal damage resolution. Use **Silver-Sage Antidote** on a recipient you own to clear the catalog poisons and their linked conditions.
- Use or drop a coating onto an owned weapon. Catalog coatings stay on that weapon until replaced or removed with **Alchemist's Wiping Cloth**. Target-specific finishes and elemental wards follow Better Effects flags. For example, Grave-Silver Oil checks for the target's **undead** or **lycanthrope** flag.
- Equip **Rook's Draw Belt**, attach a **Shortblade Sheath** and a **Glasskeeper Dose Pouch**, then stow the **Rook's Sideknife** and your vials. Use the **Foldspace Expedition Pack** for reduced contents weight or the **Quartermaster's List Chest** for weight-limited list storage. The wallet accepts physical money and tagged paperwork.
- The included Usables macros work from their configured gear and update actors or items the user owns. The gear links to its original Effect and Macro entries.

The prices and effects are original catalog defaults. Import entries into your world to customize them.

From a source checkout, stop Foundry and run **npm ci** and **npm run packs:build** to generate the LevelDB packs. Release archives include them. [Foundry's compendium documentation](https://foundryvtt.com/article/compendium/)

## Porcelain theme

Open **Game Settings → Configure Settings → SWADE Better Setting → Change theme**. Each theme selector offers **Default** and **White (Porcelain)**. Changes apply as you choose them.

Choose a theme separately for standard SWADE sheets and roll dialogs, Better Setting, Better Templates, Better Powers, and Better Effects. The preferences are personal and update open windows when saved. An embedded panel set to Default follows the appearance of its host sheet. Chat messages retain their existing theme.

With SWADE Better Subsystems enabled, use **Subsystems → Chase theme** to set the appearance of the Chase board, manager, and dialogs.

## Advanced targeting

Enable **Advanced targeting** in Better Setting settings. The **Advanced targeting crosshair** accordion offers live previews, a shared crosshair or separate icons for each alignment, outline toggles and colors, and an optional subtle hover pulse. Self-targeting uses Friendly appearance. These preferences are per user and targeting starts disabled. With no existing targets, weapon attacks and their defined actions, ranged powers and consumables, and HUD Test or Support pause for a target. Weapons also use targeting with an empty Range field. Left-click selects one token and continues. Hold Shift while selecting tokens, then release Shift to continue with the selection. Right-drag pans the canvas, and Escape cancels targeting.

The crosshair and selected tokens use the configured disposition colors. A range indicator appears while hovering over a token when the action has a parsed range, colored green, orange, or red for its increment. The HUD distance overlay pauses during Advanced targeting. Ranges accept numbers, short/medium/long notation, and deterministic attribute expressions such as **@spi** or **Smarts × 2**. Set **Range** in a consumable's sidebar or in an item's additional action to supply an action-specific range. A visible token for the acting actor must be on the current scene.

## Better Party Sheet

SWADE Group actors use **Better Party Sheet** by default and are pinned above actors and folders. If the world has no group yet, the GM can choose **Create Party** at the top of the Actors directory. Existing Group members, supplies, currency, stash, and description are reused.

The GM can mark one sheet as **Current Party**. Press **P** to open or close it if you have permission to view it. You can change the shortcut under **Configure Controls**.

- **Overview** shows the best listed skill dice and each visible member's Wounds, Fatigue, Bennies, defenses, and Pace. Hover over a portrait to enlarge it or over a party skill to see who has that rating. Drag an actor onto the party sheet or use **Add Member**. Roll individual skills and attributes for members you own. GMs left-click a Benny stack to give one and right-click to remove one.
- **Exploration** shows the slowest ground Pace and the shared SWADE supply levels. Party editors can record an activity for each member.
- **Stash** shows party totals, individual wallets, and searchable shared gear. With Better Money, open a member's wallet or add, spend, and transfer shared currency. Gear contributes to wealth in the primary currency, and other currencies are listed separately. **Notes** uses the Group description.
- When **SWADE Grid Inventory** is active, the GM can choose **Use Grid Inventory** in Stash. The first switch creates a 5×5 vault for every player character in the party. Select a vault in **Upgrades** to view it by itself, or **Party Stash** to see every vault. Right-click a vault in **Upgrades** to open its sheet. Upgrade slots can have an optional name and accept containers by item type or flag.
- The GM can use **Unplaced items** next to **Add upgrade slot** to place loose gear, including gear from older shared grids and gear recovered when a vault is removed. Switching to List inventory keeps existing vaults.
- Only the GM can change vault access and ownership. Player overrides take precedence over the Ownership default. Limited viewers see item pictures in public vaults. Observers can open item sheets and Owners can move gear. Viewers without access see a locked vault with a Private tooltip. To move gear between vaults, drag it to a grid or its entry in **Upgrades** while you have Owner access to both.

The sheet follows **SWADE sheet and roll theme**. Give players Observer access to the Group and to the members whose stats they should see.

## Localization

User-facing strings are registered with Foundry in each module’s `lang/en.json`. This applies to Better Setting, Better Templates, SWADE HUD, Better Effects, Better Powers, Better Called Shots, Better Subsystems, Better Money, Grid Inventory and Better Usables. Existing system translation keys remain in use.

New entries use the module ID followed by `.UI.` and a stable descriptive key. Preserve `{p0}`, `{p1}` and other named parameters when translating; their order may change within the translated sentence. Keep internal identifiers, document UUIDs, formulas, action codes and existing world content unchanged. CSS description placeholders also resolve through the dictionaries.

To add a language, copy the English dictionary, translate its values, and register its language/path in that module’s `module.json` `languages` array. JavaScript uses `scripts/i18n.mjs`; Handlebars templates use Foundry’s `localize` helper. The JavaScript helper supports English fallback before game initialization and escapes translated HTML attribute values.

Run `npm run check:localization` from Better Setting to check all ten installed modules for JavaScript syntax, dictionary references and language registration. `tests/localization.test.mjs` checks fallback, substitutions and safe attribute output across the ten helpers.
