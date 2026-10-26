const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const cp = require('node:child_process');
const path = require('node:path');
const root = path.join(__dirname, '..');
function context(source, stored) {
  const ctx = vm.createContext({console, URL, localStorage:{getItem:()=>stored}, window:{location:{href:"http://localhost/"},addEventListener(){}}, document:{addEventListener(){}}});
  // Disable only startup side effects; these tests exercise pure rendering and migration.
  source = source.replace(/paintPanels\(\);\nsetupChrome\(\);\nsetupHighlighting\(\);\nbootstrap\(\);/, '');
  vm.runInContext(source,ctx);return ctx;
}
const source=fs.readFileSync(path.join(root,'assets/js/app.js'),'utf8');
const old=cp.execFileSync('git',['show','ca8f3ca:assets/js/app.js'],{cwd:root,encoding:'utf8'});
const legacy={read:{learning:'2026-10-20T00:00:00Z'},fav:{learning:'2026-10-20T00:00:00Z'},notes:{learning:'原有笔记'},marks:{learning:[{id:'m1',quote:'原文',start:3,end:5}]}};
const c=context(source,JSON.stringify(legacy));
const migrated=JSON.parse(vm.runInContext('JSON.stringify(loadRecords())',c));
for(const k of ['read','fav','notes','marks']) assert.deepEqual(migrated[k],legacy[k]);
assert.deepEqual(migrated.practice,{});assert.deepEqual(migrated.reviews,{});
const prior=context(old,JSON.stringify(legacy));
for(const file of fs.readdirSync(path.join(root,'data/articles'))) {
 const a=JSON.parse(fs.readFileSync(path.join(root,'data/articles',file),'utf8'));
 c.article=prior.article=a;
 assert.equal(vm.runInContext('renderSections(article)',c),vm.runInContext('renderSections(article)',prior),file+' preserves highlight offsets');
}
console.log('PASS legacy record migration; all 7 historical article DOM renderings unchanged');
