/* LSJN2027 Master Outline module (outline.js)
   Depends on window.LSJN from app.js. Data: data/outline.json (array of nodes). */
(() => {
'use strict';
const L = () => window.LSJN;
const S = () => L().S;
const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
const esc = s => L().esc(s);
const LABELS = ['Rule','Recognition','Steps','Why It Works','Trap','Official Example','Personal Note','Source','Status'];
const LS_OPEN = 'lsjn.outline.open.v1';
const LS_BACKUP = 'lsjn.outline.backup.v1';
let subject = 'LR', editMode = false, query = '';

/* ---------- data helpers ---------- */
const all = () => (S().data.outline || []);
const nodes = () => all().filter(n => !n.deleted);
const byId = id => nodes().find(n => n.section_id === id);
const children = pid => nodes().filter(n => n.parent_id === pid).sort((a,b)=>a.order-b.order);
const root = sub => nodes().find(n => n.level===1 && n.title.trim().toUpperCase()===sub);
const norm = t => String(t||'').toLowerCase().replace(/[\s\u3000]+/g,' ').replace(/[：:。．\.、,;；]+$/,'').trim();
function pathOf(n){ const p=[]; let cur=n; let guard=0; while(cur && guard++<10){ p.unshift(norm(cur.title)); cur = cur.parent_id? byId(cur.parent_id):null; } return p.join(' > '); }
function nextId(){ let n=all().length+1, id; do{ id='OL-'+String(n).padStart(3,'0'); n++; }while(all().some(x=>x.section_id===id)); return id; }
function save(node, by='user', revSummary=''){
  const old=byId(node.section_id);
  if(old && revSummary){ node.revisions=(old.revisions||[]).concat([{date:L().todayLA(), by, summary:revSummary, before:{title:old.title, summary:old.summary, blocks:old.blocks}}]).slice(-20); }
  node.updated_at=L().nowISO(); node.updated_by=by;
  L().persist('outline', node);
}
function subtreeIds(id){ const out=[id]; children(id).forEach(c=>out.push(...subtreeIds(c.section_id))); return out; }
function openSet(){ try{ return new Set(JSON.parse(localStorage.getItem(LS_OPEN)||'[]')); }catch{ return new Set(); } }
function setOpen(id,on){ const s=openSet(); on? s.add(id): s.delete(id); localStorage.setItem(LS_OPEN, JSON.stringify(Array.from(s))); }

/* ---------- blocks <-> text (edit form & docx semantics) ---------- */
function blocksToText(n){
  const out=[]; if(n.summary) out.push(n.summary, '');
  (n.blocks||[]).forEach(b=>{
    if(b.type==='ul') b.items.forEach(i=>out.push('- '+i));
    else if(b.type==='ol') b.items.forEach((i,k)=>out.push((k+1)+'. '+i));
    else out.push((b.label? b.label+': ':'')+b.text);
    out.push('');
  });
  return out.join('\n').trim();
}
function textToBlocks(txt){
  const lines=txt.split('\n'); const blocks=[]; let summary=''; let first=true;
  for(const raw of lines){
    const ln=raw.trimEnd(); if(!ln.trim()) continue;
    let m;
    if((m=ln.match(/^[-*•]\s+(.*)/))){ const last=blocks[blocks.length-1]; if(last&&last.type==='ul') last.items.push(m[1].trim()); else blocks.push({type:'ul',items:[m[1].trim()]}); first=false; continue; }
    if((m=ln.match(/^\d+[.)]\s+(.*)/))){ const last=blocks[blocks.length-1]; if(last&&last.type==='ol') last.items.push(m[1].trim()); else blocks.push({type:'ol',items:[m[1].trim()]}); first=false; continue; }
    const lab=LABELS.find(lb=> ln.toLowerCase().startsWith(lb.toLowerCase()+':'));
    if(lab){ blocks.push({type:'p',label:lab,text:ln.slice(lab.length+1).trim()}); first=false; continue; }
    if(first && !summary){ summary=ln.trim(); first=false; continue; }
    blocks.push({type:'p',text:ln.trim()}); first=false;
  }
  return {summary, blocks};
}
function normBlocks(bs){ return (bs||[]).map(b=> b.type==='p'? {t:'p',l:b.label||'',x:norm(b.text),r:(b.refs||[]).slice().sort().join(';')} : {t:b.type,i:(b.items||[]).map(norm)}); }
function blocksEqual(a,b){ return JSON.stringify(normBlocks(a))===JSON.stringify(normBlocks(b)); }

/* ---------- render ---------- */
function statusTag(n){
  const st=n.status||'草稿'; const cls= st==='已核准'?'ok': st==='已撤回'?'flag':'';
  return `<span class="tag ${cls}">${esc(st)}</span>`;
}
function sourceTag(n){
  const types=new Set((n.source_refs||[]).map(r=>r.type));
  let h=''; if(types.has('LSATLab Notes')) h+='<span class="tag">Notes</span>'; if(types.has('Supplement')) h+='<span class="tag flag">補充</span>'; if(types.has('User Revision')||n.protected) h+='<span class="tag">你的修訂</span>';
  if(n.deletion_suggested) h+='<span class="tag flag">提議刪除</span>'; if((n.proposals||[]).length) h+=`<span class="tag flag">提案 ${n.proposals.length}</span>`;
  return h;
}
function attemptInfo(id){ const a=S().data.attempts.find(x=>x.attempt_id===id); if(!a) return ''; return `${a.attempt_date} ${a.mode} ${a.timed_answer}→${a.correct_answer} ${a.first_correct==='是'?'✓':'✗'}${a.hint_used==='是'?' 提示後':''}${a.reason_correct?' 理由'+a.reason_correct:''}`; }
function renderBlocks(n){
  let h='';
  (n.blocks||[]).forEach(b=>{
    if(b.type==='ul') h+='<ul>'+b.items.map(i=>`<li>${hl(i)}</li>`).join('')+'</ul>';
    else if(b.type==='ol') h+='<ol>'+b.items.map(i=>`<li>${hl(i)}</li>`).join('')+'</ol>';
    else if(b.label==='Official Example'){ const refs=(b.refs||[]); h+=`<div class="ex"><span class="lbl">Official Example</span> ${hl(b.text)}${refs.map(r=>`<br><a href="#" data-att="${esc(r)}">${esc(r)}</a> <span class="small">${esc(attemptInfo(r))}</span>`).join('')}</div>`; }
    else h+=`<p>${b.label?`<span class="lbl">${esc(b.label)}:</span> `:''}${hl(b.text)}</p>`;
  });
  (n.proposals||[]).forEach((p,i)=>{ h+=`<div class="prop"><b>家教提案</b>（${esc(p.date)}，${esc(p.request_id)}）${p.title?`<br>標題 → ${esc(p.title)}`:''}${p.summary?`<br>${esc(p.summary)}`:''}${p.blocks?'<br>'+esc(blocksToText({blocks:p.blocks})).replace(/\n/g,'<br>'):''}<div class="ol-actions"><button class="btn sm" data-prop-accept="${i}" type="button">接受</button><button class="btn ghost sm" data-prop-reject="${i}" type="button">拒絕</button></div></div>`; });
  if(n.deletion_suggested) h+=`<div class="prop"><b>家教提議刪除</b>：${esc(n.deletion_suggested.reason||'')}<div class="ol-actions"><button class="btn warn sm" data-del-accept="1" type="button">確認刪除此節</button><button class="btn ghost sm" data-del-reject="1" type="button">保留</button></div></div>`;
  const src=(n.source_refs||[]).map(r=>`${r.type}${r.ref?`: ${r.ref}`:''}`).join('；');
  if(src) h+=`<div class="src">來源：${esc(src)}${n.updated_at?`　更新 ${esc(n.updated_at.slice(0,10))} ${esc(n.updated_by||'')}`:''}</div>`;
  return h;
}
function hl(t){ const e=esc(t); if(!query) return e; const q=esc(query); const re=new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'ig'); return e.replace(re, m=>`<span class="ol-hit">${m}</span>`); }
function matches(n){ if(!query) return true; const q=query.toLowerCase(); return (n.title+' '+(n.summary||'')+' '+blocksToText({blocks:n.blocks})).toLowerCase().includes(q); }
function subtreeMatches(n){ return matches(n) || children(n.section_id).some(subtreeMatches); }
function renderNode(n, forceOpen){
  const kids=children(n.section_id).filter(k=> !query || subtreeMatches(k));
  const isOpen = forceOpen || openSet().has(n.section_id) || (query && subtreeMatches(n));
  let h=`<details class="ol-node l${n.level}" data-id="${esc(n.section_id)}" ${isOpen?'open':''}><summary><span class="tri">▶</span><span class="ttl">${hl(n.title)}</span><span class="meta">${sourceTag(n)}${n.level>1?statusTag(n):''}</span>${n.summary?`<span class="gist">${hl(n.summary)}</span>`:''}</summary>`;
  if(n.level>1 || (n.blocks||[]).length) h+=`<div class="ol-body">${renderBlocks(n)}</div>`;
  if(editMode) h+=`<div class="ol-actions" style="margin-left:20px"><button class="btn ghost sm" data-edit="${esc(n.section_id)}" type="button">編輯</button>${n.level<4?`<button class="btn ghost sm" data-add="${esc(n.section_id)}" type="button">新增子節</button>`:''}<button class="btn ghost sm" data-up="${esc(n.section_id)}" type="button">上移</button><button class="btn ghost sm" data-down="${esc(n.section_id)}" type="button">下移</button>${n.level>1?`<button class="btn ghost sm" data-move="${esc(n.section_id)}" type="button">移到…</button><button class="btn warn sm" data-del="${esc(n.section_id)}" type="button">刪除</button>`:''}</div>`;
  h+=kids.map(k=>renderNode(k,false)).join('');
  h+='</details>';
  return h;
}
function render(){
  const tree=$('#ol-tree'); if(!tree) return;
  const r=root(subject);
  if(!r){ tree.innerHTML=`<div class="empty">尚無 ${esc(subject)} 大綱。${editMode?'':'開啟「編輯」可建立第一層。'}</div>`+(editMode?`<div class="actions"><button class="btn" type="button" id="ol-create-root">建立 ${esc(subject)} 根節</button></div>`:''); wire(); return; }
  tree.innerHTML=renderNode(r,true);
  wire();
}
function wire(){
  $$('#ol-tree details.ol-node').forEach(d=>{ d.addEventListener('toggle',()=>{ if(!query) setOpen(d.dataset.id, d.open); }); });
  $$('#ol-tree [data-edit]').forEach(b=>b.addEventListener('click',e=>{ e.preventDefault(); openEditor(b.dataset.edit); }));
  $$('#ol-tree [data-add]').forEach(b=>b.addEventListener('click',e=>{ e.preventDefault(); openEditor(null, b.dataset.add); }));
  $$('#ol-tree [data-up]').forEach(b=>b.addEventListener('click',()=>reorder(b.dataset.up,-1)));
  $$('#ol-tree [data-down]').forEach(b=>b.addEventListener('click',()=>reorder(b.dataset.down,1)));
  $$('#ol-tree [data-move]').forEach(b=>b.addEventListener('click',()=>moveDialog(b.dataset.move)));
  $$('#ol-tree [data-del]').forEach(b=>b.addEventListener('click',()=>deleteNode(b.dataset.del)));
  $$('#ol-tree [data-att]').forEach(a=>a.addEventListener('click',e=>{ e.preventDefault(); L().toast(attemptInfo(a.dataset.att)||'找不到作答紀錄'); }));
  $$('#ol-tree [data-prop-accept]').forEach(b=>b.addEventListener('click',()=>proposal(b,true)));
  $$('#ol-tree [data-prop-reject]').forEach(b=>b.addEventListener('click',()=>proposal(b,false)));
  $$('#ol-tree [data-del-accept]').forEach(b=>b.addEventListener('click',()=>{ const id=b.closest('details').dataset.id; deleteNode(id,true); }));
  $$('#ol-tree [data-del-reject]').forEach(b=>b.addEventListener('click',()=>{ const n=Object.assign({},byId(b.closest('details').dataset.id)); delete n.deletion_suggested; save(n,'user','拒絕刪除提議'); render(); }));
  const cr=$('#ol-create-root'); if(cr) cr.addEventListener('click',()=>{ save({section_id:nextId(), parent_id:null, level:1, order:subject==='LR'?1:2, title:subject, summary:'', blocks:[], source_refs:[{type:'LSATLab Notes',ref:subject}], status:'已核准', protected:false, revisions:[]},'user','建立根節'); render(); });
}
function proposal(btn,accept){
  const id=btn.closest('details').dataset.id; const i=Number(btn.dataset.propAccept ?? btn.dataset.propReject);
  const n=Object.assign({},byId(id)); const p=(n.proposals||[])[i]; if(!p) return;
  n.proposals=(n.proposals||[]).filter((_,k)=>k!==i);
  if(accept){ if(p.title) n.title=p.title; if(p.summary!==undefined) n.summary=p.summary; if(p.blocks) n.blocks=p.blocks; if(p.source_refs) n.source_refs=mergeRefs(n.source_refs,p.source_refs); n.status=n.status==='已核准'?'已核准':'草稿'; save(n,'user',`接受提案 ${p.request_id}`); }
  else save(n,'user',`拒絕提案 ${p.request_id}`);
  render();
}
function mergeRefs(a,b){ const out=(a||[]).slice(); (b||[]).forEach(r=>{ if(!out.some(x=>x.type===r.type&&x.ref===r.ref)) out.push(r); }); return out; }

