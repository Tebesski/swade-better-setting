import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe',args:['--enable-unsafe-swiftshader']});
try {
 const page=await browser.newPage();await page.goto('http://localhost:30042');await page.locator('select[name=userId]').selectOption({label:'Gamemaster'});await page.getByRole('button',{name:'Join Game Session',exact:true}).click();await page.waitForFunction(()=>globalThis.game?.ready,null,{timeout:60000});
 assert.equal(await page.evaluate(()=>game.world.id),'maneuver-qa');
 const result=await page.evaluate(async()=>{
  const {rollInlineDamage}=await import('/modules/swade-better-effects/scripts/inline-damage.mjs');
  const {messageTargets}=await import('/modules/swade-better-effects/scripts/chat-flags.mjs');
  const {messageContext,isDamageMessage}=await import('/modules/swade-better-effects/scripts/roll-context.mjs');
  const message=game.messages.contents.findLast(m=>isDamageMessage(m)&&m.significantRoll?.total===12&&messageTargets(m,messageContext(m)).length===2);
  if(!message)throw Error('Run inline-damage-foundry.mjs first');
  const targets=messageTargets(message,messageContext(message)),count=game.messages.size;
  await rollInlineDamage(message,targets[0].uuid,{allTargets:true});
  return {count,after:game.messages.size,results:targets.map(token=>message.getFlag('swade-better-effects',`inlineDamage.${token.id}`))};
 });
 assert.equal(result.count,result.after);assert.equal(result.results[0].roll.total,12);assert.equal(result.results[1].roll.total,12);
 assert.equal(result.results[0].id,result.results[1].id);assert.equal(result.results[0].roll.options.ap,3);
 console.log('PASS shared reroll from a damage card preserves its original formula and AP without new messages');
}finally{await browser.close()}
