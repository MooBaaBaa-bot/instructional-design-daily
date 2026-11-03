// Date semantics for the Emilia timeline; run with node scripts/test_timeline.cjs.
const assert=require('node:assert/strict');
const t=require('../emilia-timeline.js');
const records=[{date:'2026-10-31'},{date:''},{date:'2026-11-03'},{date:'2026-11-03'}];
assert.deepEqual(t.groups(records,x=>x.date).map(([d,x])=>[d,x.length]),[['2026-11-03',2],['2026-10-31',1],['',1]]);
assert.equal(records[0].date,'2026-10-31');
assert.equal(t.dateKey('2026-11-02T03:00:00Z','America/Los_Angeles'),'2026-11-01');
assert.equal(t.dateKey('2026-11-02','America/Los_Angeles'),'2026-11-02');
assert.equal(t.dateKey('unknown'),'');
const html=t.render(records,{key:x=>x.date,label:'发布日期',card:()=>'<article>内容</article>'});
assert.equal((html.match(/class="chronicle-entry"/g)||[]).length,4);
assert.ok(html.includes('日期未记录'));
console.log('PASS timeline ordering, grouping, unknown dates and Los Angeles dates.');
