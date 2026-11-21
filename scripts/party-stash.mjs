import {t as sbsI18n} from "./i18n.mjs";
import {partyDepositVaults} from "./party-vaults.mjs";

const MONEY = "swade-better-money";
const MONEY_ITEM = MONEY + ".money";
const CONTAINER = "swade-grid-inventory.container";
const categories = [
  ["weapons", sbsI18n("swade-better-setting.UI.WeaponsShields_1775a3ab1b"), "weapon"], ["armor", sbsI18n("swade-better-setting.UI.Armor_a592855d05"), "armor"], ["equipment", sbsI18n("swade-better-setting.UI.Equipment_7f2465ac7c"), "gear"],
  ["consumables", sbsI18n("swade-better-setting.UI.Consumables_7cb53ac085"), "consumable"], ["ammunition", sbsI18n("swade-better-setting.UI.Ammunition_f5ba1f5823"), "gear"],
  ["treasure", sbsI18n("swade-better-setting.UI.Treasure_fbbbf4992f"), "gear"], ["containers", sbsI18n("swade-better-setting.UI.Containers_a22daa7f02"), CONTAINER]
];
const typeGroups = {weapon: "weapons", shield: "weapons", armor: "armor", consumable: "consumables", [CONTAINER]: "containers"};
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const format = new Intl.NumberFormat(undefined, {maximumFractionDigits: 2});
export const partyMoney = () => game.modules.get(MONEY)?.active ? game.modules.get(MONEY).api : null;

function inventory(actor) {
  const items = actor.items.filter(item => !item.getFlag("swade-better-setting", "partyStorageRoot")
    && (item.isPhysicalItem || [CONTAINER, MONEY_ITEM].includes(item.type)));
  let weight = 0, value = 0;
  for (const item of items) {
    const count = number(item.system.quantity);
    weight += number(item.system.weight) * count;
    if (item.type !== MONEY_ITEM) value += number(item.system.price) * count;
  }
  return {items, weight, value};
}

function totals(actor, inventory, api, primary) {
  const {weight, value} = inventory;
  const balances = api?.balances(actor) ?? [];
  const encumbrance = actor.system.details?.encumbrance;
  return {weight: encumbrance?.value ?? weight, capacity: encumbrance?.max, value, balances,
    currency: api ? 0 : number(actor.type === "group" ? actor.system.currency : actor.system.details?.currency), primary};
}

function displayTotals({weight, capacity, value, currency, balances, primary}, api) {
  const scale = api?.amountScale ?? 1_000_000;
  const amount = api?.formatAmount ?? (units => new Intl.NumberFormat(undefined, {maximumFractionDigits: 6}).format(units / scale));
  return {weight: format.format(weight), capacity: Number.isFinite(capacity) ? format.format(capacity) : "", gearValue: format.format(value), cash: format.format(currency),
    wealth: format.format(currency + value),
    balances: balances.map(({currency, units}) => ({id: currency.id, name: currency.name, symbol: currency.symbol,
      amount: amount(units), wealth: amount(units + (currency.id === primary ? Math.round(value * scale) : 0))}))};
}

