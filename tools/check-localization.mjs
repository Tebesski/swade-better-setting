import fs from 'node:fs';import path from 'node:path';import {parse} from 'acorn';import * as walk from 'acorn-walk';
function flat(obj, prefix='', out={}) { for(const [k,v] of Object.entries(obj)) {const key=prefix?prefix+'.'+k:k;if(v&&typeof v==='object'&&!Array.isArray(v))flat(v,key,out);else out[key]=v;}return out;}
const root=path.resolve(import.meta.dirname,'..','..');
export const moduleIds=['setting','templates','effects','powers','called-shots','subsystems','money','usables'].map(x=>'swade-better-'+x).concat('swade-hud','swade-grid-inventory');
const excluded=new Set(['node_modules','.git','packs','assets','tests','dev','tools','test-results','lang']);
let files=0,keys=0;const failures=[];
for(const id of moduleIds){const base=path.join(root,id),manifest=JSON.parse(fs.readFileSync(path.join(base,'module.json'),'utf8')),dictionary=flat(JSON.parse(fs.readFileSync(path.join(base,'lang/en.json'),'utf8')));
 if(!manifest.languages?.some(l=>l.lang==='en'&&l.path==='lang/en.json'))failures.push(id+': missing English manifest registration');
 for(const [key,text] of Object.entries(dictionary))if(key.startsWith(id+'.UI.')){keys++;if(typeof text!=='string')failures.push(key+': translation must be text');}
 function check(key,file){if(key?.startsWith(id+'.UI.')&&!Object.hasOwn(dictionary,key))failures.push(file+': missing '+key);}
 function visit(dir){for(const file of fs.readdirSync(dir,{withFileTypes:true})){if(excluded.has(file.name))continue;const full=path.join(dir,file.name);if(file.isDirectory())visit(full);else if(/\.(m?js|hbs|html)$/.test(file.name)){files++;const source=fs.readFileSync(full,'utf8');if(/\.(m?js)$/.test(file.name)){const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});walk.simple(ast,{CallExpression(node){if(['sbsI18n','sbsI18nAttribute'].includes(node.callee.name))check(node.arguments[0]?.value,full);}});}else for(const match of source.matchAll(/\{\{localize\s+["']([^"']+)["']/g))check(match[1],full);}}}
 visit(base);
}
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}else console.log(`Localization check passed: ${moduleIds.length} modules, ${files} source/templates, ${keys} dictionary keys.`);
