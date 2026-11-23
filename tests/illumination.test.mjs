import {test} from "node:test";
import assert from "node:assert/strict";
import {darknessPenalty, installIllumination, illuminationFlags} from "../scripts/illumination.mjs";

test("lighting flags distinguish environmental light from the creature's actual penalty", () => {
  assert.deepEqual(illuminationFlags(0), ["bright-light"]);
  assert.deepEqual(illuminationFlags(-2), ["dim-light", "dim-light-penalty"]);
  assert.deepEqual(illuminationFlags(-4, false), ["dark-light"]);
  assert.deepEqual(illuminationFlags(-6), ["pitch-dark-light", "pitch-dark-light-penalty"]);
});

test("illumination thresholds include their boundary and retain the darkest category", () => {
  for (const [darkness, penalty] of [[0,0],[0.399,0],[0.4,-2],[0.799,-2],[0.8,-4],[0.9,-6],[1,-6]]) {
    assert.equal(darknessPenalty(darkness), penalty);
  }
});
test("regional darkness yields one normal toggleable modifier, with vision mitigation and disabled fallback", () => {
  const hooks = {}, values = {illuminationEnabled:true,"illumination-dim":0.4,"illumination-dark":0.8,"illumination-pitch":0.9};
  globalThis.Hooks = {on: (name, fn) => hooks[name] = fn};
  globalThis.game = {settings:{get: (_id,key) => values[key]},user:{targets:new Set()},i18n:{localize:key=>key}};
  const catalog = Object.fromEntries(["dim","dark","pitch"].map((key,i)=>[key,{label:key,value:-2*(i+1)}]));
  globalThis.CONFIG = {SWADE:{rollModifiers:{illumination:{modifiers:catalog}}}};
  const token = {getCenterPoint:()=>({x:0,y:0}),elevation:0,regions:[]};
  const actor = {getActiveTokens:()=>[token],items:[]};
  globalThis.canvas = {ready:true,effects:{getDarknessLevel:()=>0.8,testInsideLight:()=>false}};
  installIllumination();
  const roll = mods => hooks.swadePreRollSkill(actor,{system:{swid:"notice"}},null,mods,{});
  let mods = [{label:"dark",value:-4}]; roll(mods);
  assert.deepEqual(mods,[{label:"dark",value:-4,ignore:false}]);
  token.regions = [{behaviors:[{type:"attackModifiers",system:{illumination:"pitch"}}]}];
  mods=[]; roll(mods); assert.equal(mods[0].value,-6);
  token.regions=[];actor.items=[{system:{swid:"low-light-vision"}}];
  mods=[{label:"dark",value:-4}];roll(mods);assert.equal(mods.length,0);
  values.illuminationEnabled=false;mods=[];roll(mods);assert.equal(mods.length,0);
  canvas.scene={id:"test"};token.parent={id:"test"};token.documentName="Token";token.actor=actor;
  let flags=[];hooks.swadeBetterEffectsDocumentFlags(token,null,flags);
  assert.deepEqual(flags,["dark-light"]);
  values.illuminationEnabled=true;actor.items=[];
  flags=[];hooks.swadeBetterEffectsDocumentFlags(token,null,flags);
  assert.deepEqual(flags,["dark-light","dark-light-penalty"]);
  canvas.effects.getDarknessLevel=()=>0;
  flags=[];hooks.swadeBetterEffectsDocumentFlags(token,null,flags);
  assert.deepEqual(flags,["bright-light"]);
});
