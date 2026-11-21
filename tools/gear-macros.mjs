// Foundry runs the serialized functions with the actor and Better Usables scope.
export async function restoreCondition(actor, {item, use, targetActor}) {
  const recipient = targetActor ?? actor;
  const config = item?.getFlag("swade-better-setting", "useDetails")?.[use?.id];
  if (!recipient?.isOwner || !["wounds", "fatigue"].includes(config?.track)) {
    return ui.notifications.warn("Use this macro from a configured restorative on an actor you own.");
  }
  const path = "system." + config.track + ".value";
  const current = foundry.utils.getProperty(recipient, path);
  if (!Number.isFinite(current) || !Number.isSafeInteger(config.amount) || config.amount < 1) return;
  const restored = Math.min(current, config.amount);
  if (restored) await recipient.update({[path]: current - restored});
  const name = foundry.utils.escapeHTML(recipient.name);
  return ChatMessage.create({speaker: ChatMessage.getSpeaker({actor: recipient}),
    content: "<p>" + name + " recovers " + restored + " " + config.track + ".</p>"},
  {messageMode: game.settings.get("core", "messageMode")});
}

export async function restorePowerPoints(actor, {item, use, targetActor}) {
  const recipient = targetActor ?? actor;
  const amount = item?.getFlag("swade-better-setting", "useDetails")?.[use?.id]?.amount;
  if (!recipient?.isOwner || !Number.isSafeInteger(amount) || amount < 1) {
    return ui.notifications.warn("Use this macro from a configured restorative on an actor you own.");
  }
  const worldNoPP = game.settings.get("swade", "noPowerPoints");
  const entries = Object.values(recipient.flags["swade-better-powers"]?.spellcastingEntries ?? {});
  const pools = recipient.system.powerPoints ?? {};
  const choices = Object.entries(pools).filter(([key, pool]) => {
    if (key.includes(".") || !Number.isFinite(pool?.max) || !Number.isFinite(pool.value) || pool.value >= pool.max) return false;
    const entry = entries.find(entry => entry.arcane?.toLowerCase() === key.toLowerCase());
    return !(entry?.noPowerPoints ?? worldNoPP);
  });
  if (!choices.length) return ui.notifications.info("There is no eligible Power Point pool to restore.");
  let key = choices[0][0];
  if (choices.length > 1) {
    const section = document.createElement("label");
    const select = document.createElement("select");
    select.name = "pool";
    for (const [name] of choices) select.add(new Option(name === "general" ? "General" : name, name));
    section.append("Power Point pool ", select);
    key = await foundry.applications.api.DialogV2.prompt({
      window: {title: "Restore Power Points"}, content: section, rejectClose: false,
      ok: {label: "Restore", callback: (_event, button) => button.form.elements.pool.value}
    });
  }
  if (!choices.some(([name]) => name === key)) return;
  const current = recipient.system.powerPoints[key];
  if (!current || !recipient.isOwner) return;
  const restored = Math.min(amount, Math.max(0, current.max - current.value));
  if (restored) await recipient.update({["system.powerPoints." + key + ".value"]: current.value + restored});
  ui.notifications.info("Restored " + restored + " Power Points.");
}

export async function clearCatalogPoisons(actor, {item, targetActor}) {
  const recipient = targetActor ?? actor;
  if (!item || !recipient?.isOwner) return ui.notifications.warn("Use the antidote on an actor you own.");
  const poisons = recipient.effects.filter(effect =>
    effect.getFlag("swade-better-setting", "gearFamily") === "catalog-poison");
  if (poisons.length) await recipient.deleteEmbeddedDocuments("ActiveEffect", poisons.map(effect => effect.id));
  ui.notifications.info(poisons.length ? "The catalog poison clears." : "The recipient has no catalog poison to clear.");
}

export async function replaceCoating(_actor, {item, use, targetItem}) {
  const behaviours = Object.values(item?.getFlag("swade-better-usables", "uses")?.[use?.id] ?? {});
  const uuid = behaviours.find(behaviour => behaviour.type === "effect")?.effectUuid;
  if (!targetItem?.isOwner || !uuid) return;
  const coatings = targetItem.effects.filter(effect =>
    effect.getFlag("swade-better-setting", "gearFamily") === "catalog-coating");
  // The linked effect is applied just before this macro. Keep the newest matching copy.
  const latest = coatings.findLast(effect => effect.getFlag("swade-better-effects", "templateUuid") === uuid);
  if (!latest) return;
  const replaced = coatings.filter(effect => effect.id !== latest.id);
  if (replaced.length) await targetItem.deleteEmbeddedDocuments("ActiveEffect", replaced.map(effect => effect.id));
}

export async function wipeCatalogCoatings(_actor, {targetItem}) {
  if (!targetItem?.isOwner) return ui.notifications.warn("Use the cloth on a weapon you own.");
  const coatings = targetItem.effects.filter(effect =>
    effect.getFlag("swade-better-setting", "gearFamily") === "catalog-coating");
  if (coatings.length) await targetItem.deleteEmbeddedDocuments("ActiveEffect", coatings.map(effect => effect.id));
  ui.notifications.info(coatings.length ? "The catalog coating is removed." : "There is no catalog coating to remove.");
}
