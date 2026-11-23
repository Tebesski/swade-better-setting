import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true,executablePath:process.env.LOCALAPPDATA+'/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-win64/chrome-headless-shell.exe'});
try {
 const page=await browser.newPage();
 const source=await readFile('../swade-better-effects/scripts/roll-notes.mjs','utf8');
 const result=await page.evaluate(async source=>{
  globalThis.foundry={utils:{cleanHTML:value=>value,fromUuidSync:()=>null},applications:{ux:{TextEditor:{implementation:{enrichHTML:async value=>value}}}}};
  const render=new Function('sbsI18n',source.replace(/^import .*;\r?\n/,'').replaceAll('export ','')+';return renderRollNotes;') (key=>key);
  document.body.innerHTML='<article><header></header><div class="message-content"><div class="roll">roll</div></div></article>';
  const root=document.querySelector('article'), message={isContentVisible:true};
  const context={notes:[{label:'Modifier',html:'<b>Power note</b>'},{label:'Effect',html:'General reminder<section class="secret">Hidden secret</section>'}]};
  await render(message,root,context);
  const inside=root.querySelector('.message-content > .sbe-roll-notes');
  if(!inside || inside.querySelectorAll('.sbe-roll-note').length!==2 || inside.textContent.includes('Hidden secret'))throw Error('Notes missing or secret exposed');
  await render(message,root,context);
  if(root.querySelectorAll('.sbe-roll-notes').length!==1)throw Error('Duplicate notes');
  let release;
  foundry.applications.ux.TextEditor.implementation.enrichHTML=()=>new Promise(resolve=>release=resolve);
  const old=render(message,root,{notes:[{label:'Old',html:'Stale'}]});
  await render({...message,isContentVisible:false},root,context);release('Stale');await old;
  if(root.querySelector('.sbe-roll-notes'))throw Error('Stale private notes appended');
  return true;
 },source);
 assert.equal(result,true);console.log('PASS shared notes: formatted content, multiple sources, secret removal, content placement, rerender deduplication, and asynchronous privacy guard');
}finally{await browser.close()}
