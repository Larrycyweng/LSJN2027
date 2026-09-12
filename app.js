/* LSJN2027 訓練紀錄 — app.js
   資料權威：repo 內 data/*.json。此檔只做輸入、彙整、匯出與同步。 */
(() => {
'use strict';

const FILES = ['sessions','attempts','exposure','signatures','hypotheses','checkpoints','cards','handoffs','progress'];
const ID_KEY = {sessions:'session_id', attempts:'attempt_id', exposure:'pt_id',
                signatures:'signature_id', hypotheses:'hypothesis_id', checkpoints:'checkpoint_id', cards:'card_id', handoffs:'handoff_id', progress:'item_id'};
const LS_LOCAL = 'lsjn.local.v1';
const LS_GH = 'lsjn.gh.v1';
const APP_VERSION = '0.3.0';

const S = { settings:null, data:{}, dirty:new Set(), remoteOk:false, gh:null };

/* ---------- utilities ---------- */
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad2 = n => String(n).padStart(2,'0');
const nowISO = () => new Date().toISOString();

function todayLA(){
  const tz = (S.settings && S.settings.timezone) || 'America/Los_Angeles';
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const g = t => p.find(x=>x.type===t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function dateDiffDays(a,b){ // b - a in days, strings YYYY-MM-DD
  return Math.round((Date.UTC(...b.split('-').map((v,i)=>i===1?+v-1:+v)) - Date.UTC(...a.split('-').map((v,i)=>i===1?+v-1:+v)))/86400000);
}
function addDays(d,n){ const t=new Date(Date.UTC(...d.split('-').map((v,i)=>i===1?+v-1:+v))); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10); }
function fmtMin(m){ return (m/60).toFixed(1); }
function pct(n,d){ return d? Math.round(100*n/d)+'%' : '—'; }

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('show'),2200); }

function b64encode(str){ const bytes=new TextEncoder().encode(str); let bin=''; bytes.forEach(b=>bin+=String.fromCharCode(b)); return btoa(bin); }
function b64decode(b64){ const bin=atob(b64.replace(/\s/g,'')); const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0)); return new TextDecoder().decode(bytes); }

/* ---------- plan-derived context ---------- */
function phaseFor(date){
  const ph = S.settings.phases.find(p => date>=p.start && date<=p.end);
  return ph || (date < S.settings.plan_start ? S.settings.phases[0] : S.settings.phases[S.settings.phases.length-1]);
}
function weekIndex(date){ return Math.floor(dateDiffDays(S.settings.plan_start, date)/7); }
function weekLabel(date){ const w=weekIndex(date); return w<=0 ? '起始週' : `第${w}週`; }
function weekRange(date){ const w=Math.max(0,weekIndex(date)); const s=addDays(S.settings.plan_start, w*7); return [s, addDays(s,6)]; }
function nextCheckpoint(){ return (S.data.checkpoints||[]).slice().sort((a,b)=>a.review_date<b.review_date?-1:1).find(c=>c.checkpoint_status!=='已完成'); }

/* ---------- derived per-record ---------- */
function deriveAttempt(a){
  a.first_correct = a.timed_answer && a.correct_answer ? (a.timed_answer===a.correct_answer ? '是':'否') : '';
  a.blind_correct = a.blind_review_answer && a.correct_answer ? (a.blind_review_answer===a.correct_answer ? '是':'否') : '';
  const flag = a.first_correct==='否' || a.confidence==='低' || a.overtime==='是' || a.guessed==='是' || a.reason_correct==='否';
  a.review_flag = flag ? '是' : '否';
  return a;
}
function flagReasons(a){
  const r=[]; if(a.first_correct==='否') r.push('答錯'); if(a.confidence==='低') r.push('低信心');
  if(a.overtime==='是') r.push('逾時'); if(a.guessed==='是') r.push('猜測'); if(a.reason_correct==='否') r.push('理由不正確');
  return r;
}

/* ---------- storage: local overlay + remote ---------- */
function readLocal(){ try{ return JSON.parse(localStorage.getItem(LS_LOCAL)||'{}'); }catch{ return {}; } }
function writeLocal(obj){ localStorage.setItem(LS_LOCAL, JSON.stringify(obj)); }

function mergeById(remote, local, key){
  const map = new Map();
  (remote||[]).forEach(r => map.set(r[key], r));
  (local||[]).forEach(l => {
    const r = map.get(l[key]);
    if(!r || (l.updated_at||'') >= (r.updated_at||'')) map.set(l[key], l);
  });
  return Array.from(map.values());
}

async function fetchJSON(path){
  const res = await fetch(path + '?t=' + Date.now(), {cache:'no-store'});
  if(!res.ok) throw new Error(path+' '+res.status);
  return res.json();
}

async function loadAll(){
  let remoteOk = true;
  try{ S.settings = await fetchJSON('data/settings.json'); }
  catch(e){ remoteOk=false; S.settings = JSON.parse(localStorage.getItem('lsjn.settings.cache')||'null'); }
  if(!S.settings){ toast('讀不到 data/settings.json。請先部署到 GitHub Pages 或用本機伺服器開啟。'); throw new Error('no settings'); }
  localStorage.setItem('lsjn.settings.cache', JSON.stringify(S.settings));

  const local = readLocal();
  for(const f of FILES){
    let remote = [];
    try{ remote = await fetchJSON(`data/${f}.json`); }catch(e){ remoteOk=false; remote = (local[f]&&local[f].snapshot)||[]; }
    const pending = (local[f]&&local[f].pending)||[];
    S.data[f] = mergeById(remote, pending, ID_KEY[f]);
    if(pending.length) S.dirty.add(f);
  }
  S.data.attempts.forEach(deriveAttempt);
  S.remoteOk = remoteOk;
  updateSyncIndicator();
}

