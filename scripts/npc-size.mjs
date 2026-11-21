import {t as sbsI18n} from "./i18n.mjs";
// Transcribed from the Size Table supplied by the user. These are the rules
// reference values; token footprints continue to use the requested HUD ranges.
const SIZE_GROUPS = [
  [sbsI18n("swade-better-setting.UI.Tiny_37616f6478"), [
    [-4, "1", "−6", "6″", "<4 lbs", sbsI18n("swade-better-setting.UI.Crowmouse_49f6cfd300")],
  ]],
  [sbsI18n("swade-better-setting.UI.VerySmall_f151740336"), [
    [-3, "d4−3", "−4", "18″", "16 lbs", sbsI18n("swade-better-setting.UI.Housecatsmalldogs_cf92de53eb")],
  ]],
  [sbsI18n("swade-better-setting.UI.Small_5263293fc2"), [
    [-2, "d4−1", "−2", "3′", "32 lbs", sbsI18n("swade-better-setting.UI.Coyotebobcatporcupine_3d972bebdd")],
  ]],
  [sbsI18n("swade-better-setting.UI.Normal_a7248eeb45"), [
    [-1, "d4 to d6", "—", "4′", "125 lbs", sbsI18n("swade-better-setting.UI.Childwolfhalffolkgoblin_c228b92329")],
    [0, "d6 to d12", "—", "6′", "250 lbs", sbsI18n("swade-better-setting.UI.HumanGreatDanedirewolf_be662cf8e8")],
    [1, "d8 to d12+1", "—", "8′", "500 lbs", sbsI18n("swade-better-setting.UI.Largehumangorillalionorc_7f00e87d23")],
    [2, "d10 to d12+2", "—", "9′", "1000 lbs", sbsI18n("swade-better-setting.UI.Grizzlyhorseogretigershark_70f5f89034")],
    [3, "d12 to d12+3", "—", "12′", "2000 lbs", sbsI18n("swade-better-setting.UI.Bullwarhorse_09ddc632a8")],
  ]],
  [sbsI18n("swade-better-setting.UI.Large1Wound_b1c37eb51b"), [
    [4, "d12+1 to d12+4", "+2", "15′", "2 tons", sbsI18n("swade-better-setting.UI.Hippogreatwhiteshark_360f6b94ac")],
    [5, "d12+2 to d12+5", "+2", "18′", "4 tons", sbsI18n("swade-better-setting.UI.Whiterhinobelugawhale_0af6e0e11d")],
    [6, "d12+3 to d12+6", "+2", "24′", "8 tons", sbsI18n("swade-better-setting.UI.Africanelephantdrakeorca_21c022f7d7")],
    [7, "d12+4 to d12+7", "+2", "30′", "16 tons", sbsI18n("swade-better-setting.UI.TRextriceratops_1b3478c3a3")],
  ]],
  [sbsI18n("swade-better-setting.UI.Huge2Wounds_ba5d6ea01c"), [
    [8, "d12+5 to d12+8", "+4", "36′", "32 tons", sbsI18n("swade-better-setting.UI.Dragonspermwhale_dc44f4f1ee")],
    [9, "d12+6 to d12+9", "+4", "50′", "64 tons", sbsI18n("swade-better-setting.UI.Humpbackwhale_21ad0dd841")],
    [10, "d12+7 to d12+10", "+4", "63′", "125 tons", sbsI18n("swade-better-setting.UI.Bowheadwhale_251cf91952")],
    [11, "d12+8 to d12+11", "+4", "75′", "250 tons", sbsI18n("swade-better-setting.UI.Bluewhale_e394083542")],
  ]],
  [sbsI18n("swade-better-setting.UI.Gargantuan3Wounds_c692555959"), [
    [12, "d12+9 to d12+12", "+6", "100′", "500 tons", sbsI18n("swade-better-setting.UI.Kaijuorgiantmonsters_35950cf30f")],
    [13, "d12+10 to d12+13", "+6", "125′", "1K tons", ""],
    [14, "d12+11 to d12+14", "+6", "150′", "2K tons", ""],
    [15, "d12+12 to d12+15", "+6", "200′", "4K tons", ""],
    [16, "d12+13 to d12+16", "+6", "250′", "8K tons", ""],
    [17, "d12+14 to d12+17", "+6", "300′", "16K tons", ""],
    [18, "d12+15 to d12+18", "+6", "400′", "32K tons", ""],
    [19, "d12+16 to d12+19", "+6", "500′", "64K tons", ""],
    [20, "d12+17 to d12+20", "+6", "600′", "125K tons", ""],
  ]],
];

