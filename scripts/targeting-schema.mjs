const extended = new WeakSet();

export function extendTargetingSchemas(models, StringField) {
  for (const [type, Model] of Object.entries(models)) {
    if (extended.has(Model)) continue;
    const defineSchema = Model.defineSchema;
    // Preserve the actual system class. Its validators can capture private
    // static methods, which cannot be invoked with a replacement subclass.
    Object.defineProperty(Model, "defineSchema", {configurable: true, writable: true, value() {
      const schema = defineSchema.call(Model);
      if (["consumable", "action"].includes(type) && !schema.range)
        schema.range = new StringField({initial: "", label: "SWADE.Range._name"});
      const fields = schema.actions?.fields?.additional?.element?.fields;
      if (fields && !fields.range) fields.range = new StringField({initial: "", required: false});
      return schema;
    }});
    if (Object.hasOwn(Model, "_schema")) delete Model._schema;
    extended.add(Model);
  }
}
