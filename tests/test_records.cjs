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
(async () => {
  vm.runInContext("renderTabs = () => {}; renderMine = () => {}; toast = () => {}; el = () => ({}); saveRecords = () => {};",c);
  c.event = {target:{files:[{text:async()=>JSON.stringify({records:{read:{learning:'later',behaviorism:'2026-10-21'},fav:{},notes:{learning:'更长的导入笔记不应替换原笔记'},practice:{learning:'应用反思'},reviews:{learning:{next:'2026-11-01T00:00:00Z',days:7}},marks:{learning:[{id:'m1',quote:'原文'},{id:'m2',quote:'新标注'}]}}})}],value:'backup.json'}};
  await vm.runInContext('importRecords(event)',c);
  const imported = JSON.parse(vm.runInContext('JSON.stringify(state.records)',c));
  assert.equal(imported.notes.learning,'原有笔记');
  assert.equal(imported.read.learning,legacy.read.learning);
  assert.equal(imported.practice.learning,'应用反思');
  assert.equal(imported.reviews.learning.days,7);
  assert.equal(imported.marks.learning.length,2);
  console.log('PASS import merges practice/reviews, preserves existing notes, deduplicates highlights');
})().catch(e=>{console.error(e);process.exitCode=1});
