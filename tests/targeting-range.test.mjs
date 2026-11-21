import assert from "node:assert/strict";
import {test} from "node:test";
import {parseTargetRange, rangeBand, rangeNumber, rangeValues} from "../scripts/targeting-range.mjs";

test("target ranges resolve attribute dice and deterministic expressions without evaluating code", () => {
  const values = rangeValues({system: {attributes: {
    spirit: {die: {sides: 8, modifier: 0}},
    smarts: {die: {sides: 14, modifier: 1}}
  }}}, {spirit: "Spirit", smarts: "Smarts"});
  assert.deepEqual(parseTargetRange("@spi", values), [8]);
  assert.deepEqual(parseTargetRange("Smarts x2", values), [28]);
  assert.deepEqual(parseTargetRange("(@spi + 1) × 2", values), [18]);
  assert.deepEqual(parseTargetRange("6/12/18", values), [6, 12, 18]);
  assert.deepEqual(parseTargetRange("@spi/(@spi*2)/(@spi*3)", values), [8, 16, 24]);
  assert.deepEqual(parseTargetRange('12″', values), [12]);
  assert.equal(parseTargetRange("Self"), null);
  assert.equal(parseTargetRange("Touch"), null);
  for (const text of ["globalThis.alert(1)", "1d6", "@unknown", "6/0", "0", "-4", "1;2", "(()", "1+"]) {
    assert.equal(rangeNumber(text, values), null, text);
  }
});

test("range bands include boundaries and a single range has a clear out-of-range state", () => {
  assert.equal(rangeBand(6, [6, 12, 18]), "short");
  assert.equal(rangeBand(6.1, [6, 12, 18]), "medium");
  assert.equal(rangeBand(12, [6, 12, 18]), "medium");
  assert.equal(rangeBand(12.1, [6, 12, 18]), "long");
  assert.equal(rangeBand(30, [6, 12, 18]), "long");
  assert.equal(rangeBand(6, [6]), "short");
  assert.equal(rangeBand(7, [6]), "long");
});
