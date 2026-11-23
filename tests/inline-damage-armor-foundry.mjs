import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.goto('http://localhost:30042');await page.locator('select[name=userId]').selectOption({label:'Gamemaster'});await page.getByRole('button',{name:'Join Game Session',exact:true}).click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>game.world.id),'maneuver-qa');
 const result=await page.evaluate(async()=>{
  const {inlineDamageDefense}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');
  const {prepareDamage}=await import('/modules/swade-better-effects/scripts/damage.mjs');
  const actor=await Actor.create({name:'Inline armor QA',type:'character',items:[{name:'Helmet',type:'armor',system:{equipStatus:3,armor:5,locations:{head:true,torso:false,arms:false,legs:false}}}]});
  try {
   const source=game.actors.find(a=>a.name==='Inline Damage QA');
   const context={inlineDamage:true,hitLocation:'head',rollType:'damage',roll:['damage'],attacker:[],attackerRules:[],actorUuid:source.uuid,itemUuid:source.items.getName('Sword').uuid,targetUuids:[]};
   const message={significantRoll:{total:12,ap:0,options:{rollType:'damage'}},flags:{},getFlag:(_scope,key)=>key==='context'?context:undefined};
   const head=prepareDamage(actor,null,message);
   context.hitLocation='torso';const torso=prepareDamage(actor,null,message);
   return {headArmor:head.armor,bodyArmor:torso.armor,headToughness:head.toughness,bodyToughness:torso.toughness};
  }finally{await actor.delete()}
 });
 assert.equal(result.headArmor,5);assert.equal(result.bodyArmor,0);assert.equal(result.headToughness-result.bodyToughness,5);
 console.log('PASS inline damage uses SWADE Tools hit-location armor through the shared damage resolver',result);
}finally{await browser.close()}
