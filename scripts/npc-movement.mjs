import {MODULE_ID} from "./skills.mjs";
import {MOVEMENT_MODES, movementLibrary} from "./npc-presets.mjs";

const {ApplicationV2, HandlebarsApplicationMixin} = foundry.applications.api;

export class MovementTable extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["sbs-setting-dialog", "sbs-npc-table"],
    position: {width: 690, height: 450},
    window: {title: "Movement Presets", icon: "fa-solid fa-person-running", resizable: true},
    actions: {
      apply: async function (_event, button) {
        await this.builder.applyMovement(button.dataset.key);
        await this.close();
      },
      edit: async function (_event, button) {
        try { await this.builder.editMovement(button.dataset.key); if (this.rendered) await this.render(); }
        catch (error) { ui.notifications.error(error.message); }
      },
      remove: async function (_event, button) {
        try { await this.builder.removeMovement(button.dataset.key); if (this.rendered) await this.render(); }
        catch (error) { ui.notifications.error(error.message); }
      }
    }
  };
  static PARTS = {table: {template: `modules/${MODULE_ID}/templates/npc-movement-table.hbs`, scrollable: [".sbs-size-table-scroll"]}};

  constructor(builder) {
    super();
    this.builder = builder;
  }

  async _prepareContext() {
    const rows = movementLibrary().map(row => ({...row, mode: MOVEMENT_MODES[row.paceBase]}))
      .sort((a, b) => a.label.localeCompare(b.label));
    return {rows, canManage: game.user.isGM};
  }
}
