import assert from "node:assert/strict";
import {test} from "node:test";
import {extendTargetingSchemas} from "../scripts/targeting-schema.mjs";

test("targeting preserves system model identity and private static validators", () => {
  class EdgeData {
    static #valid(value) { return value === 0; }
    static defineSchema() {
      return {requirements: {validate: value => this.#valid(value)},
        actions: {fields: {additional: {element: {fields: {}}}}}};
    }
  }
  class ConsumableData { static defineSchema() { return {}; } }
  class StringField { constructor(options) { this.options = options; } }
  const models = {edge: EdgeData, consumable: ConsumableData};
  extendTargetingSchemas(models, StringField);
  assert.equal(models.edge, EdgeData);
  const schema = EdgeData.defineSchema();
  assert.equal(schema.requirements.validate(0), true);
  assert.ok(schema.actions.fields.additional.element.fields.range instanceof StringField);
  assert.ok(ConsumableData.defineSchema().range instanceof StringField);
  const wrapped = EdgeData.defineSchema;
  extendTargetingSchemas(models, StringField);
  assert.equal(EdgeData.defineSchema, wrapped);
});