/* ---------- editing ---------- */
function openEditor(id, parentId){
  const n = id? byId(id) : {section_id:null, parent_id:parentId, level:(byId(parentId).level+1), order:children(parentId).length+1, title:'', summary:'', blocks:[], source_refs:[{type:'User Revision',ref:L().todayLA()}], status:'草稿'};
  const host = id? $(`#ol-tree details[data-id="${id}"]`) : $(`#ol-tree details[data-id="${parentId}"]`);
  $$('.ol-edit').forEach(e=>e.remove());
  const div=document.createElement('div'); div.className='ol-edit';
  div.innerHTML=`<label class="f"><span class="l">節名（Heading ${n.level}）</span><input type="text" id="ole-title" value="${esc(n.title)}"></label>
    <label class="f"><span class="l">內容。第一行為收合時顯示的一句用途；「Rule: 」「Steps: 」「Trap: 」「Official Example: 」等標籤開頭為粗體標籤段；「- 」為項目、「1. 」為步驟</span><textarea id="ole-body">${esc(blocksToText(n))}</textarea></label>
    <div class="row"><label class="f"><span class="l">狀態</span><select id="ole-status">${(S().settings.options.outline_status||['草稿','已核准','待確認','已撤回']).map(s=>`<option ${s===(n.status||'草稿')?'selected':''}>${esc(s)}</option>`).join('')}</select></label>
    <label class="f"><span class="l">修訂說明（記入歷史）</span><input type="text" id="ole-rev" placeholder="例：改寫 Rule 一句"></label></div>
    <div class="ol-actions"><button class="btn" type="button" id="ole-save">保存</button><button class="btn ghost" type="button" id="ole-cancel">取消</button></div>`;
  if(id){ const body=$('.ol-body',host); (body||host.querySelector('summary')).insertAdjacentElement('afterend',div); host.open=true; }
  else { host.insertAdjacentElement('beforeend',div); host.open=true; }
  $('#ole-cancel',div).addEventListener('click',()=>div.remove());
  $('#ole-save',div).addEventListener('click',()=>{
    const title=$('#ole-title',div).value.trim(); if(!title){ L().toast('節名必填'); return; }
    const {summary,blocks}=textToBlocks($('#ole-body',div).value);
    const rec=Object.assign({}, n, {section_id:n.section_id||nextId(), title, summary, blocks, status:$('#ole-status',div).value, protected:true, source_refs:mergeRefs(n.source_refs,[{type:'User Revision',ref:L().todayLA()}]), revisions:n.revisions||[]});
    save(rec,'user', $('#ole-rev',div).value.trim() || (id?'使用者編輯':'使用者新增'));
    setOpen(rec.section_id,true); render(); L().toast('已保存，記得同步');
  });
  $('#ole-title',div).focus();
}
function reorder(id,dir){ const n=byId(id); const sibs=children(n.parent_id); const i=sibs.findIndex(x=>x.section_id===id); const j=i+dir; if(j<0||j>=sibs.length) return; const a=Object.assign({},sibs[i]), b=Object.assign({},sibs[j]); const t=a.order; a.order=b.order; b.order=t; if(a.order===b.order){ a.order=j+1; b.order=i+1; } save(a,'user','調整順序'); save(b,'user','調整順序'); render(); }
function moveDialog(id){
  const n=byId(id); const cands=nodes().filter(x=> x.level<4 && x.level<=n.level && !subtreeIds(id).includes(x.section_id) && root(subject) && pathOf(x).startsWith(norm(subject)));
  const pick=prompt('移到哪一節底下？輸入編號：\n'+cands.map(c=>`${c.section_id}  ${'　'.repeat(c.level-1)}${c.title}`).join('\n'));
  if(!pick) return; const target=byId(pick.trim().toUpperCase()); if(!target||!cands.includes(target)){ L().toast('無效的目標'); return; }
  moveTo(id, target.section_id, children(target.section_id).length+1, 'user'); render();
}
function moveTo(id, newParent, order, by){
  const n=Object.assign({},byId(id)); const delta=(byId(newParent).level+1)-n.level;
  n.parent_id=newParent; n.order=order; n.level+=delta; save(n,by,'移動節');
  if(delta) subtreeIds(id).slice(1).forEach(cid=>{ const c=Object.assign({},byId(cid)); c.level+=delta; save(c,by,'隨父節移動'); });
}
function deleteNode(id, confirmed){
  const n=byId(id); const ids=subtreeIds(id);
  if(!confirmed && !confirm(`刪除「${n.title}」${ids.length>1?`及其 ${ids.length-1} 個子節`:''}？此動作會記入修訂歷史，並保留在同步前的備份。`)) return;
  backup('刪除前備份');
  const local=L().readLocal(); local.outline=local.outline||{pending:[],snapshot:[]};
  const rest=nodes().filter(x=>!ids.includes(x.section_id));
  S().data.outline=rest; local.outline.pending=(local.outline.pending||[]).filter(x=>!ids.includes(x.section_id)); local.outline.snapshot=rest; L().writeLocal(local);
  // deletion must reach the repo: mark tombstones so mergeById does not resurrect from remote
  ids.forEach(did=>{ L().persist('outline',{section_id:did, parent_id:null, level:9, order:0, title:'', deleted:true, deleted_at:L().nowISO(), updated_at:L().nowISO(), updated_by:'user'}); });
  render(); L().toast('已刪除（墓碑記錄），記得同步');
}
function backup(reason){ try{ localStorage.setItem(LS_BACKUP, JSON.stringify({date:L().nowISO(), reason, outline:nodes()})); }catch{} }