function persist(file, record){
  // record already has updated_at; put in local pending and in-memory state
  const key = ID_KEY[file];
  S.data[file] = mergeById(S.data[file], [record], key);
  const local = readLocal();
  local[file] = local[file] || {pending:[], snapshot:[]};
  local[file].pending = mergeById(local[file].pending, [record], key);
  local[file].snapshot = S.data[file];
  writeLocal(local);
  S.dirty.add(file);
  updateSyncIndicator();
}

function updateSyncIndicator(){
  const el=$('#sync-ind'), tx=$('#sync-text');
  el.className='sync';
  if(S.dirty.size){ el.classList.add('dirty'); tx.textContent=`未同步 ${S.dirty.size} 檔`; }
  else if(S.remoteOk){ el.classList.add('clean'); tx.textContent='已同步'; }
  else { el.classList.add('local'); tx.textContent='本機'; }
}

/* ---------- GitHub sync ---------- */
function loadGh(){
  let gh; try{ gh=JSON.parse(localStorage.getItem(LS_GH)||'null'); }catch{}
  if(!gh){
    const host=location.hostname, seg=location.pathname.split('/').filter(Boolean)[0]||'';
    gh={owner: host.endsWith('.github.io')? host.split('.')[0]:'', repo: seg, branch:'main', token:''};
  }
  S.gh=gh;
  $('#gh-owner').value=gh.owner||''; $('#gh-repo').value=gh.repo||''; $('#gh-branch').value=gh.branch||'main'; $('#gh-token').value=gh.token||'';
}
function saveGh(){
  S.gh={owner:$('#gh-owner').value.trim(), repo:$('#gh-repo').value.trim(), branch:$('#gh-branch').value.trim()||'main', token:$('#gh-token').value.trim()};
  localStorage.setItem(LS_GH, JSON.stringify(S.gh)); toast('已保存設定'); renderSettings();
}
async function ghRequest(method, path, body){
  const res = await fetch(`https://api.github.com/repos/${S.gh.owner}/${S.gh.repo}/contents/${path}`+(method==='GET'?`?ref=${S.gh.branch}&t=${Date.now()}`:''),{
    method, headers:{'Authorization':`Bearer ${S.gh.token}`,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},
    body: body? JSON.stringify(body):undefined });
  if(res.status===404 && method==='GET') return null;
  if(!res.ok){ const t=await res.text(); throw new Error(`${res.status} ${t.slice(0,160)}`); }
  return res.json();
}
async function syncNow(){
  if(!S.gh||!S.gh.token||!S.gh.owner||!S.gh.repo){ toast('請先填寫 owner、repo 與 token'); return; }
  if(!S.dirty.size){ toast('沒有需要同步的變更'); return; }
  const btn=$('#btn-sync'); btn.disabled=true;
  const local=readLocal();
  try{
    for(const f of Array.from(S.dirty)){
      const path=`data/${f}.json`;
      const cur = await ghRequest('GET', path);
      const remote = cur ? JSON.parse(b64decode(cur.content)) : [];
      const merged = mergeById(remote, (local[f]&&local[f].pending)||[], ID_KEY[f]);
      merged.sort((a,b)=> String(a[ID_KEY[f]]).localeCompare(String(b[ID_KEY[f]])));
      const body={message:`update ${f} (${todayLA()})`, content:b64encode(JSON.stringify(merged,null,2)+'\n'), branch:S.gh.branch};
      if(cur) body.sha=cur.sha;
      await ghRequest('PUT', path, body);
      S.data[f]=merged; if(f==='attempts') S.data[f].forEach(deriveAttempt);
      local[f]={pending:[], snapshot:merged}; S.dirty.delete(f);
    }
    writeLocal(local); S.remoteOk=true; updateSyncIndicator(); renderAll(); toast('同步完成');
  }catch(e){ console.error(e); toast('同步失敗：'+e.message); }
  finally{ btn.disabled=false; }
}

/* ---------- segmented controls ---------- */
function optList(name){
  const o=S.settings.options;
  if(name==='yes_no') return o.yes_no_unknown.slice(0,2);
  return o[name]||[];
}
function buildSegs(root=document){
  $$('.seg[data-opt]', root).forEach(seg=>{
    if(seg.dataset.built) return; seg.dataset.built='1';
    optList(seg.dataset.opt).forEach(v=>{
      const b=document.createElement('button'); b.type='button'; b.textContent=v; b.setAttribute('aria-pressed','false');
      b.addEventListener('click',()=>{
        const on=b.getAttribute('aria-pressed')==='true';
        $$('button',seg).forEach(x=>x.setAttribute('aria-pressed','false'));
        if(!(on && seg.dataset.clearable)) { b.setAttribute('aria-pressed','true'); seg.dataset.value=v; } else { seg.dataset.value=''; }
        seg.dispatchEvent(new CustomEvent('segchange',{bubbles:true,detail:{name:seg.dataset.seg,value:seg.dataset.value||''}}));
      });
      seg.appendChild(b);
    });
  });
}
function segValue(form,name){ const s=form.querySelector(`.seg[data-seg="${name}"]`); return s? (s.dataset.value||''):''; }
function segSet(form,name,val){ const s=form.querySelector(`.seg[data-seg="${name}"]`); if(!s) return; s.dataset.value=val||''; $$('button',s).forEach(b=>b.setAttribute('aria-pressed', String(b.textContent===val))); }
function segReset(form){ $$('.seg',form).forEach(s=>{ s.dataset.value=''; $$('button',s).forEach(b=>b.setAttribute('aria-pressed','false')); }); }
function fillSelect(sel, list, withBlank){ sel.innerHTML=(withBlank?'<option value=""></option>':'')+list.map(v=>`<option>${esc(v)}</option>`).join(''); }

