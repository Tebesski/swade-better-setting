// Run only against the disposable maneuver-qa clone on port 30042.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const fixture=JSON.parse(await readFile(process.env.INLINE_DAMAGE_FIXTURE ?? new URL('./fixtures/launch-modifier-damage.json',import.meta.url),'utf8'));
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1500,height:1080}});page.setDefaultTimeout(15000);
const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGEERROR',e.message)});
page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text().slice(0,350))});
try {
 await page.goto('http://localhost:30042');
 await page.locator('select[name=userId]').selectOption({label:'Gamemaster'});await page.getByRole('button',{name:'Join Game Session',exact:true}).click();
 await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>game.world.id),'maneuver-qa');
 console.log('MODULES',await page.evaluate(()=>game.modules.contents.filter(m=>m.active).map(m=>m.id)));
 await page.addStyleTag({content:'#notifications{pointer-events:none!important}'});
 await page.evaluate(async()=>{const needed=['swade-better-setting','swade-better-effects','swade-better-powers','swade-better-templates','swade-hud','swade-tools','swade-targeted-damage'];const current=game.settings.get('core','moduleConfiguration');await game.settings.set('core','moduleConfiguration',Object.fromEntries(needed.map(id=>[id,true])));await game.settings.set('swade','systemMigrationVersion','6.0.4');});
 await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 errors.length=0;const ids=await page.evaluate(async fixture=>{
  globalThis.dqa={};
  const {makeContext}=await import('/modules/swade-better-effects/scripts/roll-context.mjs');
  const {updateCast}=await import('/modules/swade-better-powers/scripts/cast-results.mjs');
  dqa.actor=await Actor.create({name:'Inline Damage QA',type:'character',items:[{name:'Bending',type:'skill',system:{attribute:'spirit',die:{sides:8}}},{name:'Fighting',type:'skill',system:{swid:'fighting',attribute:'agility',die:{sides:8}}},fixture,{name:'Sword',type:'weapon',system:{damage:'1d6',actions:{trait:'Fighting'}}}]});
  dqa.power=dqa.actor.items.find(i=>i.type==='power');
  dqa.a=await Actor.create({name:'First Defender',type:'character'});dqa.b=await Actor.create({name:'Second Defender',type:'npc'});
  dqa.scene=await Scene.create({name:'Inline Damage QA',width:1200,height:800,active:true,tokens:[{name:'Caster',actorId:dqa.actor.id,actorLink:true,x:100,y:100},{name:'First Defender',actorId:dqa.a.id,actorLink:true,x:400,y:100},{name:'Second Defender',actorId:dqa.b.id,actorLink:true,x:600,y:100}]});
  await dqa.scene.view();while(!canvas.ready)await new Promise(r=>setTimeout(r,100));
  dqa.targets=[...dqa.scene.tokens].slice(1);canvas.tokens.setTargets(dqa.targets.map(t=>t.id),{mode:'replace'});
  const roll=await new CONFIG.Dice.SwadeRoll('4',{}, {rollType:'trait'}).evaluate();
  const cast={id:foundry.utils.randomID(),itemUuid:dqa.power.uuid,actorUuid:dqa.actor.uuid,targetNumber:4};
  updateCast(cast,dqa.power,new Map([['damaging','pm1']]),false);
  const context=makeContext(dqa.actor,dqa.power,['power'],{kind:'trait',skill:dqa.actor.items.getName('Bending')});
  dqa.message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:dqa.actor,token:dqa.scene.tokens.contents[0]}),rolls:[roll],flags:{'swade-better-effects':{context},'swade-better-powers':{powerCast:cast}}});
  return {message:dqa.message.id,first:dqa.targets[0].uuid,second:dqa.targets[1].uuid,actor:dqa.actor.id,scene:dqa.scene.id,defenders:[dqa.a.id,dqa.b.id]};
 },fixture);
 const card=page.locator(`.chat-message[data-message-id="${ids.message}"]`).first();
 await card.locator('.sbe-target-row').first().waitFor();

 assert.equal(await card.locator('[data-action=target-damage]').count(),2);
 assert.equal(await card.locator('[data-action=target-damage]').first().getAttribute('aria-disabled'),'false');
 const before=await page.evaluate(()=>game.messages.size);
 await card.locator('[data-action=target-damage]').first().click({button:'right'});
 await card.locator('[data-action=resolve-target-damage]').first().waitFor();
 assert.equal(await page.evaluate(()=>game.messages.size),before);
 const saved=await page.evaluate(()=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[0].id}`));
 console.log('SAVED',saved.roll.formula,saved.roll.total);
 assert.ok(saved.roll.formula.includes('2d4x'));assert.equal(saved.context.targetUuids[0],ids.first);
 assert.equal(await page.evaluate(()=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[1].id}`).id===dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[0].id}`).id),true);
 assert.equal(await page.evaluate(()=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[1].id}`).roll.total),saved.roll.total);
 assert.equal(await page.evaluate(()=>game.user.targets.size),2);
 await card.locator('[data-action=resolve-target-damage]').first().click();
 
 await page.waitForFunction(()=>[...foundry.applications.instances.values()].some(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator'));
 console.log('RESOLVER',await page.evaluate(()=>[...foundry.applications.instances.values()].filter(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator').map(a=>({damage:a.object.damage,target:a.options.token.uuid}))));
 await page.screenshot({path:'C:/Temp/inline-damage-chat.png'});
 await page.evaluate(async()=>{for(const app of foundry.applications.instances.values())if(app.rendered&&app.constructor.name==='ConditionalTargetedDamageApplicator')await app.close()});
 console.log('PASS attached modifier-only power has per-target inline damage, no extra messages, exact target resolution');

 // Each row must use its own defender modifier even while both remain targeted.
 await page.evaluate(async()=>{
  await dqa.a.createEmbeddedDocuments('ActiveEffect',[{name:'First target damage',system:{changes:[{key:'system.stats.globalMods.targetDamage',type:'add',value:'2'}]}}]);
  await dqa.b.createEmbeddedDocuments('ActiveEffect',[{name:'Second target damage',system:{changes:[{key:'system.stats.globalMods.targetDamage',type:'add',value:'7'}]}}]);
 });
 await card.locator('[data-action=target-damage]').nth(1).click();
 await card.locator('[data-action=resolve-target-damage]').nth(1).waitFor();
 const second=await page.evaluate(()=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[1].id}`));
 console.log('SECOND',second.roll.formula);
 assert.match(second.roll.formula,/\+ 7(?:\[|\s|$)/);assert.doesNotMatch(second.roll.formula,/\+ 2\[/);
 assert.equal(await page.evaluate(()=>game.user.targets.size),2);
 const conditional=await page.evaluate(async()=>{
  await dqa.actor.createEmbeddedDocuments('ActiveEffect',[{name:'Conditional outgoing damage',flags:{'swade-better-effects':{rules:[{selector:'outgoing-damage',type:'add',value:2,label:'Outgoing bonus',predicate:{op:'all',children:[]}}]}}}]);
  const {rollInlineDamage,inlineDamageMessage}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');
  const {prepareDamage}=await import('/modules/swade-better-effects/scripts/damage.mjs');
  const roll=await rollInlineDamage(dqa.message,dqa.targets[0].uuid),message=inlineDamageMessage(dqa.message,dqa.targets[0].uuid);
  const prepared=prepareDamage(dqa.a,dqa.targets[0],message);
  const context=message.getFlag('swade-better-effects','context');
  await dqa.actor.effects.getName('Conditional outgoing damage').delete();
  return {total:roll.total,damage:prepared.damage,rolled:context.damageRulesInRoll.length};
 });
 assert.equal(conditional.total,conditional.damage);assert.equal(conditional.rolled,1);
 console.log('PASS conditional outgoing damage is rolled once and is not added again during resolution');
 const weaponId=await page.evaluate(async()=>{
  const {makeContext}=await import('/modules/swade-better-effects/scripts/roll-context.mjs');
  const item=dqa.actor.items.getName('Sword');await item.update({'system.ap':3});
  const roll=await new CONFIG.Dice.SwadeRoll('8',{}, {rollType:'trait'}).evaluate();
  const context=makeContext(dqa.actor,item,['attack','melee'],{kind:'trait',skill:dqa.actor.items.getName('Fighting')});
  dqa.weaponMessage=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:dqa.actor,token:dqa.scene.tokens.contents[0]}),rolls:[roll],flags:{'swade-better-effects':{context},'swade-tools':{useactor:dqa.actor.id,itemroll:item.id,usetarget:dqa.targets.map(t=>t.id).join(','),rolltype:'skill',skill:'Fighting',userof:1},'swade-hud':{nativeAttack:{version:1,targets:{[dqa.targets[0].id]:{targetNumber:4},[dqa.targets[1].id]:{targetNumber:99}}}}}});
  return dqa.weaponMessage.id;
 });
 const weapon=page.locator(`.chat-message[data-message-id="${weaponId}"]`).first();
 await weapon.locator('[data-action=target-damage]').first().waitFor();
 assert.equal(await weapon.locator('[data-action=target-damage]').nth(1).getAttribute('aria-disabled'),'false');
 const weaponCount=await page.evaluate(()=>game.messages.size);
 await weapon.locator('[data-action=target-damage]').first().click();
 await weapon.locator('[data-action=resolve-target-damage]').waitFor();
 const weaponResult=await page.evaluate(()=>dqa.weaponMessage.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[0].id}`));
 console.log('WEAPON',weaponResult.roll.formula,weaponResult.roll.total,weaponResult.roll.options.ap);
 assert.equal(weaponResult.raise,true);assert.equal(weaponResult.roll.options.ap,3);
 assert.ok(weaponResult.roll.formula.match(/1d6x/g).length>=2);assert.equal(await page.evaluate(()=>game.messages.size),weaponCount);
 assert.equal(await weapon.locator('.swadetools-wrapper').first().isVisible().catch(()=>false),false);
 const standaloneId=await page.evaluate(async()=>{
  const {makeContext}=await import('/modules/swade-better-effects/scripts/roll-context.mjs');
  const item=dqa.actor.items.getName('Sword');const roll=await new CONFIG.Dice.DamageRoll('12',{}, {rollType:'damage',ap:3}).evaluate();
  const context=makeContext(dqa.actor,item,['damage'],{kind:'damage'});
  dqa.standalone=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor:dqa.actor}),rolls:[roll],flags:{'swade-better-effects':{context}}});
  return dqa.standalone.id;
 });
 const standalone=page.locator(`.chat-message[data-message-id="${standaloneId}"]`).first();
 await standalone.locator('[data-action=resolve-target-damage]').first().click();
 await page.waitForFunction(()=>[...foundry.applications.instances.values()].some(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator'));
 const wounds=await page.evaluate(()=>{const app=[...foundry.applications.instances.values()].find(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator');return app.object.wounds});
 assert.ok(wounds>0);
 await page.locator('.sbe-targeted-adapter [data-action=takeWounds]').click();
 await page.waitForFunction(wounds=>dqa.a.system.wounds.value===wounds,wounds);
 assert.equal(await page.evaluate(()=>dqa.b.system.wounds.value),0);
 console.log('PASS exact defender damage modifiers, Tools hit/raise/miss outcomes, raise die, AP, standalone damage rows, and native Targeted Damage wound application');

 // A source owner may roll on a public GM-authored card, but cannot inspect defender flags.
 const player=await page.evaluate(async()=>{const user=await User.create({name:'Inline Damage Player '+Date.now(),role:CONST.USER_ROLES.PLAYER});await dqa.actor.update({['ownership.'+user.id]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER});return {id:user.id,name:user.name}});
 const playerContext=await browser.newContext({viewport:{width:1500,height:1080}});const playerPage=await playerContext.newPage();
 playerPage.setDefaultTimeout(20000);playerPage.on('pageerror',e=>errors.push(e.message));
 await playerPage.goto('http://localhost:30042');await playerPage.locator('select[name=userId]').selectOption({label:player.name});await playerPage.getByRole('button',{name:'Join Game Session',exact:true}).click();
 await playerPage.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 const playerCard=playerPage.locator(`.chat-message[data-message-id="${ids.message}"]`).first();
 await playerCard.locator('[data-action=target-damage]').first().waitFor();
 assert.equal(await playerCard.locator('.sbe-target-flags .sbe-flag').count(),0);
 const playerCount=await playerPage.evaluate(()=>game.messages.size);
 const old=await page.evaluate(()=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[0].id}`).id);
 await playerCard.locator('[data-action=target-damage]').first().evaluate(el=>el.click());
 await page.waitForFunction(old=>dqa.message.getFlag('swade-better-effects',`inlineDamage.${dqa.targets[0].id}`).id!==old,old);
 assert.equal(await playerPage.evaluate(()=>game.messages.size),playerCount);
 await playerCard.locator('[data-action=resolve-target-damage]').first().evaluate(el=>el.click());
 await page.waitForFunction(()=>[...foundry.applications.instances.values()].some(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator'));
 await page.evaluate(async()=>{for(const app of foundry.applications.instances.values())if(app.rendered&&app.constructor.name==='ConditionalTargetedDamageApplicator')await app.close()});
 await playerContext.close();
 console.log('PASS player source ownership, remote GM saving/resolution, and defender-flag privacy');
 // The local damage projection and the existing resolver also work with Templates and Targeted Damage disabled.
 await page.evaluate(async()=>{await game.settings.set('core','moduleConfiguration',{...game.settings.get('core','moduleConfiguration'),'swade-better-templates':false,'swade-targeted-damage':false})});
 await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 const fallback=await page.evaluate(async ids=>{
  const {rollInlineDamage,inlineDamageMessage}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');
  const {resolveMessageDamage}=await import('/modules/swade-better-effects/scripts/damage.mjs');
  const message=game.messages.get(ids.message),target=foundry.utils.fromUuidSync(ids.second);const count=game.messages.size;
  await rollInlineDamage(message,target.uuid);const saved=inlineDamageMessage(message,target.uuid);
  await resolveMessageDamage(saved,{tokens:[target]});
  return {count,after:game.messages.size,formula:saved.significantRoll.formula};
 },ids);
 assert.equal(fallback.count,fallback.after);assert.ok(fallback.formula.includes('2d4x'));
 await page.waitForFunction(()=>[...foundry.applications.instances.values()].some(a=>a.rendered&&a.constructor.name==='ConditionalDamageApplicator'));
 console.log('PASS SWADE Tools world without Better Templates or Targeted Damage');
 assert.deepEqual(errors,[]);
}finally{await browser.close()}