/* ---------- writeback ops ---------- */
function validateOp(op,d){
  if(op==='add_section'){ if(!d.title||!d.parent_id) return '需 title 與 parent_id'; const p=byId(d.parent_id); if(!p) return '找不到 parent_id'; if(p.level>=4) return '父節已達第 4 層'; if(!d.source_type) return '需 source_type'; if(children(p.section_id).some(c=>norm(c.title)===norm(d.title))) return '同名節已存在，請用 update_section'; return ''; }
  if(op==='update_section'){ if(!d.section_id||!byId(d.section_id)) return '找不到 section_id'; if(!d.blocks&&!d.title&&d.summary===undefined) return '無變更內容'; return ''; }
  if(op==='move_section'){ if(!d.section_id||!byId(d.section_id)) return '找不到 section_id'; if(!d.parent_id||!byId(d.parent_id)) return '找不到 parent_id'; if(subtreeIds(d.section_id).includes(d.parent_id)) return '不能移到自己的子節'; return ''; }
  if(op==='suggest_section_deletion'){ if(!d.section_id||!byId(d.section_id)) return '找不到 section_id'; if(byId(d.section_id).level===1) return '不能刪除根節'; return ''; }
  return '未知操作';
}
function applyOp(op,d,reqId){
  const t=L().todayLA();
  if(op==='add_section'){ const p=byId(d.parent_id); const blocks=Array.isArray(d.blocks)? d.blocks : textToBlocks(d.blocks||'').blocks;
    save({section_id:nextId(), parent_id:p.section_id, level:p.level+1, order:d.order||children(p.section_id).length+1, title:d.title, summary:d.summary||'', blocks, source_refs:[{type:d.source_type, ref:d.source_ref||reqId}], status:'草稿', protected:false, revisions:[], client_request_id:reqId},'tutor','家教新增'); }
  else if(op==='update_section'){ const n=Object.assign({},byId(d.section_id)); const blocks= d.blocks? (Array.isArray(d.blocks)? d.blocks : textToBlocks(d.blocks).blocks) : undefined;
    const refs = d.source_type? [{type:d.source_type, ref:d.source_ref||reqId}] : [];
    if(n.protected){ n.proposals=(n.proposals||[]).concat([{request_id:reqId, date:t, title:d.title, summary:d.summary, blocks, source_refs:refs}]); save(n,'tutor','家教提案（待確認）'); }
    else { if(d.title) n.title=d.title; if(d.summary!==undefined) n.summary=d.summary; if(blocks) n.blocks=d.mode==='append'? (n.blocks||[]).concat(blocks) : blocks; n.source_refs=mergeRefs(n.source_refs,refs); n.status='草稿'; save(n,'tutor',`家教更新 ${reqId}`); } }
  else if(op==='move_section'){ moveTo(d.section_id, d.parent_id, d.order||children(d.parent_id).length+1, 'tutor'); }
  else if(op==='suggest_section_deletion'){ const n=Object.assign({},byId(d.section_id)); n.deletion_suggested={request_id:reqId, date:t, reason:d.reason||''}; save(n,'tutor','家教提議刪除'); }
}

