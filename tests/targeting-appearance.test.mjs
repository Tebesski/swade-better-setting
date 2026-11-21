import assert from "node:assert/strict";
import {test} from "node:test";
import {targetAlignment, targetingAppearance} from "../scripts/targeting-appearance.mjs";

test("self targeting uses friendly appearance regardless of source disposition", () => {
  const source = {document: {uuid: "Scene.test.Token.self", disposition: -1}};
  assert.equal(targetAlignment(source, source), "friendly");
  assert.equal(targetAlignment({document: {...source.document}}, source), "friendly");
  for (const [disposition, expected] of [[-2, "secret"], [-1, "hostile"], [0, "neutral"], [1, "friendly"]]) {
    assert.equal(targetAlignment({document: {disposition}}, source), expected);
  }
});

test("shared and per alignment crosshairs keep independent outline settings", () => {
  const settings = {targetingIcon: "ic_item_crosshair_01.svg", targetingUseOne: true,
    "targetingIcon-friendly": "ic_system_docking-align-reticle.svg",
    "targetingOutline-friendly": false, "targetingColor-friendly": "#123456"};
  const get = key => settings[key];
  assert.deepEqual(targetingAppearance(get, "friendly"), {icon: "ic_item_crosshair_01.svg", outline: false, color: "#123456"});
  settings.targetingUseOne = false;
  assert.equal(targetingAppearance(get, "friendly").icon, "ic_system_docking-align-reticle.svg");
  settings["targetingColor-friendly"] = "invalid";
  assert.equal(targetingAppearance(get, "friendly").color, "#60d878");
});