/* ---------- ID generation ---------- */
function nextSessionId(date){
  const d=date.replace(/-/g,''); const n=S.data.sessions.filter(s=>s.session_date===date).length+1;
  let id=`S-${d}-${pad2(n)}`, k=n; while(S.data.sessions.some(s=>s.session_id===id)) id=`S-${d}-${pad2(++k)}`; return id;
}
function nextAttemptId(a){
  const d=a.attempt_date.replace(/-/g,'');
  let base = a.material_type==='官方題' && a.prep_test ? `A-${d}-${a.prep_test}-${a.section||'X'}-Q${pad2(a.question_number||0)}` : null;
  if(!base){ const n=S.data.attempts.filter(x=>x.attempt_date===a.attempt_date && x.material_type!=='官方題').length+1; base=`A-${d}-ORIG-${pad2(n)}`; }
  let id=base, r=1; while(S.data.attempts.some(x=>x.attempt_id===id)) id=`${base}-R${++r}`; return id;
}
function nextSeqId(prefix, file, key){ let n=S.data[file].length+1, id; do{ id=`${prefix}-${String(n).padStart(3,'0')}`; n++; }while(S.data[file].some(x=>x[key]===id)); return id; }

/* ---------- forms ---------- */
function formData(form){ const o={}; new FormData(form).forEach((v,k)=>o[k]=typeof v==='string'? v.trim():v); $$('.seg[data-seg]',form).forEach(s=>o[s.dataset.seg]=s.dataset.value||''); return o; }
const num = v => v===''||v==null? null : Number(v);

function onSessionSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  if(!o.mode){ toast('請選擇模式'); return; }
  const rec={ session_id: nextSessionId(o.session_date), session_date:o.session_date, week_label:weekLabel(o.session_date), phase:phaseFor(o.session_date).key,
    mode:o.mode, effective_minutes:num(o.effective_minutes), material_source:o.material_source||'', lr_minutes:null, rc_minutes:null,
    review_minutes:null, focus_skill:'', completion:'', attention:'', fatigue:'', sleep_hours:null, notes:'', created_at:nowISO(), updated_at:nowISO() };
  persist('sessions', rec); toast(`已保存 ${rec.session_id}`);
  f.reset(); segReset(f); $('input[name=session_date]',f).value=todayLA(); renderAll();
}






/* ---------- today's task ---------- */
function todayTask(t){
  const z=(S.settings.week_zero||[]).find(d=>d.date===t);
  if(z) return {title:`今日任務　${z.mode}`, body:z.task};
  const w=weekIndex(t); const wp=(S.settings.week_plan||[]).find(x=>x.week===w);
  const dow=new Date(t+'T12:00:00Z').getUTCDay();
  if(dow===6) return {title:'今日任務　休息', body:'週六為固定休息日。無讀書與行政工作。'};
  if(!wp) return {title:'今日任務', body: t<S.settings.plan_start? '計畫尚未開始。Day 1 是 2026-09-13。':'此週無排定內容。請查讀書計畫。'};
  const dayRole={0:'主要官方驗證、檢討、設定本週重點',1:'學習與引導練習（本週主要 LR 與 RC 技能）',2:'獨立 LR 練習與第一次閱讀分析',3:'RC 結構、文章與選項分析',4:'近／遠移轉與延遲保留',5:'延遲複測、選擇性檢討、每週整理'}[dow];
  return {title:`今日任務　第${w}週　${wp.focus}`, body:`${dayRole}。\n本週要求：${wp.work}`};
}

