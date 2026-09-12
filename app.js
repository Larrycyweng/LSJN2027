/* LSJN2027 訓練紀錄 — app.js
   資料權威：repo 內 data/*.json。此檔只做輸入、彙整、匯出與同步。 */
(() => {
'use strict';

const FILES = ['sessions','attempts','exposure','signatures','hypotheses','checkpoints','cards','handoffs'];
const ID_KEY = {sessions:'session_id', attempts:'attempt_id', exposure:'pt_id',
                signatures:'signature_id', hypotheses:'hypothesis_id', checkpoints:'checkpoint_id', cards:'card_id', handoffs:'handoff_id'};
const LS_LOCAL = 'lsjn.local.v1';
const LS_GH = 'lsjn.gh.v1';
const APP_VERSION = '0.2.0';

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
    mode:o.mode, effective_minutes:num(o.effective_minutes), material_source:o.material_source||'', lr_minutes:num(o.lr_minutes), rc_minutes:num(o.rc_minutes),
    review_minutes:num(o.review_minutes), focus_skill:o.focus_skill||'', completion:o.completion||'', attention:o.attention||'', fatigue:o.fatigue||'',
    sleep_hours:num(o.sleep_hours), notes:o.notes||'', created_at:nowISO(), updated_at:nowISO() };
  persist('sessions', rec); toast(`已保存 ${rec.session_id}`);
  f.reset(); segReset(f); $('input[name=session_date]',f).value=todayLA(); renderAll();
}

function onAttemptSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  if(!o.mode||!o.material_type){ toast('請選擇模式與材料類型'); return; }
  if(!o.timed_answer||!o.correct_answer){ toast('第一次答案與正確答案必填'); return; }
  if(o.material_type==='官方題' && (!o.prep_test||!o.question_number)){ toast('官方題需要測驗編號與題號'); return; }
  const rec=deriveAttempt({ attempt_date:o.attempt_date, session_id:o.session_id||'', mode:o.mode, material_type:o.material_type,
    source:o.material_type==='官方題'?'LawHub':'專案對話', prep_test:o.material_type==='官方題'? o.prep_test.toUpperCase():'', section:o.material_type==='官方題'? o.section:'',
    question_number:o.material_type==='官方題'? num(o.question_number):null, question_type:o.question_type||'', skill_tag:o.skill_tag||'',
    timed_answer:o.timed_answer, blind_review_answer:o.blind_review_answer||'', correct_answer:o.correct_answer, elapsed_seconds:num(o.elapsed_seconds),
    confidence:o.confidence||'', reread_method:o.reread_method||'', overtime:o.overtime||'', guessed:o.guessed||'', reason_correct:o.reason_correct||'',
    signature_id:'', notes:o.notes||'', created_at:nowISO(), updated_at:nowISO() });
  rec.attempt_id=nextAttemptId(rec);
  persist('attempts', rec); toast(`已保存 ${rec.attempt_id}`);
  // keep date, mode, material, PT, section for fast successive entry; bump question number
  const keep={attempt_date:o.attempt_date, mode:o.mode, material_type:o.material_type, prep_test:o.prep_test, section:o.section, session_id:o.session_id};
  const q=num(o.question_number);
  f.reset(); segReset(f);
  $('input[name=attempt_date]',f).value=keep.attempt_date; segSet(f,'mode',keep.mode); segSet(f,'material_type',keep.material_type);
  $('input[name=prep_test]',f).value=keep.prep_test||''; $('select[name=section]',f).value=keep.section||''; $('select[name=session_id]',f).value=keep.session_id||'';
  if(q) $('input[name=question_number]',f).value=q+1;
  renderAll();
}

function onBatch(){
  const lines=$('#batch-text').value.split('\n').map(l=>l.trim()).filter(Boolean);
  const date=$('#batch-date').value||todayLA(), mode=$('#batch-mode').value||'測驗';
  let ok=0, bad=[];
  lines.forEach((ln,i)=>{
    const p=ln.split(/[,\t，]/).map(s=>s.trim());
    if(p.length<5||!/^[A-E]$/i.test(p[3])||!/^[A-E]$/i.test(p[4])){ bad.push(i+1); return; }
    const rec=deriveAttempt({attempt_date:date, session_id:'', mode, material_type:'官方題', source:'LawHub', prep_test:p[0].toUpperCase(), section:p[1].toUpperCase(),
      question_number:num(p[2]), question_type:'', skill_tag:'', timed_answer:p[3].toUpperCase(), blind_review_answer:'', correct_answer:p[4].toUpperCase(),
      elapsed_seconds:num(p[5]||''), confidence:p[6]||'', reread_method:'', overtime:'', guessed:'', reason_correct:'', signature_id:'', notes:'', created_at:nowISO(), updated_at:nowISO()});
    rec.attempt_id=nextAttemptId(rec); persist('attempts',rec); ok++;
  });
  toast(`匯入 ${ok} 題${bad.length? `，第 ${bad.join('、')} 行格式錯誤`:''}`); if(ok){ $('#batch-text').value=''; renderAll(); }
}

function onSigSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  const rec={ signature_id:nextSeqId('ES','signatures','signature_id'), error_type:o.error_type, trigger_signal:o.trigger_signal, attraction:o.attraction||'',
    corrective_action:o.corrective_action, scope:o.scope||'', signature_status:'追蹤中', created:todayLA(), last_seen:todayLA(), stage:'已發現',
    near_transfer:'未測試', far_transfer:'未測試', delayed_retest:'未測試', official_timed:'未測試', evidence_count:1, notes:'', created_at:nowISO(), updated_at:nowISO() };
  persist('signatures',rec); toast(`已建立 ${rec.signature_id}`); f.reset(); segReset(f); renderAll();
}

function onExpSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  const id=o.pt_id.toUpperCase(); const old=S.data.exposure.find(x=>x.pt_id===id)||{};
  const rec=Object.assign({pt_id:id, first_exposure:todayLA(), questions_seen:null, full_score:null, blind_review:'不明', explanations_seen:'不明', source:'App'}, old,
    {exposure_status:o.exposure_status, last_exposure:todayLA(), sections_seen:o.sections_seen||old.sections_seen||'', notes:o.notes||old.notes||'', updated_at:nowISO()});
  rec.clean_pt_eligible = rec.exposure_status==='未接觸' ? '是' : '否';
  persist('exposure',rec); toast(`已更新 ${id}`); f.reset(); renderAll();
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
function onCardSubmit(e){
  e.preventDefault(); const f=e.target, o=formData(f);
  const rec={ card_id:nextSeqId('KC','cards','card_id'), title:o.title, core:o.core, common_error:o.common_error||'', corrective_action:o.corrective_action||'', example:o.example||'',
    scope:o.scope||'', signature_id:o.signature_id||'', source:o.source||'', card_status:'待確認', next_review:todayLA(), review_step:0, review_count:0, last_result:'', ask_chat:'否',
    created:todayLA(), created_at:nowISO(), updated_at:nowISO() };
  persist('cards',rec); toast(`已建立 ${rec.card_id}`); f.reset(); segReset(f); renderAll();
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
  const sel=$('#f-card select[name=signature_id]'); sel.innerHTML='<option value=""></option>'+S.data.signatures.map(s=>`<option>${esc(s.signature_id)}</option>`).join('');
  const cards=S.data.cards.slice().sort((a,b)=>a.card_id.localeCompare(b.card_id));
  $('#card-list').innerHTML= cards.length? cards.map(c=>`<li><div class="t"><span>${esc(c.card_id)}　${esc(c.title)}</span><span class="tag ${c.card_status==='已驗證'?'ok':''}">${esc(c.card_status)}</span></div><div class="m">${esc(c.core)}${c.next_review?`　下次 ${esc(c.next_review)}`:''}${c.signature_id?`　${esc(c.signature_id)}`:''}</div></li>`).join('') : '<li class="empty">尚無卡片。課後由寫回包新增，或在下方手動建立。</li>';
}

