import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://localhost:30042');await page.locator('select[name=userId]').selectOption({label:'Gamemaster'});await page.getByRole('button',{name:'Join Game Session',exact:true}).click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});assert.equal(await page.evaluate(()=>game.world.id),'maneuver-qa');
 await page.evaluate(async()=>{await game.settings.set('core','moduleConfiguration',{...game.settings.get('core','moduleConfiguration'),'swade-targeted-damage':true})});await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});errors.length=0;
 const result=await page.evaluate(async()=>{
  const {makeContext}=await import('/modules/swade-better-effects/scripts/roll-context.mjs');
  const {rollInlineDamage,inlineDamageMessage,damageResolution}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');
  const {resolveMessageDamage}=await import('/modules/swade-better-effects/scripts/damage.mjs');
  const actor=await Actor.create({name:'Resolution QA attacker',type:'character',items:[{name:'Damage',type:'weapon',system:{damage:'12'}}]});
  const defenders=await Promise.all(['Red','Yellow','Green'].map(name=>Actor.create({name,type:'character'})));
  const scene=await Scene.create({name:'Resolution QA',tokens:defenders.map(actor=>({name:actor.name,actorId:actor.id,actorLink:true}))});
  const tokens=scene.tokens.contents,item=actor.items.getName('Damage');
  const roll=await new CONFIG.Dice.SwadeRoll('4',{}, {rollType:'trait'}).evaluate();
  const context=makeContext(actor,item,['attack'],{kind:'trait'});context.targetUuids=tokens.map(t=>t.uuid);
  const message=await ChatMessage.create({speaker:ChatMessage.getSpeaker({actor}),rolls:[roll],flags:{'swade-better-effects':{context},swade:{targets:tokens.map(t=>({uuid:t.uuid,name:t.name}))}}});
  globalThis.rqa={message,tokens,actor,defenders};
  await rollInlineDamage(message,tokens[0].uuid,{allTargets:true});
  const open=async token=>{await resolveMessageDamage(inlineDamageMessage(message,token.uuid),{tokens:[token]});return [...foundry.applications.instances.values()].find(a=>a.rendered&&a.constructor.name==='ConditionalTargetedDamageApplicator'&&a.options.token?.uuid===token.uuid)};
  const red=await open(tokens[0]);await red.options.actions.takeWounds.call(red,{},null);
  const yellow=await open(tokens[1]);const original=defenders[1].rollAttribute;defenders[1].rollAttribute=async()=>({total:12,isCritfail:false});
  try{await yellow.attemptSoak()}finally{defenders[1].rollAttribute=original}
  const green=await open(tokens[2]);await green.close();
  let blocked=false;try{await rollInlineDamage(message,tokens[0].uuid)}catch{blocked=true}
  await message.setFlag('swade-better-effects',`targetResults.${tokens[0].id}`,{opposed:{total:8,trait:{name:'Vigor'},targetNumber:4},shakeOff:{total:0,trait:{name:'Vigor'},targetNumber:4}});
  return {id:message.id,states:tokens.map(t=>damageResolution(message,t)),wounds:defenders.map(a=>a.system.wounds.value),blocked};
 });
 assert.deepEqual(result.states.map(s=>s.state),['damaged','soaked','none']);assert.ok(result.states.every(s=>s.final));assert.deepEqual(result.wounds,[2,0,0]);assert.ok(result.blocked);
 const card=page.locator(`.chat-message[data-message-id="${result.id}"]`).first();await page.waitForFunction(id=>document.querySelector(`.chat-message[data-message-id="${id}"] .sbe-target-damage-box[data-resolution="damaged"]`),result.id);
 const colors=await card.locator('.sbe-target-damage-box').evaluateAll(boxes=>boxes.map(box=>({color:getComputedStyle(box).backgroundColor,locked:[...box.querySelectorAll('a')].every(a=>a.getAttribute('aria-disabled')==='true')})));
 assert.deepEqual(colors.map(c=>c.color),['rgb(237, 192, 186)','rgb(242, 223, 164)','rgb(196, 226, 197)']);assert.ok(colors.every(c=>c.locked));
 assert.equal(await card.locator('[data-roll-outcome=raise]').count(),1);assert.equal(await card.locator('[data-roll-outcome=failure]').count(),1);
 console.log('PASS Targeted Damage: wounds red, fully soaked yellow, close green, controls locked; opposed and Shake Off color whole badges');
 await page.evaluate(async()=>{await game.settings.set('core','moduleConfiguration',{...game.settings.get('core','moduleConfiguration'),'swade-targeted-damage':false})});await page.reload();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 const fallback=await page.evaluate(async id=>{
  const {inlineDamageMessage,damageResolution}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');const {resolveMessageDamage}=await import('/modules/swade-better-effects/scripts/damage.mjs');
  const original=game.messages.get(id),data=original.toObject();delete data._id;delete data.flags['swade-better-effects'].damageResolutions;const message=await ChatMessage.create(data);
  const tokens=message.getFlag('swade-better-effects','context').targetUuids.map(uuid=>foundry.utils.fromUuidSync(uuid));
  const open=async token=>{await resolveMessageDamage(inlineDamageMessage(message,token.uuid),{tokens:[token]});return [...foundry.applications.instances.values()].find(a=>a.rendered&&a.constructor.name==='ConditionalDamageApplicator'&&a.token?.uuid===token.uuid)};
  const red=await open(tokens[1]);await red.takeDamage();
  const yellow=await open(tokens[2]);const actor=tokens[2].actor,old=actor.rollAttribute;actor.rollAttribute=async()=>({total:12,isCritfail:false});try{await yellow.soak(false);await yellow.takeDamage()}finally{actor.rollAttribute=old}
  const green=await open(tokens[0]);await green.close();for(let i=0;i<50&&!damageResolution(message,tokens[0]);i++)await new Promise(resolve=>setTimeout(resolve,20));return {states:tokens.map(token=>damageResolution(message,token)?.state),raw:message.getFlag('swade-better-effects','damageResolutions')};
 },result.id);
 console.log('FALLBACK',fallback);assert.deepEqual(fallback.states,['none','damaged','soaked']);assert.deepEqual(errors,[]);console.log('PASS fallback resolver: same outcome colors and locks');
}finally{await browser.close()}