/* ---------- weakness ranking ---------- */
function weaknessTable(arr){
  const minN=S.settings.weakness_min_n||3, g={};
  arr.forEach(a=>{
    const keys=[]; if(a.question_type) keys.push(['題型',a.question_type]); if(a.skill_tag) keys.push(['能力',a.skill_tag]);
    if(!keys.length) keys.push(['題型','未標']);
    keys.forEach(([kind,k])=>{ const id=kind+'｜'+k; g[id]=g[id]||{kind,k,n:0,c:0,br:0,brN:0,flag:0,rw:0,rwN:0};
      const r=g[id]; r.n++; if(a.first_correct==='是') r.c++; if(a.blind_review_answer){ r.brN++; if(a.blind_correct==='是') r.br++; }
      if(a.review_flag==='是') r.flag++; if(a.reason_correct){ r.rwN++; if(a.reason_correct==='否') r.rw++; } });
  });
  const rows=Object.values(g).map(r=>{ const acc=r.c/r.n; const wrong=r.n-r.c;
    // 優先分：錯題數乘以(1-正確率)，理由錯誤加權；樣本不足者不排序
    r.score = r.n>=minN ? (wrong*(1-acc) + r.rw*0.5) : -1; r.acc=acc; return r; });
  return rows.sort((a,b)=> (b.score-a.score) || (b.n-a.n));
}
function renderWeakness(){
  const off=S.data.attempts.filter(a=>a.material_type==='官方題'), orig=S.data.attempts.filter(a=>a.material_type!=='官方題');
  const rows=weaknessTable(off), minN=S.settings.weakness_min_n||3;
  const ranked=rows.filter(r=>r.score>0), clean=rows.filter(r=>r.score===0), small=rows.filter(r=>r.score<0);
  let h='';
  if(!off.length) h+='<div class="empty">尚無官方題紀錄。第一次官方 section（9/18）之後這裡會出現排序。</div>';
  else{
    if(ranked.length){
      h+='<table class="ledger">'+ranked.slice(0,8).map((r,i)=>`<tr><td>${i<3?'<span class="tag flag">drill 候選</span> ':''}${esc(r.kind)}　${esc(r.k)}</td><td>${r.c}/${r.n}（${pct(r.c,r.n)}）${r.brN?`　盲審 ${r.br}/${r.brN}`:''}${r.rw?`　理由錯 ${r.rw}`:''}</td></tr>`).join('')+'</table>';
      h+=`<div class="small" style="margin-top:8px">排序依據：錯題數 ×（1 − 正確率）+ 0.5 × 理由錯誤數。盲審正確但第一次錯，表示問題偏向配速或注意力而非理解；兩者差距大時先確認限制層級再 drill。</div>`;
    } else h+=`<div class="empty">所有題型樣本皆少於 ${minN} 題，尚不足以排序。</div>`;
    if(clean.length) h+=`<details><summary>樣本足夠且無錯題：${clean.length} 項</summary><div class="small">${clean.map(r=>`${esc(r.kind)} ${esc(r.k)} ${r.c}/${r.n}`).join('；')}</div></details>`;
    if(small.length) h+=`<details><summary>樣本不足（少於 ${minN} 題）：${small.length} 項</summary><div class="small">${small.map(r=>`${esc(r.kind)} ${esc(r.k)} ${r.c}/${r.n}`).join('；')}</div></details>`;
  }
  if(orig.length){ const ro=weaknessTable(orig).filter(r=>r.score>=0).slice(0,5);
    h+=`<details><summary>原創題（分開計，${orig.length} 題）</summary>${ro.length? '<table class="ledger">'+ro.map(r=>`<tr><td>${esc(r.kind)}　${esc(r.k)}</td><td>${r.c}/${r.n}</td></tr>`).join('')+'</table>':'<div class="small">樣本不足。</div>'}</details>`; }
  $('#weak-body').innerHTML=h;
}

/* ---------- knowledge cards & review ---------- */
const REVIEW_STEPS=[1,3,7,14,30];
function onNoteSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  const rec={ card_id:nextSeqId('KC','cards','card_id'), title:o.title, core:o.core, common_error:'', corrective_action:'', example:'', scope:'', signature_id:'', source:'快速筆記 '+todayLA(),
    card_status:'待確認', next_review:todayLA(), review_step:0, review_count:0, last_result:'', ask_chat:'是', created:todayLA(), created_at:nowISO(), updated_at:nowISO() };
  persist('cards',rec); toast(`已存 ${rec.card_id}，下次課程處理`); f.reset(); renderAll();
}

/* ---------- plan checklist ---------- */
function planDone(){ const m=new Map(); S.data.progress.forEach(p=>m.set(p.item_id,p)); return m; }
function togglePlan(id, done){
  persist('progress',{item_id:id, done: done?'是':'否', done_date: done? todayLA():'', updated_at:nowISO(), created_at:nowISO()});
  renderPlan(); renderHeader();
}
function renderPlan(){
  const items=S.settings.checklist||[], doneMap=planDone();
  const isDone=id=>{ const p=doneMap.get(id); return p&&p.done==='是'; };
  const doable=items.filter(i=>i.kind!=='checkpoint');
  const nd=doable.filter(i=>isDone(i.id)).length;
  $('#plan-bar').style.width=(doable.length? 100*nd/doable.length:0)+'%';
  $('#plan-note').textContent=`已完成 ${nd} / ${doable.length} 項排程`;
  const groups=[]; items.forEach(i=>{ let g=groups.find(x=>x.name===i.group); if(!g){ g={name:i.group,items:[]}; groups.push(g); } g.items.push(i); });
  const t=todayLA(); const curGroup=(()=>{ const ph=phaseFor(t).key; const map={'起始週':'起始週','第一階段':'第一階段','第二階段':'第二階段','第三階段':'第三階段','考前減量':'最後兩週'}; return map[ph]||''; })();
  $('#plan-groups').innerHTML=groups.map(g=>{ const gd=g.items.filter(i=>i.kind!=='checkpoint'); const gn=gd.filter(i=>isDone(i.id)).length;
    return `<details class="grp" ${g.name.startsWith(curGroup)?'open':''}><summary>${esc(g.name)} <span class="pgr">${gn}/${gd.length}</span></summary>
    <ul class="chk">${g.items.map(i=> i.kind==='checkpoint'
      ? `<li class="cp-item"><div class="lb">${esc(i.label)}<div class="std">${esc(i.detail)}</div></div></li>`
      : `<li class="${isDone(i.id)?'done':''}"><input type="checkbox" data-plan="${esc(i.id)}" ${isDone(i.id)?'checked':''} aria-label="完成 ${esc(i.label)}"><div class="lb">${esc(i.label)}</div></li>`).join('')}</ul></details>`; }).join('');
  $$('#plan-groups input[data-plan]').forEach(cb=>cb.addEventListener('change',()=>togglePlan(cb.dataset.plan, cb.checked)));
}