export function tokenFootprint(size) {
  if (size <= -3) return 0.5;
  if (size === -2) return 0.8;
  if (size <= 1) return 1;
  if (size <= 5) return 2;
  if (size <= 8) return 3;
  if (size <= 11) return 4;
  if (size === 12) return 5;
  return 6;
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  return node;
}

export function renderSizeReference({select, selected} = {}) {
  const content = element("div");
  content.className = "size-reference-content";
  content.append(element("p", sbsI18n("swade-better-setting.UI.Usemassandoveralldimensionsto_ad38b01010")));
  const tiny = element("p", sbsI18n("swade-better-setting.UI.TinycreatureshaveStrength1and_929bcb53e8"));
  tiny.className = "size-reference-note";
  content.append(tiny);
  const table = element("table");
  table.setAttribute("aria-label", sbsI18n("swade-better-setting.UI.SizeTable_a85aa336bb"));
  const head = element("thead");
  const headings = element("tr");
  for (const text of [sbsI18n("swade-better-setting.UI.SizeToughnessBonus_8690f988df"), sbsI18n("swade-better-setting.UI.TypicalStrengthRange_ebdf235a43"), sbsI18n("swade-better-setting.UI.ScaleModifier_c8ceaa006f"), sbsI18n("swade-better-setting.UI.TypicalHeightLengthUpTo_0c84bec98e"), sbsI18n("swade-better-setting.UI.MassUpTo_51fb1a5810"), sbsI18n("swade-better-setting.UI.ExampleCreatures_30ff68878e")]) {
    const cell = element("th", text);
    cell.scope = "col";
    headings.append(cell);
  }
  head.append(headings);
  table.append(head);
  for (const [label, rows] of SIZE_GROUPS) {
    const body = element("tbody");
    const group = element("tr");
    group.className = "size-group";
    const heading = element("th", label);
    heading.colSpan = 6;
    heading.scope = "rowgroup";
    group.append(heading);
    body.append(group);
    for (const values of rows) {
      const row = element("tr");
      row.dataset.size = String(values[0]);
      values.forEach((value, index) => {
        const cell = element(index === 0 ? "th" : "td", value);
        if (index === 0) cell.scope = "row";
        row.append(cell);
      });
      body.append(row);
    }
    table.append(body);
  }
  if (select) {
    content.classList.add("sbs-size-picker-content");
    content.firstElementChild.textContent = sbsI18n("swade-better-setting.UI.Sizedirectlyaffectsseveralcoremechanics_2ab83595c0");
    table.tHead.rows[0].firstElementChild.textContent = sbsI18n("swade-better-setting.UI.SizeToughness_9a26868750");
    for (const row of table.querySelectorAll("tr[data-size]")) {
      const size = Number(row.dataset.size);
      const control = element("button", size);
      control.type = "button";
      control.setAttribute("aria-label", sbsI18n("swade-better-setting.UI.ChooseSize_c471b6bb2c", {p0: (size)}));
      if (size === selected) control.setAttribute("aria-current", "true");
      control.addEventListener("click", () => select(size));
      row.firstElementChild.replaceChildren(control);
      row.append(element("td", `${tokenFootprint(size)} × ${tokenFootprint(size)}`));
    }
    table.tHead.rows[0].append(element("th", sbsI18n("swade-better-setting.UI.TokenSpaces_2d9ede713d")));
    for (const row of table.querySelectorAll(".size-group")) row.firstElementChild.colSpan++;
    const scroll = element("div");
    scroll.className = "sbs-size-table-scroll";
    scroll.append(table);
    content.append(scroll);
  } else {
    content.append(table);
  }
  return content;
}

