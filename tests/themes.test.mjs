import assert from "node:assert/strict";
import test from "node:test";
import {registerThemes} from "../scripts/themes.mjs";

test("a player's setting notification keeps the local user's saved theme", t => {
  const configs = new Map();
  const saved = new Map([["theme-swade", "white"]]);
  const makeBody = () => {
    const classes = new Set();
    return {classes, classList: {toggle: (name, force) => force ? classes.add(name) : classes.delete(name)}};
  };
  const body = makeBody();
  const detachedBody = makeBody();
  let ready;
  const environment = {
    document: {body},
    foundry: {applications: {api: {ApplicationV2: class {}}, detached: {windows: new Map([["sheet", {window: {document: {body: detachedBody}}}]])}}},
    Hooks: {once: (_event, callback) => { ready = callback; }, on() {}},
    game: {modules: new Map(), settings: {
      register: (_module, key, config) => configs.set(key, config),
      registerMenu() {},
      get: (_module, key) => saved.get(key) ?? configs.get(key).default
    }}
  };
  Object.assign(globalThis, environment);
  t.after(() => { for (const key of Object.keys(environment)) delete globalThis[key]; });

  registerThemes();
  ready();
  const theme = configs.get("theme-swade");
  assert.equal(theme.scope, "user");
  assert.ok(body.classes.has("sbs-white-swade"));
  assert.ok(detachedBody.classes.has("sbs-white-swade"));

  theme.onChange("default", {}, "another-user");
  assert.ok(body.classes.has("sbs-white-swade"));
  assert.ok(detachedBody.classes.has("sbs-white-swade"));

  saved.set("theme-swade", "default");
  theme.onChange("default", {}, "current-user");
  assert.equal(body.classes.has("sbs-white-swade"), false);
  assert.equal(detachedBody.classes.has("sbs-white-swade"), false);
});