function reviewCard(card, result){
  const t=todayLA(); const rec=Object.assign({},card,{review_count:(card.review_count||0)+1, last_result:result, last_reviewed:t, updated_at:nowISO()});
  if(result==='記得'){ rec.review_step=Math.min((card.review_step||0)+1, REVIEW_STEPS.length-1); rec.next_review=addDays(t, REVIEW_STEPS[rec.review_step]); }
  else if(result==='不確定'){ rec.review_step=0; rec.next_review=addDays(t,1); }
  else { rec.review_step=0; rec.next_review=addDays(t,1); rec.ask_chat='是'; }
  persist('cards',rec); toast(result==='下次請 Claude 解釋'? '已標記，會出現在上下文包':'已記錄'); renderAll();
}
function renderReview(){
  const t=todayLA();
  const due=S.data.cards.filter(c=>c.next_review && c.next_review<=t).sort((a,b)=>a.next_review.localeCompare(b.next_review)).slice(0,5);
  $('#due-count').textContent=due.length;
  $('#due-cards').innerHTML= due.length? due.map(c=>`<div class="card" data-id="${esc(c.card_id)}">
      <h3>${esc(c.title)}</h3><div class="small">${esc(c.card_id)}　${esc(c.card_status)}　複習 ${c.review_count||0} 次${c.ask_chat==='是'?'　<span class="tag flag">待 Claude 解釋</span>':''}</div>
      <div class="actions"><button class="btn ghost" type="button" data-act="reveal">揭示</button></div>
      <div class="body">
        <p><span class="k">核心區分</span><br>${esc(c.core)}</p>
        ${c.common_error?`<p><span class="k">我的常見誤判</span><br>${esc(c.common_error)}</p>`:''}
        ${c.corrective_action?`<p><span class="k">修正動作</span><br>${esc(c.corrective_action)}</p>`:''}
        ${c.example?`<p><span class="k">例子</span><br>${esc(c.example)}</p>`:''}
        <div class="actions">${S.settings.options.review_result.map(r=>`<button class="btn ${r==='記得'?'':'ghost'}" type="button" data-act="result" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
      </div></div>`).join('') : '<div class="empty">今天沒有到期卡片。</div>';
  $$('#due-cards .card').forEach(el=>{ const c=S.data.cards.find(x=>x.card_id===el.dataset.id);
    $('[data-act=reveal]',el).addEventListener('click',()=>{ el.classList.add('open'); $('[data-act=reveal]',el).style.display='none'; });
    $$('[data-act=result]',el).forEach(b=>b.addEventListener('click',()=>reviewCard(c,b.dataset.r))); });
  const cards=S.data.cards.slice().sort((a,b)=>a.card_id.localeCompare(b.card_id));
  $('#card-list').innerHTML= cards.length? cards.map(c=>`<li><div class="t"><span>${esc(c.card_id)}　${esc(c.title)}</span><span class="tag ${c.card_status==='已驗證'?'ok':''}">${esc(c.card_status)}</span></div><div class="m">${esc(c.core)}${c.next_review?`　下次 ${esc(c.next_review)}`:''}${c.signature_id?`　${esc(c.signature_id)}`:''}</div></li>`).join('') : '<li class="empty">尚無卡片。由課後寫回包或快速筆記建立。</li>';
}

/* ---------- write-back package ---------- */
let WB=null;
function allRequestIds(){ const ids=new Set(); FILES.forEach(f=>S.data[f].forEach(r=>{ if(r.client_request_id) ids.add(r.client_request_id); })); return ids; }
function wbCheck(){
  const out=$('#wb-preview'); WB=null; $('#btn-wb-apply').disabled=true;
  let pkg; try{ pkg=JSON.parse($('#wb-text').value); }catch(e){ out.innerHTML=`<li class="empty">JSON 解析失敗：${esc(e.message)}</li>`; return; }
  if(!pkg||!Array.isArray(pkg.items)){ out.innerHTML='<li class="empty">缺少 items 陣列。</li>'; return; }
  const seen=allRequestIds(), inPkg=new Set(); const items=[];
  const allowed=new Set(['add_session','add_card','add_handoff','add_signature','suggest_signature_update','suggest_hypothesis_update','add_attempt','update_exposure','update_session']);
  pkg.items.forEach((it,i)=>{
    const r={i:i+1, op:it.op, id:it.client_request_id, ok:true, msg:'', data:it.data||{}};
    if(!allowed.has(it.op)){ r.ok=false; r.msg='不允許的操作'; }
    else if(!it.client_request_id){ r.ok=false; r.msg='缺 client_request_id'; }
    else if(seen.has(it.client_request_id)){ r.ok=false; r.msg='已寫入過，略過'; }
    else if(inPkg.has(it.client_request_id)){ r.ok=false; r.msg='包內重複'; }
    else if(it.op==='add_attempt' && r.data.material_type==='官方題' && r.data.source_evidence!=='使用者截圖'){ r.ok=false; r.msg='官方題需 source_evidence:使用者截圖'; }
    else if(it.op==='update_exposure' && !r.data.pt_id){ r.ok=false; r.msg='缺 pt_id'; }
    else if(it.op==='suggest_signature_update' && !S.data.signatures.some(s=>s.signature_id===r.data.signature_id)){ r.ok=false; r.msg='找不到指紋'; }
    else if(it.op==='suggest_hypothesis_update' && !S.data.hypotheses.some(h=>h.hypothesis_id===r.data.hypothesis_id)){ r.ok=false; r.msg='找不到假設'; }
    else if(it.op==='update_session' && !S.data.sessions.some(x=>x.session_id===r.data.session_id)){ r.ok=false; r.msg='找不到學習紀錄'; }
    else if(['add_session','add_card','add_handoff','add_signature','add_attempt'].includes(it.op)){
      const need={add_session:['session_date','mode','effective_minutes'],add_card:['title','core'],add_handoff:['date','stopped_at','next_task'],add_signature:['error_type','trigger_signal','corrective_action'],add_attempt:['attempt_date','mode','timed_answer','correct_answer']}[it.op];
      const miss=need.filter(k=>r.data[k]===undefined||r.data[k]===''); if(miss.length){ r.ok=false; r.msg='缺欄位：'+miss.join('、'); } }
    inPkg.add(it.client_request_id); items.push(r);
  });
  out.innerHTML=items.map(r=>`<li><div class="t"><span>${r.i}. ${esc(r.op)}　${esc(summarizeWb(r))}</span><span class="tag ${r.ok?'ok':'flag'}">${r.ok?'可寫入':esc(r.msg)}</span></div></li>`).join('');
  WB=items.filter(r=>r.ok); $('#btn-wb-apply').disabled=!WB.length; $('#btn-wb-apply').textContent=`確認寫入 ${WB.length} 筆`;
}
function summarizeWb(r){ const d=r.data; return {add_session:`${d.session_date} ${d.mode} ${d.effective_minutes}分`, add_card:d.title, add_handoff:`${d.date} ${d.stopped_at}`, add_signature:d.error_type, suggest_signature_update:`${d.signature_id} → ${d.stage||''} ${d.signature_status||''}`, suggest_hypothesis_update:`${d.hypothesis_id} → ${d.hypothesis_status||''}`, add_attempt:`${d.material_type||'原創題'}${d.prep_test?` ${d.prep_test} ${d.section||''} Q${d.question_number||''}`:''} ${d.timed_answer}→${d.correct_answer}`, update_exposure:`${d.pt_id} → ${d.exposure_status||''}`, update_session:`${d.session_id} 補充`}[r.op]||''; }
function wbApply(){
  if(!WB||!WB.length) return; const t=todayLA(); let n=0;
  WB.forEach(r=>{ const d=r.data, base={client_request_id:r.id, created_at:nowISO(), updated_at:nowISO()};
    if(r.op==='add_session') persist('sessions', Object.assign({session_id:nextSessionId(d.session_date), week_label:weekLabel(d.session_date), phase:phaseFor(d.session_date).key, material_source:'專案對話', lr_minutes:null, rc_minutes:null, review_minutes:null, focus_skill:'', completion:'', attention:'', fatigue:'', sleep_hours:null, notes:''}, d, base, {effective_minutes:Number(d.effective_minutes)}));
    else if(r.op==='add_card') persist('cards', Object.assign({card_id:nextSeqId('KC','cards','card_id'), common_error:'', corrective_action:'', example:'', scope:'', signature_id:'', source:'', review_step:0, review_count:0, last_result:'', ask_chat:'否', created:t}, d, base, {card_status:'待確認', next_review:d.next_review||t}));
    else if(r.op==='add_handoff') persist('handoffs', Object.assign({handoff_id:nextSeqId('HO','handoffs','handoff_id'), session_id:'', taught:'', observed:'', open_questions:''}, d, base));
    else if(r.op==='add_signature') persist('signatures', Object.assign({signature_id:nextSeqId('ES','signatures','signature_id'), attraction:'', scope:'', created:t, last_seen:t, stage:'已發現', near_transfer:'未測試', far_transfer:'未測試', delayed_retest:'未測試', official_timed:'未測試', evidence_count:1, notes:''}, d, base, {signature_status:'追蹤中'}));
    else if(r.op==='suggest_signature_update'){ const s=S.data.signatures.find(x=>x.signature_id===d.signature_id); const u={}; ['stage','signature_status','evidence_count','last_seen'].forEach(k=>{ if(d[k]!==undefined) u[k]=d[k]; }); persist('signatures', Object.assign({},s,u,{updated_at:nowISO(), last_request_id:r.id})); }
    else if(r.op==='suggest_hypothesis_update'){ const h=S.data.hypotheses.find(x=>x.hypothesis_id===d.hypothesis_id); const u={}; ['hypothesis_status','supporting_evidence','contrary_evidence','independent_observations','next_test','current_decision'].forEach(k=>{ if(d[k]!==undefined) u[k]=d[k]; }); persist('hypotheses', Object.assign({},h,u,{last_updated:t, updated_at:nowISO(), last_request_id:r.id})); }
    else if(r.op==='add_attempt'){ const a=deriveAttempt(Object.assign({session_id:'', material_type:'原創題', source:'專案對話', prep_test:'', section:'', question_number:null, question_type:'', skill_tag:'', blind_review_answer:'', elapsed_seconds:null, confidence:'', reread_method:'', overtime:'', guessed:'', reason_correct:'', signature_id:'', notes:''}, d, base)); if(a.material_type==='官方題') a.source='LawHub'; a.attempt_id=nextAttemptId(a); persist('attempts',a); }
    else if(r.op==='update_exposure'){ const old=S.data.exposure.find(x=>x.pt_id===d.pt_id)||{pt_id:d.pt_id, first_exposure:t, blind_review:'不明', explanations_seen:'不明', source:'寫回包'}; const rec=Object.assign({},old,d,base,{last_exposure:d.last_exposure||t}); rec.clean_pt_eligible = rec.exposure_status==='未接觸'?'是':'否'; persist('exposure',rec); }
    else if(r.op==='update_session'){ const old=S.data.sessions.find(x=>x.session_id===d.session_id); if(old){ const u={}; ['focus_skill','notes','lr_minutes','rc_minutes','review_minutes','attention','fatigue','completion','material_source'].forEach(k=>{ if(d[k]!==undefined) u[k]=d[k]; }); persist('sessions',Object.assign({},old,u,{updated_at:nowISO(), last_request_id:r.id})); } }
    n++; });
  WB=null; $('#wb-text').value=''; $('#wb-preview').innerHTML=''; $('#btn-wb-apply').disabled=true; $('#btn-wb-apply').textContent='確認寫入';
  toast(`已寫入 ${n} 筆。到「同步」按立即同步。`); renderAll();
}

/* ---------- render ---------- */
function renderHeader(){
  const t=todayLA(), ph=phaseFor(t), cp=nextCheckpoint();
  $('#hdr-sub').textContent=`${t}　${ph.key}`+(weekLabel(t)!==ph.key?`　${weekLabel(t)}`:'')+(cp?`　距 ${cp.checkpoint_id} ${dateDiffDays(t,cp.review_date)} 天`:'');
}
function renderToday(){
  const t=todayLA(), ph=phaseFor(t), [ws,we]=weekRange(t), cp=nextCheckpoint();
  const tk=todayTask(t); $('#task-title').textContent=tk.title; $('#task-body').innerHTML=esc(tk.body).replace(/\n/g,'<br>');
  const wk=S.data.sessions.filter(s=>s.session_date>=ws&&s.session_date<=we);
  const mins=wk.reduce((a,s)=>a+(s.effective_minutes||0),0), budget=ph.weekly_hours;
  const todaySessions=S.data.sessions.filter(s=>s.session_date===t);
  const tmins=todaySessions.reduce((a,s)=>a+(s.effective_minutes||0),0);
  const total=S.data.sessions.reduce((a,s)=>a+(s.effective_minutes||0),0);
  $('#today-ledger').innerHTML=`
    <tr><td>本週有效小時（${ws.slice(5)} 至 ${we.slice(5)}）</td><td><span class="big">${fmtMin(mins)}</span> / ${budget}</td></tr>
    <tr><td>今日</td><td>${todaySessions.length} 筆，${fmtMin(tmins)} 小時</td></tr>
    <tr><td>累計有效小時</td><td>${fmtMin(total)} / ${S.settings.total_plan_hours}</td></tr>
    <tr><td>待檢討題目</td><td>${S.data.attempts.filter(a=>a.review_flag==='是'&&!a.blind_review_answer).length}</td></tr>
    <tr><td>到期複習卡</td><td>${S.data.cards.filter(c=>c.next_review&&c.next_review<=t).length}</td></tr>
    <tr><td>下一個檢查點</td><td>${cp? `${cp.checkpoint_id}　${cp.review_date}`:'無'}</td></tr>`;
  $('#week-bar').style.width=Math.min(100, budget? 100*mins/60/budget:0)+'%';
  $('#week-note').textContent = mins/60 < budget ? `距本週預算尚差 ${(budget-mins/60).toFixed(1)} 小時。` : '本週已達預算；若檢查點未達標，先改方法，不加時數。';

  const recent=S.data.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.session_id.localeCompare(a.session_id)).slice(0,5);
  $('#session-list').innerHTML= recent.length? recent.map(s=>`<li><div class="t"><span>${esc(s.session_date)}　<span class="tag">${esc(s.mode)}</span>${s.notes&&s.notes.includes('測試')?'　<span class="tag">測試</span>':''}</span><span>${esc(s.effective_minutes)} 分　${esc(s.material_source||'')}</span></div></li>`).join('')
    : '<li class="empty">尚無紀錄。</li>';
}

function renderAttempts(){
  const off=S.data.attempts.filter(a=>a.material_type==='官方題'), orig=S.data.attempts.filter(a=>a.material_type!=='官方題');
  const stat=arr=>({n:arr.length, fc:arr.filter(a=>a.first_correct==='是').length, brN:arr.filter(a=>a.blind_review_answer).length, brC:arr.filter(a=>a.blind_correct==='是').length, rc:arr.filter(a=>a.reason_correct==='是').length, rcN:arr.filter(a=>a.reason_correct).length});
  const so=stat(off), sg=stat(orig);
  $('#attempt-stats').innerHTML=`
    <tr><td>官方題筆數</td><td>${so.n}</td></tr>
    <tr><td>官方題第一次正確率</td><td>${pct(so.fc,so.n)}</td></tr>
    <tr><td>官方題盲審正確率（已盲審 ${so.brN}）</td><td>${pct(so.brC,so.brN)}</td></tr>
    <tr><td>官方題理由正確率（已判斷 ${so.rcN}）</td><td>${pct(so.rc,so.rcN)}</td></tr>
    <tr><td>原創題筆數（分開計）</td><td>${sg.n}　第一次 ${pct(sg.fc,sg.n)}</td></tr>`;
}

function renderTrack(){
  const t=todayLA(), cp=nextCheckpoint();
  $('#cp-list').innerHTML=S.data.checkpoints.map(c=>`<li><div class="t"><span>${esc(c.checkpoint_id)}　${esc(c.gate)}</span><span>${esc(c.review_date)}　<span class="tag ${c.checkpoint_status==='已完成'?'ok':''}">${esc(c.checkpoint_status)}</span></span></div><div class="m">${esc(c.checkpoint_decision||'尚無決定')}${c.evidence_summary?`　${esc(c.evidence_summary)}`:''}</div></li>`).join('');
  $('#cp-decide').innerHTML= cp? `<div class="hint" style="margin-top:10px">下一個：${esc(cp.checkpoint_id)}（${esc(cp.review_date)}，${dateDiffDays(t,cp.review_date)} 天後）。決定由你在課程檢視證據後於此作成。</div>
    <form id="f-cp">
      <label class="f"><span class="l">決定</span><div class="seg" data-seg="checkpoint_decision" data-opt="checkpoint_decision" data-clearable="1"></div></label>
      <label class="f"><span class="l">證據摘要（可由寫回包建議文字貼入）</span><textarea name="evidence_summary">${esc(cp.evidence_summary||'')}</textarea></label>
      <div class="actions"><button class="btn ghost" type="submit">保存決定並標記完成</button></div></form>` : '';
  if(cp){ const f=$('#f-cp'); buildSegs(f); segSet(f,'checkpoint_decision',cp.checkpoint_decision);
    f.addEventListener('submit',e=>{ e.preventDefault(); const o=formData(f);
      if(!o.checkpoint_decision){ toast('請先選擇決定'); return; }
      persist('checkpoints',Object.assign({},cp,{checkpoint_status:'已完成', checkpoint_decision:o.checkpoint_decision, evidence_summary:o.evidence_summary||'', decision_date:t, updated_at:nowISO()}));
      toast(`${cp.checkpoint_id} 已記錄`); renderAll(); }); }
  const sigs=S.data.signatures.slice().sort((a,b)=> (a.signature_status==='追蹤中'?0:1)-(b.signature_status==='追蹤中'?0:1) || a.signature_id.localeCompare(b.signature_id));
  $('#sig-list').innerHTML= sigs.length? sigs.map(x=>`<li><div class="t"><span>${esc(x.signature_id)}　${esc(x.error_type)}</span><span class="tag ${x.signature_status==='已封存'?'ok':''}">${esc(x.signature_status)}</span></div><div class="m">${esc(x.trigger_signal)}｜${esc(x.corrective_action)}｜${esc(x.stage)}　證據 ${x.evidence_count}</div></li>`).join('') : '<li class="empty">尚無指紋。由課程診斷產生。</li>';
  $('#hyp-list').innerHTML=S.data.hypotheses.map(h=>`<li><div class="t"><span>${esc(h.hypothesis_id)}　<span class="tag">${esc(h.scope)}</span></span><span class="tag ${['已否定','已解決'].includes(h.hypothesis_status)?'ok':''}">${esc(h.hypothesis_status)}</span></div><div class="m">${esc(h.statement)}</div></li>`).join('');
  const exp=S.data.exposure.slice().sort((a,b)=>a.pt_id.localeCompare(b.pt_id,undefined,{numeric:true}));
  $('#exp-list').innerHTML= exp.length? exp.map(x=>`<li><div class="t"><span>${esc(x.pt_id)}　<span class="tag ${x.clean_pt_eligible==='是'?'ok':'flag'}">${x.clean_pt_eligible==='是'?'可作乾淨模考':'不可作乾淨模考'}</span></span><span>${esc(x.exposure_status)}</span></div><div class="m">${esc(x.notes||'')}</div></li>`).join('') : '<li class="empty">尚無紀錄。</li>';
}

function renderSync(){
  $('#sync-ledger').innerHTML=`<tr><td>資料來源</td><td>${S.remoteOk?'repo data 資料夾':'本機快照'}</td></tr>
    <tr><td>未同步檔案</td><td>${S.dirty.size? Array.from(S.dirty).join('、'):'無'}</td></tr>
    <tr><td>寫入目標</td><td style="text-align:left">${S.gh&&S.gh.owner? esc(`${S.gh.owner}/${S.gh.repo}@${S.gh.branch}`):'未設定'}</td></tr>
    <tr><td>權杖</td><td>${S.gh&&S.gh.token? '已保存於本機':'未填'}</td></tr>`;
  $('#ver-ledger').innerHTML=`<tr><td>App</td><td>${APP_VERSION}</td></tr><tr><td>資料結構</td><td>${esc(S.settings.schema_version)}</td></tr><tr><td>讀書計畫版本</td><td>${esc(S.settings.plan_version)}</td></tr>`;
}

function renderAll(){ renderHeader(); renderToday(); renderPlan(); renderAttempts(); renderWeakness(); renderReview(); renderTrack(); renderSync(); }

/* ---------- context pack ---------- */

/* ---------- xlsx export ---------- */
function downloadJSON(){
  const blob=new Blob([JSON.stringify({settings:S.settings, ...S.data},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`LSJN2027_data_${todayLA()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ---------- init ---------- */
function initForms(){
  buildSegs();
  const t=todayLA(); $('#f-session input[name=session_date]').value=t;
  $('#f-session').addEventListener('submit', onSessionSubmit);
  $('#f-note').addEventListener('submit', onNoteSubmit);
  $('#btn-wb-check').addEventListener('click', wbCheck);
  $('#btn-wb-apply').addEventListener('click', wbApply);
  $('#btn-json').addEventListener('click', downloadJSON);
  $('#btn-save-gh').addEventListener('click', saveGh);
  $('#btn-sync').addEventListener('click', syncNow);
  $('#btn-reload').addEventListener('click', async()=>{ await loadAll(); renderAll(); toast('已重新載入'); });
  $('#btn-clear-local').addEventListener('click',()=>{ if(confirm('清除本機未同步資料？此動作無法復原。')){ localStorage.removeItem(LS_LOCAL); S.dirty.clear(); loadAll().then(renderAll); } });

  $$('nav.tabs button').forEach(b=>b.addEventListener('click',()=>{ $$('nav.tabs button').forEach(x=>x.setAttribute('aria-selected','false')); b.setAttribute('aria-selected','true'); $$('section.view').forEach(v=>v.classList.toggle('active', v.id===b.dataset.view)); window.scrollTo({top:0}); }));
}

(async function main(){
  try{ await loadAll(); }catch(e){ console.error(e); return; }
  loadGh(); initForms(); renderAll();
  if('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();

})();
