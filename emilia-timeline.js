/* Emilia chronological reading layout. Dates come only from published records. */
(function(root){
'use strict';
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function dateKey(value,zone){
 if(!value)return '';
 if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value;
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 return new Intl.DateTimeFormat('en-CA',{timeZone:zone||'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
}
function dateLabel(key){
 if(!key)return '日期未记录';
 const d=new Date(key+'T12:00:00Z');
 return new Intl.DateTimeFormat('zh-CN',{timeZone:'UTC',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(d);
}
function groups(items,key){
 const map=new Map();for(const item of items){const k=key(item)||'';if(!map.has(k))map.set(k,[]);map.get(k).push(item);}
 return [...map].sort(([a],[b])=>b.localeCompare(a));
}
function heading(key,count,label){return '<span class="chronicle-date">'+escape(dateLabel(key))+'</span><span class="chronicle-count">'+escape(label)+' · '+count+' 条</span>';}
function render(items,options){
 return '<div class="chronicle">'+groups(items,options.key).map(([key,entries])=>'<details class="chronicle-day" open><summary>'+heading(key,entries.length,options.label)+'</summary><div class="chronicle-entries">'+entries.map((item,i)=>'<div class="chronicle-entry"><div class="chronicle-stamp">'+escape(options.stamp?options.stamp(item):String(i+1).padStart(2,'0'))+'</div><div class="chronicle-content">'+options.card(item)+'</div></div>').join('')+'</div></details>').join('')+'</div>';
}
const api={escape,dateKey,dateLabel,groups,heading,render};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.EmiliaTimeline=api;
})(typeof window==='undefined'?globalThis:window);