/* ---------- write-back package ---------- */
let WB=null;
function allRequestIds(){ const ids=new Set(); FILES.forEach(f=>S.data[f].forEach(r=>{ if(r.client_request_id) ids.add(r.client_request_id); })); return ids; }
function wbCheck(){
  const out=$('#wb-preview'); WB=null; $('#btn-wb-apply').disabled=true;
  let pkg; try{ pkg=JSON.parse($('#wb-text').value); }catch(e){ out.innerHTML=`<li class="empty">JSON 解析失敗：${esc(e.message)}</li>`; return; }
  if(!pkg||!Array.isArray(pkg.items)){ out.innerHTML='<li class="empty">缺少 items 陣列。</li>'; return; }
  const seen=allRequestIds(), inPkg=new Set(); const items=[];
  const allowed=new Set(['add_session','add_card','add_handoff','add_signature','suggest_signature_update','suggest_hypothesis_update','add_attempt']);
  pkg.items.forEach((it,i)=>{
    const r={i:i+1, op:it.op, id:it.client_request_id, ok:true, msg:'', data:it.data||{}};
    if(!allowed.has(it.op)){ r.ok=false; r.msg='不允許的操作'; }
    else if(!it.client_request_id){ r.ok=false; r.msg='缺 client_request_id'; }
    else if(seen.has(it.client_request_id)){ r.ok=false; r.msg='已寫入過，略過'; }
    else if(inPkg.has(it.client_request_id)){ r.ok=false; r.msg='包內重複'; }
    else if(it.op==='add_attempt' && r.data.material_type==='官方題'){ r.ok=false; r.msg='官方題作答只能由使用者在 App 輸入'; }
    else if(it.op==='suggest_signature_update' && !S.data.signatures.some(s=>s.signature_id===r.data.signature_id)){ r.ok=false; r.msg='找不到指紋'; }
    else if(it.op==='suggest_hypothesis_update' && !S.data.hypotheses.some(h=>h.hypothesis_id===r.data.hypothesis_id)){ r.ok=false; r.msg='找不到假設'; }
    else if(['add_session','add_card','add_handoff','add_signature','add_attempt'].includes(it.op)){
      const need={add_session:['session_date','mode','effective_minutes'],add_card:['title','core'],add_handoff:['date','stopped_at','next_task'],add_signature:['error_type','trigger_signal','corrective_action'],add_attempt:['attempt_date','mode','timed_answer','correct_answer']}[it.op];
      const miss=need.filter(k=>r.data[k]===undefined||r.data[k]===''); if(miss.length){ r.ok=false; r.msg='缺欄位：'+miss.join('、'); } }
    inPkg.add(it.client_request_id); items.push(r);
  });
  out.innerHTML=items.map(r=>`<li><div class="t"><span>${r.i}. ${esc(r.op)}　${esc(summarizeWb(r))}</span><span class="tag ${r.ok?'ok':'flag'}">${r.ok?'可寫入':esc(r.msg)}</span></div></li>`).join('');
  WB=items.filter(r=>r.ok); $('#btn-wb-apply').disabled=!WB.length; $('#btn-wb-apply').textContent=`確認寫入 ${WB.length} 筆`;
}
function summarizeWb(r){ const d=r.data; return {add_session:`${d.session_date} ${d.mode} ${d.effective_minutes}分`, add_card:d.title, add_handoff:`${d.date} ${d.stopped_at}`, add_signature:d.error_type, suggest_signature_update:`${d.signature_id} → ${d.stage||''} ${d.signature_status||''}`, suggest_hypothesis_update:`${d.hypothesis_id} → ${d.hypothesis_status||''}`, add_attempt:`原創題 ${d.timed_answer}→${d.correct_answer}`}[r.op]||''; }
function wbApply(){
  if(!WB||!WB.length) return; const t=todayLA(); let n=0;
  WB.forEach(r=>{ const d=r.data, base={client_request_id:r.id, created_at:nowISO(), updated_at:nowISO()};
    if(r.op==='add_session') persist('sessions', Object.assign({session_id:nextSessionId(d.session_date), week_label:weekLabel(d.session_date), phase:phaseFor(d.session_date).key, material_source:'專案對話', lr_minutes:null, rc_minutes:null, review_minutes:null, focus_skill:'', completion:'', attention:'', fatigue:'', sleep_hours:null, notes:''}, d, base, {effective_minutes:Number(d.effective_minutes)}));
    else if(r.op==='add_card') persist('cards', Object.assign({card_id:nextSeqId('KC','cards','card_id'), common_error:'', corrective_action:'', example:'', scope:'', signature_id:'', source:'', review_step:0, review_count:0, last_result:'', ask_chat:'否', created:t}, d, base, {card_status:'待確認', next_review:d.next_review||t}));
    else if(r.op==='add_handoff') persist('handoffs', Object.assign({handoff_id:nextSeqId('HO','handoffs','handoff_id'), session_id:'', taught:'', observed:'', open_questions:''}, d, base));
    else if(r.op==='add_signature') persist('signatures', Object.assign({signature_id:nextSeqId('ES','signatures','signature_id'), attraction:'', scope:'', created:t, last_seen:t, stage:'已發現', near_transfer:'未測試', far_transfer:'未測試', delayed_retest:'未測試', official_timed:'未測試', evidence_count:1, notes:''}, d, base, {signature_status:'追蹤中'}));
    else if(r.op==='suggest_signature_update'){ const s=S.data.signatures.find(x=>x.signature_id===d.signature_id); const u={}; ['stage','signature_status','evidence_count','last_seen'].forEach(k=>{ if(d[k]!==undefined) u[k]=d[k]; }); persist('signatures', Object.assign({},s,u,{updated_at:nowISO(), last_request_id:r.id})); }
    else if(r.op==='suggest_hypothesis_update'){ const h=S.data.hypotheses.find(x=>x.hypothesis_id===d.hypothesis_id); const u={}; ['hypothesis_status','supporting_evidence','contrary_evidence','independent_observations','next_test','current_decision'].forEach(k=>{ if(d[k]!==undefined) u[k]=d[k]; }); persist('hypotheses', Object.assign({},h,u,{last_updated:t, updated_at:nowISO(), last_request_id:r.id})); }
    else if(r.op==='add_attempt'){ const a=deriveAttempt(Object.assign({session_id:'', material_type:'原創題', source:'專案對話', prep_test:'', section:'', question_number:null, question_type:'', skill_tag:'', blind_review_answer:'', elapsed_seconds:null, confidence:'', reread_method:'', overtime:'', guessed:'', reason_correct:'', signature_id:'', notes:''}, d, base, {material_type:'原創題'})); a.attempt_id=nextAttemptId(a); persist('attempts',a); }
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

  const recent=S.data.sessions.slice().sort((a,b)=>b.session_date.localeCompare(a.session_date)||b.session_id.localeCompare(a.session_id)).slice(0,8);
  $('#session-list').innerHTML= recent.length? recent.map(s=>`<li><div class="t"><span>${esc(s.session_date)}　<span class="tag">${esc(s.mode)}</span></span><span>${esc(s.effective_minutes)} 分</span></div>
    <div class="m">${esc(s.session_id)}　${esc(s.material_source||'')}　${esc(s.focus_skill||'')}${s.attention?`　專注${esc(s.attention)}`:''}${s.fatigue?`　疲勞${esc(s.fatigue)}`:''}</div></li>`).join('')
    : '<li class="empty">尚無紀錄。第一筆學習紀錄從上方表單開始。</li>';
}

function renderAttempts(){
  const sel=$('#f-attempt select[name=session_id]');
  const cur=sel.value;
  sel.innerHTML='<option value="">（不連結）</option>'+S.data.sessions.slice().sort((a,b)=>b.session_id.localeCompare(a.session_id)).slice(0,15).map(s=>`<option value="${esc(s.session_id)}">${esc(s.session_id)} ${esc(s.mode)}</option>`).join('');
  sel.value=cur;

  const pending=S.data.attempts.filter(a=>a.review_flag==='是').sort((a,b)=>b.attempt_date.localeCompare(a.attempt_date)||b.attempt_id.localeCompare(a.attempt_id));
  $('#review-count').textContent=pending.length;
  $('#review-list').innerHTML= pending.length? pending.slice(0,40).map(a=>`
    <li><details><summary style="list-style:none;color:inherit">
      <div class="t"><span>${esc(a.material_type==='官方題'? `${a.prep_test} ${a.section} Q${a.question_number}`:'原創題')}　<span class="tag">${esc(a.mode)}</span></span>
      <span>${esc(a.timed_answer)}→${esc(a.correct_answer)}${a.blind_review_answer?`　盲審 ${esc(a.blind_review_answer)}`:''}</span></div>
      <div class="m">${esc(a.attempt_date)}　${esc(a.question_type||'')}　${flagReasons(a).map(r=>`<span class="tag flag">${r}</span>`).join(' ')}${a.blind_review_answer?'':'　<span class="tag">盲審未填</span>'}</div>
      </summary>
      <form class="f-review" data-id="${esc(a.attempt_id)}">
        <label class="f"><span class="l">盲審答案</span><div class="seg ans" data-seg="blind_review_answer" data-opt="answer" data-clearable="1"></div></label>
        <label class="f"><span class="l">理由正確</span><div class="seg" data-seg="reason_correct" data-opt="reason_correct"></div></label>
        <div class="row"><label class="f"><span class="l">連結錯誤指紋</span><select name="signature_id"><option value=""></option>${S.data.signatures.map(s=>`<option ${s.signature_id===a.signature_id?'selected':''}>${esc(s.signature_id)}</option>`).join('')}</select></label>
        <label class="f"><span class="l">備註</span><input type="text" name="notes" value="${esc(a.notes||'')}"></label></div>
        <div class="actions"><button class="btn" type="submit">更新</button></div>
      </form></details></li>`).join('') : '<li class="empty">目前沒有待檢討題目。</li>';
  buildSegs($('#review-list'));
  $$('.f-review').forEach(f=>{ const a=S.data.attempts.find(x=>x.attempt_id===f.dataset.id); segSet(f,'blind_review_answer',a.blind_review_answer); segSet(f,'reason_correct',a.reason_correct);
    f.addEventListener('submit',e=>{ e.preventDefault(); const o=formData(f); const rec=Object.assign({},a,{blind_review_answer:o.blind_review_answer||'',reason_correct:o.reason_correct||'',signature_id:o.signature_id||'',notes:o.notes||'',updated_at:nowISO()});
      deriveAttempt(rec); persist('attempts',rec); toast('已更新'); renderAll(); }); });

  const off=S.data.attempts.filter(a=>a.material_type==='官方題'), orig=S.data.attempts.filter(a=>a.material_type!=='官方題');
  const stat=arr=>({n:arr.length, fc:arr.filter(a=>a.first_correct==='是').length, brN:arr.filter(a=>a.blind_review_answer).length, brC:arr.filter(a=>a.blind_correct==='是').length, rc:arr.filter(a=>a.reason_correct==='是').length, rcN:arr.filter(a=>a.reason_correct).length});
  const so=stat(off), sg=stat(orig);
  $('#attempt-stats').innerHTML=`
    <tr><td>官方題筆數</td><td>${so.n}</td></tr>
    <tr><td>官方題第一次正確率</td><td>${pct(so.fc,so.n)}</td></tr>
    <tr><td>官方題盲審正確率（已盲審 ${so.brN}）</td><td>${pct(so.brC,so.brN)}</td></tr>
    <tr><td>官方題理由正確率（已判斷 ${so.rcN}）</td><td>${pct(so.rc,so.rcN)}</td></tr>
    <tr><td>原創題筆數（分開計，不推估分數）</td><td>${sg.n}　第一次 ${pct(sg.fc,sg.n)}</td></tr>`;
}

function renderTrack(){
  const t=todayLA(), cp=nextCheckpoint();
  $('#cp-next').innerHTML= cp? `<table class="ledger">
    <tr><td>${esc(cp.checkpoint_id)}　${esc(cp.gate)}</td><td><span class="big">${dateDiffDays(t,cp.review_date)}</span> 天　${esc(cp.review_date)}</td></tr>
    <tr><td>核心問題</td><td style="text-align:left">${esc(cp.core_question)}</td></tr>
    <tr><td>必要證據</td><td style="text-align:left">${esc(cp.required_evidence)}</td></tr>
    <tr><td>參考門檻</td><td style="text-align:left">${esc(cp.threshold)}</td></tr></table>
    <form id="f-cp" data-id="${esc(cp.checkpoint_id)}">
      <label class="f"><span class="l">狀態</span><div class="seg" data-seg="checkpoint_status" data-opt="checkpoint_status"></div></label>
      <label class="f"><span class="l">決定</span><div class="seg" data-seg="checkpoint_decision" data-opt="checkpoint_decision" data-clearable="1"></div></label>
      <label class="f"><span class="l">證據摘要</span><textarea name="evidence_summary">${esc(cp.evidence_summary||'')}</textarea></label>
      <div class="actions"><button class="btn ghost" type="submit">保存檢查點</button></div></form>` : '<div class="empty">四個檢查點皆已完成。</div>';
  if(cp){ const f=$('#f-cp'); buildSegs(f); segSet(f,'checkpoint_status',cp.checkpoint_status); segSet(f,'checkpoint_decision',cp.checkpoint_decision);
    f.addEventListener('submit',e=>{ e.preventDefault(); const o=formData(f); const rec=Object.assign({},cp,{checkpoint_status:o.checkpoint_status||cp.checkpoint_status, checkpoint_decision:o.checkpoint_decision||'', evidence_summary:o.evidence_summary||'', decision_date:o.checkpoint_status==='已完成'? t:(cp.decision_date||''), updated_at:nowISO()});
      persist('checkpoints',rec); toast('已保存'); renderAll(); }); }
  $('#cp-list').innerHTML=S.data.checkpoints.map(c=>`<li><div class="t"><span>${esc(c.checkpoint_id)}　${esc(c.gate)}</span><span>${esc(c.review_date)}　<span class="tag ${c.checkpoint_status==='已完成'?'ok':''}">${esc(c.checkpoint_status)}</span></span></div><div class="m">${esc(c.checkpoint_decision||'尚無決定')}${c.evidence_summary?`　${esc(c.evidence_summary)}`:''}</div></li>`).join('');

  const sigs=S.data.signatures.slice().sort((a,b)=> (a.signature_status==='追蹤中'?0:1)-(b.signature_status==='追蹤中'?0:1) || a.signature_id.localeCompare(b.signature_id));
  $('#sig-count').textContent=sigs.filter(s=>s.signature_status==='追蹤中').length+' 追蹤中';
  $('#sig-list').innerHTML= sigs.length? sigs.map(s=>`<li><details><summary style="list-style:none;color:inherit">
      <div class="t"><span>${esc(s.signature_id)}　${esc(s.error_type)}</span><span class="tag ${s.signature_status==='已封存'?'ok':''}">${esc(s.signature_status)}</span></div>
      <div class="m">${esc(s.trigger_signal)}｜${esc(s.attraction||'')}｜${esc(s.corrective_action)}｜${esc(s.stage)}　證據 ${s.evidence_count}　最近 ${esc(s.last_seen)}</div></summary>
      <form class="f-sig-edit" data-id="${esc(s.signature_id)}">
        <label class="f"><span class="l">狀態</span><div class="seg" data-seg="signature_status" data-opt="signature_status"></div></label>
        <label class="f"><span class="l">驗證階段</span><div class="seg" data-seg="stage" data-opt="signature_stage"></div></label>
        <div class="actions"><button class="btn ghost" type="button" data-act="seen">記錄再次出現</button><button class="btn" type="submit">更新</button></div></form></details></li>`).join('')
    : '<li class="empty">尚無錯誤指紋。單次錯題先留在題目紀錄。</li>';
  buildSegs($('#sig-list'));
  $$('.f-sig-edit').forEach(f=>{ const s=S.data.signatures.find(x=>x.signature_id===f.dataset.id); segSet(f,'signature_status',s.signature_status); segSet(f,'stage',s.stage);
    const stageFlags=st=>({near_transfer: ['近移轉通過','遠移轉通過','延遲複測通過','官方計時驗證通過'].includes(st)?'通過':s.near_transfer, far_transfer:['遠移轉通過','延遲複測通過','官方計時驗證通過'].includes(st)?'通過':s.far_transfer, delayed_retest:['延遲複測通過','官方計時驗證通過'].includes(st)?'通過':s.delayed_retest, official_timed: st==='官方計時驗證通過'?'通過':s.official_timed});
    f.addEventListener('submit',e=>{ e.preventDefault(); const o=formData(f); const st=o.stage||s.stage; persist('signatures',Object.assign({},s,stageFlags(st),{signature_status:o.signature_status||s.signature_status, stage:st, updated_at:nowISO()})); toast('已更新'); renderAll(); });
    $('[data-act=seen]',f).addEventListener('click',()=>{ persist('signatures',Object.assign({},s,{evidence_count:(s.evidence_count||0)+1,last_seen:t,updated_at:nowISO()})); toast('已記錄再次出現'); renderAll(); }); });

  $('#hyp-list').innerHTML=S.data.hypotheses.map(h=>`<li><details><summary style="list-style:none;color:inherit">
      <div class="t"><span>${esc(h.hypothesis_id)}　<span class="tag">${esc(h.scope)}</span></span><span class="tag ${['已否定','已解決'].includes(h.hypothesis_status)?'ok':''}">${esc(h.hypothesis_status)}</span></div>
      <div class="m">${esc(h.statement)}</div></summary>
      <form class="f-hyp" data-id="${esc(h.hypothesis_id)}">
        <label class="f"><span class="l">狀態</span><div class="seg" data-seg="hypothesis_status" data-opt="hypothesis_status"></div></label>
        <label class="f"><span class="l">支持證據</span><textarea name="supporting_evidence">${esc(h.supporting_evidence||'')}</textarea></label>
        <label class="f"><span class="l">反證或限制</span><textarea name="contrary_evidence">${esc(h.contrary_evidence||'')}</textarea></label>
        <div class="row"><label class="f"><span class="l">獨立觀察次數</span><input type="number" name="independent_observations" value="${esc(h.independent_observations??0)}" min="0"></label>
        <label class="f"><span class="l">下一項測試</span><input type="text" name="next_test" value="${esc(h.next_test||'')}"></label></div>
        <label class="f"><span class="l">目前決定</span><input type="text" name="current_decision" value="${esc(h.current_decision||'')}"></label>
        <div class="actions"><button class="btn" type="submit">更新假設</button></div></form></details></li>`).join('');
  buildSegs($('#hyp-list'));
  $$('.f-hyp').forEach(f=>{ const h=S.data.hypotheses.find(x=>x.hypothesis_id===f.dataset.id); segSet(f,'hypothesis_status',h.hypothesis_status);
    f.addEventListener('submit',e=>{ e.preventDefault(); const o=formData(f); persist('hypotheses',Object.assign({},h,{hypothesis_status:o.hypothesis_status||h.hypothesis_status, supporting_evidence:o.supporting_evidence, contrary_evidence:o.contrary_evidence, independent_observations:num(o.independent_observations), next_test:o.next_test, current_decision:o.current_decision, last_updated:t, updated_at:nowISO()})); toast('已更新'); renderAll(); }); });

  const exp=S.data.exposure.slice().sort((a,b)=>a.pt_id.localeCompare(b.pt_id,undefined,{numeric:true}));
  $('#exp-list').innerHTML= exp.length? exp.map(x=>`<li><div class="t"><span>${esc(x.pt_id)}　<span class="tag ${x.clean_pt_eligible==='是'?'ok':'flag'}">${x.clean_pt_eligible==='是'?'可作乾淨模考':'不可作乾淨模考'}</span></span><span>${esc(x.exposure_status)}</span></div>
      <div class="m">${esc(x.sections_seen||'')}${x.full_score?`　分數 ${x.full_score}`:''}${x.last_exposure?`　最近 ${esc(x.last_exposure)}`:''}　${esc(x.notes||'')}</div></li>`).join('') : '<li class="empty">尚無紀錄。</li>';
}

function renderSettings(){
  $('#sync-ledger').innerHTML=`<tr><td>資料來源</td><td>${S.remoteOk?'repo data 資料夾':'本機快照'}</td></tr>
    <tr><td>未同步檔案</td><td>${S.dirty.size? Array.from(S.dirty).join('、'):'無'}</td></tr>
    <tr><td>寫入目標</td><td style="text-align:left">${S.gh&&S.gh.owner? esc(`${S.gh.owner}/${S.gh.repo}@${S.gh.branch}`):'未設定'}</td></tr>
    <tr><td>權杖</td><td>${S.gh&&S.gh.token? '已保存於本機':'未填'}</td></tr>`;
  $('#ver-ledger').innerHTML=`<tr><td>App</td><td>${APP_VERSION}</td></tr><tr><td>資料結構</td><td>${esc(S.settings.schema_version)}</td></tr><tr><td>讀書計畫版本</td><td>${esc(S.settings.plan_version)}</td></tr><tr><td>時區</td><td>${esc(S.settings.timezone)}</td></tr>`;
}

function renderAll(){ renderHeader(); renderToday(); renderAttempts(); renderWeakness(); renderReview(); renderTrack(); renderSettings(); }

/* ---------- context pack ---------- */
function buildPack(){
  const t=todayLA(), range=$('#pack-range').value, detail=$('#pack-detail').value==='1';
  const since = range==='all' ? '0000-00-00' : addDays(t, -Number(range)+1);
  const ph=phaseFor(t), [ws,we]=weekRange(t), cp=nextCheckpoint();
  const ses=S.data.sessions.filter(s=>s.session_date>=since).sort((a,b)=>a.session_date.localeCompare(b.session_date));
  const att=S.data.attempts.filter(a=>a.attempt_date>=since);
  const off=att.filter(a=>a.material_type==='官方題'), orig=att.filter(a=>a.material_type!=='官方題');
  const wkMins=S.data.sessions.filter(s=>s.session_date>=ws&&s.session_date<=we).reduce((a,s)=>a+(s.effective_minutes||0),0);
  const L=[];
  L.push(`# LSJN2027 上下文包`);
  L.push(`產生日期 ${t}（${S.settings.timezone}）　範圍 ${range==='all'?'全部':`最近 ${range} 天（自 ${since}）`}　資料結構 ${S.settings.schema_version}`);
  L.push(``);
  L.push(`## 目前位置`);
  L.push(`- 階段：${ph.key}${weekLabel(t)!==ph.key?`　${weekLabel(t)}`:''}（${ws} 至 ${we}）　每週預算 ${ph.weekly_hours} 小時`);
  L.push(`- 本週有效小時：${fmtMin(wkMins)}　累計：${fmtMin(S.data.sessions.reduce((a,s)=>a+(s.effective_minutes||0),0))} / ${S.settings.total_plan_hours}`);
  if(cp){ L.push(`- 下一個檢查點：${cp.checkpoint_id} ${cp.gate}　${cp.review_date}（${dateDiffDays(t,cp.review_date)} 天後）`); L.push(`  - 核心問題：${cp.core_question}`); L.push(`  - 必要證據：${cp.required_evidence}`); L.push(`  - 參考門檻：${cp.threshold}`); if(cp.evidence_summary) L.push(`  - 目前證據摘要：${cp.evidence_summary}`); }
  L.push(``);
  L.push(`## 學習紀錄摘要（${ses.length} 筆，${fmtMin(ses.reduce((a,s)=>a+(s.effective_minutes||0),0))} 小時）`);
  const byMode={}; ses.forEach(s=>byMode[s.mode]=(byMode[s.mode]||0)+(s.effective_minutes||0));
  L.push(`- 模式分布（小時）：${Object.entries(byMode).map(([k,v])=>`${k} ${fmtMin(v)}`).join('；')||'無'}`);
  const lvl=(arr,k)=>{ const c={}; arr.forEach(s=>{ if(s[k]) c[s[k]]=(c[s[k]]||0)+1; }); return Object.entries(c).map(([a,b])=>`${a}${b}`).join(' ')||'無'; };
  L.push(`- 專注：${lvl(ses,'attention')}　疲勞：${lvl(ses,'fatigue')}　依計畫完成：${lvl(ses,'completion')}`);
  const focus=ses.map(s=>s.focus_skill).filter(Boolean); if(focus.length) L.push(`- 重點能力：${Array.from(new Set(focus)).join('；')}`);
  L.push(``);
  const statBlock=(arr,title)=>{
    const n=arr.length, fc=arr.filter(a=>a.first_correct==='是').length, brN=arr.filter(a=>a.blind_review_answer).length, brC=arr.filter(a=>a.blind_correct==='是').length;
    const rcN=arr.filter(a=>a.reason_correct).length, rc=arr.filter(a=>a.reason_correct==='是').length;
    const ot=arr.filter(a=>a.overtime==='是').length, gs=arr.filter(a=>a.guessed==='是').length, lo=arr.filter(a=>a.confidence==='低').length;
    const secs=arr.map(a=>a.elapsed_seconds).filter(v=>v!=null); const avg=secs.length? Math.round(secs.reduce((a,b)=>a+b,0)/secs.length):null;
    L.push(`## ${title}（${n} 題）`);
    if(!n){ L.push(`- 無`); L.push(``); return; }
    L.push(`- 第一次正確 ${fc}/${n}（${pct(fc,n)}）　盲審正確 ${brC}/${brN}　理由正確 ${rc}/${rcN}`);
    L.push(`- 逾時 ${ot}　猜測 ${gs}　低信心 ${lo}　平均秒數 ${avg??'—'}`);
    const g={}; arr.forEach(a=>{ const k=a.section||'—'; g[k]=g[k]||{n:0,c:0}; g[k].n++; if(a.first_correct==='是') g[k].c++; });
    if(arr.some(a=>a.section)) L.push(`- 依部分：${Object.entries(g).map(([k,v])=>`${k} ${v.c}/${v.n}`).join('；')}`);
    const q={}; arr.forEach(a=>{ const k=a.question_type||'未標'; q[k]=q[k]||{n:0,c:0}; q[k].n++; if(a.first_correct==='是') q[k].c++; });
    L.push(`- 依題型：${Object.entries(q).sort((a,b)=>b[1].n-a[1].n).map(([k,v])=>`${k} ${v.c}/${v.n}`).join('；')}`);
    L.push(``);
  };
  statBlock(off,'官方題表現'); statBlock(orig,'原創題表現（分開計，不推估分數）');
  if(detail){
    const pend=att.filter(a=>a.review_flag==='是').sort((a,b)=>a.attempt_id.localeCompare(b.attempt_id));
    L.push(`## 待檢討題目明細（${pend.length} 題）`);
    if(!pend.length) L.push(`- 無`);
    pend.forEach(a=> L.push(`- ${a.attempt_id}｜${a.mode}｜${a.material_type}${a.material_type==='官方題'?`｜${a.prep_test} ${a.section} Q${a.question_number}`:''}｜${a.question_type||'題型未標'}｜第一次 ${a.timed_answer}${a.blind_review_answer?` 盲審 ${a.blind_review_answer}`:' 盲審未填'} 正解 ${a.correct_answer}｜${a.elapsed_seconds!=null?a.elapsed_seconds+'秒':'秒數—'}｜信心${a.confidence||'—'}｜重讀${a.reread_method||'—'}｜理由${a.reason_correct||'未判斷'}｜${flagReasons(a).join('、')}${a.signature_id?`｜${a.signature_id}`:''}${a.notes?`｜${a.notes}`:''}`));
    L.push(``);
  }
  const lastHo=S.data.handoffs.slice().sort((a,b)=>b.date.localeCompare(a.date)||b.handoff_id.localeCompare(a.handoff_id))[0];
  L.push(`## 上次課程接續`);
  if(lastHo){ L.push(`- ${lastHo.handoff_id}｜${lastHo.date}｜停在：${lastHo.stopped_at}`); if(lastHo.taught) L.push(`- 已教：${lastHo.taught}`); if(lastHo.observed) L.push(`- 觀察：${lastHo.observed}`); L.push(`- 下次任務：${lastHo.next_task}`); if(lastHo.open_questions) L.push(`- 待處理問題：${lastHo.open_questions}`); }
  else L.push(`- 尚無接續摘要`);
  L.push(``);
  const wk=weaknessTable(S.data.attempts.filter(a=>a.material_type==='官方題')).filter(r=>r.score>0).slice(0,6);
  L.push(`## 弱點排序（官方題全期，樣本 ≥ ${S.settings.weakness_min_n||3}）`);
  if(!wk.length) L.push(`- 尚無達門檻且有錯題的題型`); wk.forEach(r=>L.push(`- ${r.kind} ${r.k}｜第一次 ${r.c}/${r.n}｜盲審 ${r.br}/${r.brN}｜理由錯 ${r.rw}`));
  L.push(``);
  const ask=S.data.cards.filter(c=>c.ask_chat==='是'), dueC=S.data.cards.filter(c=>c.next_review&&c.next_review<=t);
  L.push(`## 知識卡片（共 ${S.data.cards.length}，到期 ${dueC.length}，待解釋 ${ask.length}）`);
  ask.forEach(c=>L.push(`- 待 Claude 解釋：${c.card_id}｜${c.title}｜${c.core}${c.common_error?`｜誤判：${c.common_error}`:''}`));
  S.data.cards.filter(c=>c.card_status==='待確認'&&c.ask_chat!=='是').slice(0,10).forEach(c=>L.push(`- 待確認：${c.card_id}｜${c.title}`));
  L.push(``);
  const act=S.data.signatures.filter(s=>s.signature_status!=='已封存');
  L.push(`## 錯誤指紋（未封存 ${act.length}）`);
  if(!act.length) L.push(`- 無`);
  act.forEach(s=>L.push(`- ${s.signature_id}｜${s.error_type}｜${s.trigger_signal}｜${s.attraction||'—'}｜${s.corrective_action}｜${s.stage}｜${s.signature_status}｜證據 ${s.evidence_count}｜最近 ${s.last_seen}`));
  L.push(``);
  const openH=S.data.hypotheses.filter(h=>!['已否定','已解決'].includes(h.hypothesis_status));
  L.push(`## 未結案診斷假設（${openH.length}）`);
  openH.forEach(h=>L.push(`- ${h.hypothesis_id}｜${h.scope}｜${h.statement}｜${h.hypothesis_status}｜獨立觀察 ${h.independent_observations}｜下一項測試：${h.next_test}`));
  L.push(``);
  const notClean=S.data.exposure.filter(x=>x.clean_pt_eligible!=='是').map(x=>`${x.pt_id}（${x.exposure_status}）`);
  L.push(`## 官方題接觸`);
  L.push(`- 不可作乾淨完整模考：${notClean.join('、')||'無'}`);
  L.push(``);
  L.push(`## 使用限制`);
  L.push(`- 本包只含題號與表現資料，不含題目全文。原創題表現不得與官方題混合，也不得用來推估分數。`);
  L.push(`- 正確率須與盲審、理由品質、延遲保留及錯誤重複一併判讀，不得單獨作為決定依據。`);
  return L.join('\n');
}

/* ---------- xlsx export ---------- */
function loadScript(src){ return new Promise((res,rej)=>{ if(document.querySelector(`script[src="${src}"]`)) return res(); const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('無法載入 SheetJS')); document.head.appendChild(s); }); }
async function exportXlsx(){
  try{ await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); }catch(e){ toast(e.message); return; }
  const H={
    sessions:[['session_id','紀錄編號'],['session_date','日期'],['week_label','週次'],['phase','階段'],['mode','模式'],['effective_minutes','有效分鐘'],['material_source','材料來源'],['lr_minutes','LR分鐘'],['rc_minutes','RC分鐘'],['review_minutes','檢討分鐘'],['focus_skill','重點能力'],['completion','依計畫完成'],['attention','專注程度'],['fatigue','疲勞程度'],['sleep_hours','睡眠小時'],['notes','備註']],
    attempts:[['attempt_id','作答編號'],['attempt_date','日期'],['session_id','學習紀錄編號'],['mode','模式'],['material_type','材料類型'],['source','來源'],['prep_test','測驗編號'],['section','部分'],['question_number','題號'],['question_type','題型'],['skill_tag','能力標籤'],['timed_answer','第一次答案'],['blind_review_answer','盲審答案'],['correct_answer','正確答案'],['first_correct','第一次正確'],['blind_correct','盲審正確'],['elapsed_seconds','作答秒數'],['confidence','信心程度'],['reread_method','重讀方式'],['overtime','逾時'],['guessed','猜測'],['reason_correct','理由正確'],['review_flag','檢討標記'],['signature_id','錯誤指紋編號'],['notes','備註']],
    exposure:[['pt_id','測驗編號'],['exposure_status','接觸狀態'],['first_exposure','首次接觸'],['last_exposure','最近接觸'],['sections_seen','已看部分'],['questions_seen','已看題數'],['full_score','完整分數'],['blind_review','盲審'],['explanations_seen','看過解析'],['clean_pt_eligible','可作乾淨完整模考'],['notes','備註'],['source','來源']],
    signatures:[['signature_id','指紋編號'],['error_type','錯誤類型'],['trigger_signal','觸發訊號'],['attraction','錯誤選項為何有吸引力'],['corrective_action','修正動作'],['signature_status','狀態'],['created','建立日期'],['last_seen','最近出現'],['stage','驗證階段'],['near_transfer','近移轉'],['far_transfer','遠移轉'],['delayed_retest','延遲複測'],['official_timed','官方計時驗證'],['evidence_count','證據筆數'],['notes','備註']],
    hypotheses:[['hypothesis_id','假設編號'],['scope','範圍'],['statement','假設內容'],['hypothesis_status','狀態'],['first_raised','首次提出'],['last_updated','最近更新'],['supporting_evidence','支持證據'],['contrary_evidence','反證或限制'],['independent_observations','獨立觀察次數'],['next_test','下一項測試'],['checkpoint','檢查點'],['current_decision','目前決定'],['source','來源']],
    cards:[['card_id','卡片編號'],['title','標題'],['core','核心區分'],['common_error','常見誤判'],['corrective_action','修正動作'],['example','例子'],['scope','範圍'],['signature_id','錯誤指紋編號'],['source','來源'],['card_status','狀態'],['next_review','下次複習'],['review_count','複習次數'],['last_result','最近結果'],['ask_chat','待Claude解釋']],
    handoffs:[['handoff_id','接續編號'],['date','日期'],['session_id','學習紀錄編號'],['stopped_at','停點'],['taught','已教'],['observed','觀察'],['next_task','下次任務'],['open_questions','待處理問題']],
    checkpoints:[['checkpoint_id','檢查點'],['review_date','檢視日期'],['gate','階段門檻'],['core_question','核心問題'],['required_evidence','必要證據'],['threshold','參考門檻'],['checkpoint_status','狀態'],['checkpoint_decision','決定'],['decision_date','決定日期'],['evidence_summary','證據摘要'],['repair_action','修復動作']]
  };
  const names={sessions:'學習紀錄',attempts:'題目紀錄',exposure:'官方題目使用',signatures:'錯誤指紋',hypotheses:'診斷假設',checkpoints:'檢查點',cards:'知識卡片',handoffs:'課程接續'};
  const wb=XLSX.utils.book_new();
  for(const f of FILES){ const rows=[H[f].map(h=>h[1])].concat(S.data[f].map(r=>H[f].map(h=>r[h[0]]??''))); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), names[f]); }
  XLSX.writeFile(wb, `LSJN2027_Tracker_export_${todayLA()}.xlsx`); toast('已產生 xlsx');
}
function downloadJSON(){
  const blob=new Blob([JSON.stringify({settings:S.settings, ...S.data},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`LSJN2027_data_${todayLA()}.json`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

/* ---------- init ---------- */
function initForms(){
  buildSegs();
  const o=S.settings.options;
  fillSelect($('#f-attempt select[name=section]'), o.section, true);
  fillSelect($('#f-attempt select[name=question_type]'), o.question_type_lr, true);
  fillSelect($('#batch-mode'), o.mode); $('#batch-mode').value='測驗';
  fillSelect($('#f-exp select[name=exposure_status]'), o.exposure_status);
  $('#f-attempt select[name=section]').addEventListener('change',e=>{ const rc=e.target.value==='RC'; fillSelect($('#f-attempt select[name=question_type]'), rc? o.question_type_rc:o.question_type_lr, true); });
  $('#f-attempt').addEventListener('segchange',e=>{ if(e.detail.name==='material_type'){ $('#official-fields').style.opacity = e.detail.value==='原創題'? .45:1; } });
  const t=todayLA(); $('#f-session input[name=session_date]').value=t; $('#f-attempt input[name=attempt_date]').value=t; $('#batch-date').value=t;

  $('#f-session').addEventListener('submit', onSessionSubmit);
  $('#f-attempt').addEventListener('submit', onAttemptSubmit);
  $('#btn-batch').addEventListener('click', onBatch);
  $('#f-sig').addEventListener('submit', onSigSubmit);
  $('#f-exp').addEventListener('submit', onExpSubmit);
  $('#f-card').addEventListener('submit', onCardSubmit);
  $('#btn-wb-check').addEventListener('click', wbCheck);
  $('#btn-wb-apply').addEventListener('click', wbApply);
  $('#btn-pack').addEventListener('click',()=>{ $('#pack-out').textContent=buildPack(); $('#btn-copy').disabled=false; });
  $('#btn-copy').addEventListener('click', async()=>{ const txt=$('#pack-out').textContent; try{ await navigator.clipboard.writeText(txt); toast('已複製'); }catch{ const r=document.createRange(); r.selectNodeContents($('#pack-out')); const s=getSelection(); s.removeAllRanges(); s.addRange(r); toast('請手動複製已選取的文字'); } });
  $('#btn-xlsx').addEventListener('click', exportXlsx);
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
