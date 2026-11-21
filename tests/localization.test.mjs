import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
function flat(obj,prefix='',out={}) {for(const [k,v] of Object.entries(obj)){const key=prefix?prefix+'.'+k:k;if(v&&typeof v==='object')flat(v,key,out);else out[key]=v;}return out;}
const ids=['setting','templates','effects','powers','called-shots','subsystems','money','usables'].map(x=>'swade-better-'+x).concat('swade-hud','swade-grid-inventory');
for(const id of ids)test(id+' resolves dictionary text, translations, parameters and HTML attributes',async()=>{
 const url=new URL('../../'+id+'/scripts/i18n.mjs',import.meta.url);
 const {t,a,installEnglishFallback}=await import(url.href);
 const english=flat(JSON.parse(await readFile(new URL('../lang/en.json',url),'utf8')));
 const key=Object.keys(english).find(key=>key.startsWith(id+'.UI.'));
 const previous=globalThis.game;
 try{
  globalThis.game=undefined;assert.equal(t(key),english[key]);
  globalThis.game={i18n:{localize:k=>k===key?'Translated {value}':k}};
  assert.equal(t(key,{value:'label'}),'Translated label');
  assert.equal(a(key,{value:'"<&\''}),'Translated &quot;&lt;&amp;&#39;');
  assert.equal(t(key,{value:'{unexpanded}'}),'Translated {unexpanded}');
  const read = (obj, path) => path.split('.').reduce((value, part) => value?.[part], obj);
  const native = {translations: {}, _fallback: {}, localize(k) {return read(this.translations,k) ?? read(this._fallback,k) ?? k;}};
  installEnglishFallback(native);
  assert.equal(native.localize(key), english[key], 'Native/Handlebars lookup works when server cached an older manifest');
  const parts=key.split('.'); let obj=native.translations;
  for(const part of parts.slice(0,-1))obj=obj[part]??={};obj[parts.at(-1)]='Language pack translation';
  installEnglishFallback(native);
  assert.equal(native.localize(key),'Language pack translation');
 }finally{globalThis.game=previous;}
});