/* ---------- DOCX export ---------- */
const XML_HEAD='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
const xe = s => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function runs(text, boldPrefix){ let h=''; if(boldPrefix) h+=`<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${xe(boldPrefix)}</w:t></w:r>`; h+=`<w:r><w:t xml:space="preserve">${xe(text)}</w:t></w:r>`; return h; }
function para(text, style, boldPrefix, numId){ return `<w:p><w:pPr>${style?`<w:pStyle w:val="${style}"/>`:''}${numId?`<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr>`:''}</w:pPr>${runs(text,boldPrefix)}</w:p>`; }
function docxBody(){
  let body=''; let numCounter=2; const numDefs=[];
  const emit=(n)=>{
    body+=para(n.title,'Heading'+n.level);
    if(n.summary) body+=para(n.summary);
    (n.blocks||[]).forEach(b=>{
      if(b.type==='ul'){ b.items.forEach(i=>body+=para(i,'ListParagraph',null,1)); }
      else if(b.type==='ol'){ numCounter++; numDefs.push(numCounter); b.items.forEach(i=>body+=para(i,'ListParagraph',null,numCounter)); }
      else body+=para(b.text+((b.refs&&b.refs.length)? ' ['+b.refs.join('; ')+']':''), null, b.label? b.label+': ':null);
    });
    children(n.section_id).forEach(emit);
  };
  ['LR','RC'].forEach(sub=>{ const r=root(sub); if(r) emit(r); });
  return {body, numDefs};
}
function stylesXml(){
  const H=(i,sz)=>`<w:style w:type="paragraph" w:styleId="Heading${i}"><w:name w:val="heading ${i}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${i===1?480:240}" w:after="80"/><w:outlineLvl w:val="${i-1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/></w:rPr></w:style>`;
  return XML_HEAD+`<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Noto Sans TC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>${H(1,40)}${H(2,32)}${H(3,26)}${H(4,22)}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:ind w:left="720"/></w:pPr></w:style></w:styles>`;
}
function numberingXml(numDefs){
  let abs=`<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`;
  abs+=`<w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>`;
  let nums=`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`;
  numDefs.forEach(id=>{ nums+=`<w:num w:numId="${id}"><w:abstractNumId w:val="1"/><w:lvlOverride w:ilvl="0"><w:startOverride w:val="1"/></w:lvlOverride></w:num>`; });
  return XML_HEAD+`<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${abs}${nums}</w:numbering>`;
}
function loadScript(src){ return new Promise((res,rej)=>{ if(window.JSZip) return res(); if(document.querySelector(`script[src="${src}"]`)) return res(); const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('無法載入 JSZip')); document.head.appendChild(s); }); }
async function ensureZip(){ try{ await loadScript('vendor/jszip.min.js'); }catch{ await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'); } }
async function exportDocx(){
  try{ await ensureZip(); }catch(e){ L().toast(e.message); return; }
  const {body,numDefs}=docxBody();
  const zip=new JSZip();
  zip.file('[Content_Types].xml', XML_HEAD+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/></Types>`);
  zip.file('_rels/.rels', XML_HEAD+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', XML_HEAD+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/></Relationships>`);
  zip.file('word/styles.xml', stylesXml());
  zip.file('word/numbering.xml', numberingXml(numDefs));
  zip.file('word/document.xml', XML_HEAD+`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`);
  const blob=await zip.generateAsync({type:'blob', mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
  download(blob,'LSAT_Master_Outline.docx'); L().toast('已產生 LSAT_Master_Outline.docx');
}
function exportJson(){ const blob=new Blob([JSON.stringify({format:'lsjn-outline',version:1,exported:L().nowISO(),nodes:nodes().filter(n=>!n.deleted)},null,2)],{type:'application/json'}); download(blob,'LSAT_Master_Outline.json'); }
function download(blob,name){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }

/* ---------- DOCX / JSON import with preview ---------- */
async function parseDocx(file){
  await ensureZip();
  const zip=await JSZip.loadAsync(file);
  const docXml=await zip.file('word/document.xml').async('string');
  const numXml= zip.file('word/numbering.xml')? await zip.file('word/numbering.xml').async('string') : '';
  const dp=new DOMParser(); const doc=dp.parseFromString(docXml,'application/xml'); const numDoc= numXml? dp.parseFromString(numXml,'application/xml') : null;
  const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  // numId -> fmt
  const fmtOf={}; if(numDoc){ const absFmt={}; Array.from(numDoc.getElementsByTagNameNS(W,'abstractNum')).forEach(a=>{ const lvl=a.getElementsByTagNameNS(W,'lvl')[0]; const f=lvl&&lvl.getElementsByTagNameNS(W,'numFmt')[0]; absFmt[a.getAttributeNS(W,'abstractNumId')]= f? f.getAttributeNS(W,'val'):'bullet'; }); Array.from(numDoc.getElementsByTagNameNS(W,'num')).forEach(n=>{ const a=n.getElementsByTagNameNS(W,'abstractNumId')[0]; fmtOf[n.getAttributeNS(W,'numId')]= absFmt[a? a.getAttributeNS(W,'val'):'']||'bullet'; }); }
  const paras=Array.from(doc.getElementsByTagNameNS(W,'body')[0].children).filter(e=>e.localName==='p');
  const flat=[]; // {kind:'h', level, text} | {kind:'p', text, boldPrefix} | {kind:'li', fmt, text}
  for(const p of paras){
    const pPr=p.getElementsByTagNameNS(W,'pPr')[0]; const st=pPr&&pPr.getElementsByTagNameNS(W,'pStyle')[0]; const style= st? st.getAttributeNS(W,'val'):'';
    const rs=Array.from(p.getElementsByTagNameNS(W,'r')); let text='', boldPrefix='', seenNonBold=false;
    rs.forEach(r=>{ const t=Array.from(r.getElementsByTagNameNS(W,'t')).map(x=>x.textContent).join(''); if(!t) return; const b=r.getElementsByTagNameNS(W,'b')[0]; const isB= b && b.getAttributeNS(W,'val')!=='0' && b.getAttributeNS(W,'val')!=='false'; if(isB&&!seenNonBold) boldPrefix+=t; else seenNonBold=true; text+=t; });
    text=text.replace(/\s+/g,' ').trim(); if(!text) continue;
    const hm= style.match(/^Heading([1-4])$/) || style.match(/^heading\s?([1-4])$/i);
    if(hm){ flat.push({kind:'h',level:Number(hm[1]),text}); continue; }
    if(/^(Title|Subtitle)$/i.test(style)) continue;
    const numPr=pPr&&pPr.getElementsByTagNameNS(W,'numPr')[0];
    if(numPr){ const nid=numPr.getElementsByTagNameNS(W,'numId')[0]; const fmt=fmtOf[nid? nid.getAttributeNS(W,'val'):'']||'bullet'; flat.push({kind:'li',fmt: fmt==='bullet'?'ul':'ol',text}); continue; }
    flat.push({kind:'p',text,boldPrefix:boldPrefix.trim()});
  }
  return flatToTree(flat);
}
function flatToTree(flat){
  const out=[]; const stack=[]; let cur=null; const errors=[];
  const finish=()=>{ if(!cur) return; const {summary,blocks}=linesToBlocks(cur._lines); cur.summary=summary; cur.blocks=blocks; delete cur._lines; };
  for(const it of flat){
    if(it.kind==='h'){ finish(); if(it.level>1 && stack.length===0) errors.push(`「${it.text}」在任何 Heading 1 之前出現`); if(it.level>stack.length+1) errors.push(`「${it.text}」跳層（Heading ${it.level} 直接接在 Heading ${stack.length} 之下）`);
      while(stack.length>=it.level) stack.pop(); const parentPath=stack.map(s=>norm(s.text)).join(' > ');
      cur={level:it.level,title:it.text,path:(parentPath?parentPath+' > ':'')+norm(it.text),parentPath,order:0,_lines:[]}; stack.push(it); out.push(cur); }
    else if(cur){ cur._lines.push(it); }
    else if(it.text) errors.push('第一個標題前有內容，已忽略：'+it.text.slice(0,30));
  }
  finish();
  const seen=new Map(); out.forEach(n=>{ if(seen.has(n.path)) errors.push('重複的標題路徑：'+n.path); seen.set(n.path,1); });
  // order within parent
  const counters={}; out.forEach(n=>{ counters[n.parentPath]=(counters[n.parentPath]||0)+1; n.order=counters[n.parentPath]; });
  return {nodes:out, errors:errors.filter(e=>!e.startsWith('第一個標題前'))};
}
function linesToBlocks(lines){
  const blocks=[]; let summary=''; let first=true;
  for(const it of lines){
    if(it.kind==='li'){ const last=blocks[blocks.length-1]; if(last&&last.type===it.fmt) last.items.push(it.text); else blocks.push({type:it.fmt,items:[it.text]}); first=false; continue; }
    let label=null, text=it.text;
    const bp=(it.boldPrefix||'').replace(/[:：]\s*$/,''); const lab=LABELS.find(l=>l.toLowerCase()===bp.toLowerCase()) || LABELS.find(l=> it.text.toLowerCase().startsWith(l.toLowerCase()+':'));
    if(lab){ label=lab; text=it.text.replace(new RegExp('^'+lab.replace(/ /g,'\\s')+'\\s*[:：]\\s*','i'),'').trim(); }
    if(!label && first && !summary){ summary=text; first=false; continue; }
    let refs=null; const rm=text.match(/\s*\[((?:A-[A-Za-z0-9-]+)(?:;\s*A-[A-Za-z0-9-]+)*)\]$/); if(rm){ refs=rm[1].split(/;\s*/); text=text.slice(0,rm.index).trim(); }
    const blk= label? {type:'p',label,text}:{type:'p',text}; if(refs) blk.refs=refs; blocks.push(blk); first=false;
  }
  return {summary,blocks};
}
function diff(imported){
  const existing=nodes().filter(n=>!n.deleted); const exByPath=new Map(existing.map(n=>[pathOf(n),n]));
  const impByPath=new Map(imported.map(n=>[n.path,n]));
  const res={added:[],edited:[],moved:[],renamed:[],deleted:[],unchanged:[],conflicts:[]};
  imported.forEach(n=>{
    const ex=exByPath.get(n.path);
    if(ex){ if(norm(ex.summary||'')===norm(n.summary||'') && blocksEqual(ex.blocks,n.blocks) && ex.title===n.title) res.unchanged.push({imp:n,ex}); else res.edited.push({imp:n,ex}); return; }
    // moved: same title exists elsewhere at any level and that path is missing from import
    const cand=existing.filter(e=> norm(e.title)===norm(n.title) && !impByPath.has(pathOf(e)));
    if(cand.length===1){ res.moved.push({imp:n,ex:cand[0]}); return; }
    if(cand.length>1){ res.conflicts.push({imp:n,msg:'多個同名節可能對應，請在 Google Docs 改為不同名稱後重試'}); return; }
    // renamed: same parent path, same order position, content equal
    const sibs=existing.filter(e=> (e.parent_id? pathOf(byId(e.parent_id)):'')===n.parentPath && !impByPath.has(pathOf(e)));
    const ren=sibs.find(e=> blocksEqual(e.blocks,n.blocks) && norm(e.summary||'')===norm(n.summary||'') && (e.blocks||[]).length+ (e.summary?1:0) > 0);
    if(ren){ res.renamed.push({imp:n,ex:ren}); return; }
    res.added.push({imp:n});
  });
  const claimed=new Set([...res.unchanged,...res.edited,...res.moved,...res.renamed].map(x=>x.ex.section_id));
  existing.forEach(e=>{ if(!claimed.has(e.section_id) && e.level>1) res.deleted.push({ex:e}); });
  return res;
}
let PENDING=null;
function renderPreview(res, errors, sourceName){
  const host=$('#ol-import-preview'); PENDING={res, sourceName};
  if(errors.length){ host.innerHTML=`<div class="diff-grp"><h3>匯入被拒絕（未變更任何資料）</h3><ul class="list">${errors.map(e=>`<li><span class="tag flag">錯誤</span> ${esc(e)}</li>`).join('')}</ul><div class="small">請在文件中修正標題層級或重複路徑後重試。</div></div>`; PENDING=null; return; }
  const total=res.added.length+res.edited.length+res.moved.length+res.renamed.length;
  const grp=(title,arr,fn,cls='')=> arr.length? `<div class="diff-grp"><h3>${title}（${arr.length}）</h3><ul class="list">${arr.map(fn).join('')}</ul></div>`:'';
  host.innerHTML=`<div class="hint">來源：${esc(sourceName)}。預設「合併」：套用新增、修改、移動、改名；不刪除任何節。勾選的「可能刪除」才會刪。套用前會建立可還原備份。</div>`+
    grp('新增節',res.added,x=>`<li><span class="tag ok">新增</span> H${x.imp.level} ${esc(x.imp.path)}</li>`)+
    grp('修改內容',res.edited,x=>`<li><span class="tag">修改</span> ${esc(x.imp.path)}${x.ex.protected?'':''}<div class="small">${esc(blocksToText({summary:x.imp.summary,blocks:x.imp.blocks})).slice(0,160)}</div></li>`)+
    grp('改名',res.renamed,x=>`<li><span class="tag">改名</span> ${esc(x.ex.title)} → ${esc(x.imp.title)}</li>`)+
    grp('移動',res.moved,x=>`<li><span class="tag">移動</span> ${esc(x.ex.title)}：${esc(pathOf(x.ex))} → ${esc(x.imp.path)}</li>`)+
    grp('衝突或無法對應',res.conflicts,x=>`<li><span class="tag flag">衝突</span> ${esc(x.imp.path)}：${esc(x.msg)}</li>`)+
    grp('可能刪除（文件中不存在；預設不刪）',res.deleted,(x,i)=>`<li><label><input type="checkbox" data-delidx="${i}"> <span>${esc(pathOf(x.ex))}${(x.ex.blocks||[]).length?`（含 ${x.ex.blocks.length} 段內容）`:''}</span></label></li>`)+
    grp('未變更',res.unchanged,x=>`<li class="small">${esc(x.imp.path)}</li>`)+
    (res.conflicts.length? `<div class="hint"><span class="tag flag">有衝突</span> 存在無法對應的節時不套用，請先處理。</div>` :
     total===0 && !res.deleted.length ? `<div class="hint">文件與目前大綱相同，無需套用。</div>` :
     `<div class="actions"><button class="btn" type="button" id="ol-apply-merge">套用（合併${total}項${res.deleted.length?'＋勾選的刪除':''}）</button><button class="btn ghost" type="button" id="ol-apply-cancel">取消</button></div>`);
  const ap=$('#ol-apply-merge'); if(ap) ap.addEventListener('click',()=>applyImport());
  const cn=$('#ol-apply-cancel'); if(cn) cn.addEventListener('click',()=>{ host.innerHTML=''; PENDING=null; });
}
function applyImport(){
  const {res}=PENDING; backup('匯入前備份');
  const t=L().todayLA(); const ref={type:'User Revision',ref:`Google Docs 匯入 ${t}`};
  res.edited.forEach(x=>{ const n=Object.assign({},x.ex,{title:x.imp.title, summary:x.imp.summary, blocks:x.imp.blocks, protected:true, source_refs:mergeRefs(x.ex.source_refs,[ref])}); save(n,'user','Google Docs 修改'); });
  res.renamed.forEach(x=>{ const n=Object.assign({},x.ex,{title:x.imp.title, protected:true, source_refs:mergeRefs(x.ex.source_refs,[ref])}); save(n,'user',`改名自「${x.ex.title}」`); });
  res.moved.forEach(x=>{ const parent=findByPath(x.imp.parentPath); if(parent) moveTo(x.ex.section_id, parent.section_id, x.imp.order, 'user'); if(!blocksEqual(x.ex.blocks,x.imp.blocks)||norm(x.ex.summary||'')!==norm(x.imp.summary||'')){ const n=Object.assign({},byId(x.ex.section_id),{summary:x.imp.summary,blocks:x.imp.blocks,protected:true}); save(n,'user','移動後修改'); } });
  // added: in order of level so parents exist
  res.added.slice().sort((a,b)=>a.imp.level-b.imp.level).forEach(x=>{ const parent=findByPath(x.imp.parentPath); if(!parent){ L().toast('找不到父節：'+x.imp.path); return; } save({section_id:nextId(), parent_id:parent.section_id, level:parent.level+1, order:x.imp.order, title:x.imp.title, summary:x.imp.summary, blocks:x.imp.blocks, source_refs:[ref], status:'草稿', protected:true, revisions:[]},'user','Google Docs 新增'); });
  // reorder siblings per imported order
  const impOrder=new Map(); [...res.unchanged,...res.edited,...res.renamed,...res.moved].forEach(x=>impOrder.set(x.ex.section_id,x.imp.order));
  impOrder.forEach((ord,id)=>{ const n=byId(id); if(n && n.order!==ord){ const c=Object.assign({},n,{order:ord}); save(c,'user','依文件順序'); } });
  $$('#ol-import-preview input[data-delidx]:checked').forEach(cb=>{ const x=res.deleted[Number(cb.dataset.delidx)]; if(x) deleteNode(x.ex.section_id,true); });
  $('#ol-import-preview').innerHTML='<div class="hint">已套用。到「同步」按立即同步，或此頁已自動排入同步。</div>'; PENDING=null; render(); L().toast('匯入已套用，記得同步');
}
function findByPath(path){ if(!path) return null; return nodes().find(n=>!n.deleted && pathOf(n)===path)||null; }
async function importFile(file){
  const host=$('#ol-import-preview'); host.innerHTML='<div class="small">解析中…</div>';
  try{
    if(file.name.toLowerCase().endsWith('.json')){
      const j=JSON.parse(await file.text()); if(!j||j.format!=='lsjn-outline'||!Array.isArray(j.nodes)) throw new Error('不是本 App 的大綱備份格式');
      const imp=j.nodes.filter(n=>!n.deleted).map(n=>{ const p=[]; let cur=n; let g=0; while(cur&&g++<10){ p.unshift(norm(cur.title)); cur=j.nodes.find(x=>x.section_id===cur.parent_id); } return {level:n.level,title:n.title,summary:n.summary||'',blocks:n.blocks||[],path:p.join(' > '),parentPath:p.slice(0,-1).join(' > '),order:n.order||1}; });
      const seen=new Set(); const errors=[]; imp.forEach(n=>{ if(seen.has(n.path)) errors.push('重複路徑：'+n.path); seen.add(n.path); });
      renderPreview(diff(imp), errors, file.name);
    } else {
      const {nodes:imp, errors}=await parseDocx(file);
      if(!imp.length) errors.push('文件中沒有 Heading 1–4 標題');
      renderPreview(diff(imp), errors, file.name);
    }
  }catch(e){ console.error(e); host.innerHTML=`<div class="diff-grp"><span class="tag flag">錯誤</span> ${esc(e.message)}</div>`; }
}

/* ---------- init ---------- */
function init(){
  if(!$('#ol-tree')) return;
  $$('#ol-subject button').forEach(b=>b.addEventListener('click',()=>{ subject=b.dataset.sub; $$('#ol-subject button').forEach(x=>x.setAttribute('aria-pressed',String(x===b))); render(); }));
  $('#ol-expand').addEventListener('click',()=>{ const r=root(subject); if(!r) return; const s=openSet(); subtreeIds(r.section_id).forEach(id=>s.add(id)); localStorage.setItem(LS_OPEN, JSON.stringify(Array.from(s))); render(); });
  $('#ol-collapse').addEventListener('click',()=>{ const r=root(subject); if(!r) return; const s=openSet(); subtreeIds(r.section_id).forEach(id=>s.delete(id)); localStorage.setItem(LS_OPEN, JSON.stringify(Array.from(s))); render(); });
  $('#ol-edit-toggle').addEventListener('click',e=>{ editMode=!editMode; e.currentTarget.setAttribute('aria-pressed',String(editMode)); e.currentTarget.textContent= editMode?'完成編輯':'編輯'; render(); });
  let tmr; $('#ol-search').addEventListener('input',e=>{ clearTimeout(tmr); tmr=setTimeout(()=>{ query=e.target.value.trim(); render(); },150); });
  $('#ol-export-docx').addEventListener('click',exportDocx);
  $('#ol-export-json').addEventListener('click',exportJson);
  $('#ol-import-file').addEventListener('change',e=>{ const f=e.target.files[0]; if(f) importFile(f); e.target.value=''; });
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
if(window.LSJN && window.LSJN.S && window.LSJN.S.settings) render();
window.LSJN_OUTLINE={render, validateOp, applyOp, parseDocxForTest: parseDocx, diffForTest: diff, textToBlocks, blocksToText, nodes};
})();