export function preparePartyStash(group, members, vaults, grid) {
  const api = partyMoney();
  const primary = api ? game.settings.get(MONEY, "catalog").primary : "";
  const ownInventory = inventory(group);
  const shared = totals(group, ownInventory, api, primary);
  const vaultWallets = vaults.map(vault => totals(vault, inventory(vault), api, primary));
  if (grid) {
    shared.weight = vaultWallets.reduce((total, wallet) => total + wallet.weight, 0);
    shared.value = vaultWallets.reduce((total, wallet) => total + wallet.value, 0);
  }
  const party = {...shared, balances: []};
  const wallets = [];
  const pooled = new Map();
  const addBalances = balances => {
    for (const {currency, units} of balances) {
      const entry = pooled.get(currency.id) ?? {currency, units: 0};
      entry.units += units;
      pooled.set(currency.id, entry);
    }
  };
  const collect = wallet => {
    party.weight += wallet.weight;
    party.value += wallet.value;
    party.currency += wallet.currency;
    addBalances(wallet.balances);
  };
  addBalances(shared.balances);
  for (const wallet of vaultWallets) {
    if (grid) {
      party.currency += wallet.currency;
      addBalances(wallet.balances);
    } else collect(wallet);
  }
  for (const member of members) {
    const actor = group.system.members.get(member.uuid)?.actor;
    const wallet = totals(actor, inventory(actor), api, primary);
    collect(wallet);
    wallets.push({uuid: member.uuid, name: member.name, img: member.img, canManage: !!api && actor.isOwner,
      ...displayTotals(wallet, api)});
  }
  party.balances = [...pooled.values()];

  const map = new Map(categories.map(([id, name, type]) => [id, {id, name, type, items: [],
    canCreate: type !== CONTAINER || !!CONFIG.Item.dataModels[CONTAINER]}]));
  for (const item of ownInventory.items.sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))) {
    const {system} = item;
    if (item.type === MONEY_ITEM && api) continue;
    const id = system.isAmmo ? "ammunition" : typeGroups[item.type]
      ?? (/^treasure$/i.test(system.category ?? "") || item.type === MONEY_ITEM ? "treasure" : "equipment");
    const count = number(system.quantity);
    map.get(id).items.push({name: item.name, id: item.id, img: item.img, count,
      value: format.format(number(system.price) * count), weight: format.format(number(system.weight) * count)});
  }
  return {stashGroups: [...map.values()], walletMembers: wallets, stashMoney: !!api, canDeposit: !!api?.credit,
    sharedWallet: displayTotals(shared, api), partyWallet: displayTotals(party, api)};
}

export async function depositPartyMoney(actor, selectedVault) {
  const api = partyMoney();
  const catalog = game.settings.get(MONEY, "catalog");
  const doc = document;
  const content = doc.createElement("div");
  const fields = doc.createElement("div");
  fields.className = "sbs-party-deposit";
  content.append(fields);
  const deposits = partyDepositVaults(actor);
  const destination = doc.createElement("select");
  destination.name = sbsI18n("swade-better-setting.UI.destination_b5c755aaab");
  destination.add(new Option(sbsI18n("swade-better-setting.UI.Partytreasury_dc8748481b"), ""));
  for (const {id, label} of deposits) destination.add(new Option(label, id, id === selectedVault));
  const currencies = doc.createElement("select");
  currencies.name = sbsI18n("swade-better-setting.UI.currency_466e5b9cd5");
  for (const currency of catalog.currencies) currencies.add(new Option(currency.name, currency.id, currency.id === catalog.primary));
  if (!currencies.length) return ui.notifications.info(sbsI18n("swade-better-setting.UI.AddacurrencyinBetterMoney_84f4403058"));
  const amount = doc.createElement("input");
  Object.assign(amount, {name: sbsI18n("swade-better-setting.UI.amount_cf38d95c9c"), type: "number", min: "0.000001", step: "0.000001", required: true});
  for (const [label, control] of [[sbsI18n("swade-better-setting.UI.Currency_3ac1a9ec4f"), currencies], [sbsI18n("swade-better-setting.UI.Amount_49e96d7cdf"), amount], [sbsI18n("swade-better-setting.UI.Depositin_bcaa1872b8"), destination]]) {
    const row = doc.createElement("label");
    row.append(label, control);
    fields.append(row);
  }
  return foundry.applications.api.DialogV2.prompt({
    window: {title: sbsI18n("swade-better-setting.UI.Addpartycurrency_da5892394d")}, classes: ["sbs-party-dialog"], content, rejectClose: false,
    ok: {label: sbsI18n("swade-better-setting.UI.Add_9fd728c66c"), callback: async (_event, button) => {
      if (!actor.isOwner || actor.system.locked) return;
      const {currency, amount, destination} = button.form.elements;
      if (!destination.value) return api.credit(actor, currency.value, amount.value);
      const vault = partyDepositVaults(actor).find(slot => slot.id === destination.value);
      if (!vault) throw new Error(sbsI18n("swade-better-setting.UI.Theselectedvaultisnolonger_b8d1f7118a"));
      return vault.credit(prepareItems => api.credit(vault.actor, currency.value, amount.value, {prepareItems}));
    }}
  });
}

