export function mountOperations({request,isActive}) {
 const el=id=>document.getElementById(id);
 let version=0,last=null;
 const cells=(parent,values,heading=false)=>{
  const row=document.createElement('tr');
  for(const value of values){const cell=document.createElement(heading?'th':'td');cell.textContent=String(value??'없음');row.append(cell);}
  parent.append(row);
 };
 function reset(){
  version++;last=null;
  el('ops-summary').textContent='승인 후 서버 기록을 읽습니다.';
  el('ops-message').textContent='';el('ops-table').replaceChildren();
  el('ops-case').replaceChildren();el('ops-target').value='';el('ops-download').disabled=true;
  el('operations-panel').hidden=true;el('notes-area').hidden=false;
 }
 function render(data){
  last=data;
  const c=data.checks,counts=c.totals;
  const restore=data.recovery.restoreCount;
  el('ops-summary').textContent=[
   `배포 버전: ${data.commit??'확인 불가'}`,
   `학생 판정 규칙 ${data.policy.ruleIds.length}개: ${data.policy.ruleIds.join(', ')}`,
   `탐지 규칙 ${data.detection.ruleIds.length}개 · 운영 사건 미연결 · 엔진 회수 미실측`,
   `앱 승인 상태(최근 50개): 승인 ${data.revocation.approved??'조회 불가'}, 미승인 ${data.revocation.notApproved??'조회 불가'} · 미승인을 회수 건수로 세지 않음`,
   `사전 정책 사본: ${data.recovery.policySnapshotCommit} · 본인 복원 감사 ${restore??'조회 불가'}건(최근 50개)`,
   counts?`가린 HTTP 기록 ${counts.recorded}건 · 기대 일치 ${counts.matched} · 불일치 ${counts.mismatched} · 응답 미확인 ${counts.unavailable}`:'HTTP 기록 조회 불가: step12_operations.sql 적용 여부와 서버 연결을 확인하세요.',
   `총공세 41종: 종별 명세·심판 결과 미수신, 실행 확인 0/41. 아래 자체 점검을 41종 통과로 계산하지 않습니다.`,
   `제공: ${data.provenance.engine} / 학생: ${data.provenance.student}`
  ].join('\n');
  el('ops-case').replaceChildren();
  for(const check of data.cases.filter(c=>c.runnable!==false)){
   const option=document.createElement('option');option.value=check.id;option.textContent=check.label;el('ops-case').append(option);
  }
  const table=el('ops-table');table.replaceChildren();
  cells(table,['단계','요청/검증','기대','실제 결과','출처','API 요청 ID / 점검 ID','확인 시각'],true);
  for(const check of data.cases){
   const records=data.checks.records.filter(r=>r.case_id===check.id);
   if(!records.length)cells(table,[check.stages,`${check.label} (${check.method} ${check.path})`,check.expected.join(' / '),'미실행','현재 서버 기록 없음','없음','없음']);
   for(const r of records)cells(table,[check.stages,`${check.label} (${r.method} ${r.route})`,r.expected_statuses.join(' / '),
    r.actual_status===null?'HTTP 미확인':`HTTP ${r.actual_status} · ${r.matched?'기대 일치':'불일치'}${r.details?.verified!==undefined?` · 사본검증 ${r.details.verified} · 현재내용일치 ${r.details.currentMatches}`:''}`,
    r.source,`${r.request_id??'API ID 미제공'} / ${r.check_id}`,r.checked_at]);
  }
  for(const r of data.userReports)cells(table,[r.stages,r.label,'사용자 확인 절차',r.observed,'사용자 보고 · 자동 실측 아님','당시 요청 ID 미수집',`${r.reportedDate} 보고(정확한 요청 시각 미수집)`]);
  el('ops-download').disabled=false;
 }
 async function load(){
  if(!isActive())return;const current=version;
  try{const data=await request();if(current===version&&isActive())render(data);}
  catch(error){if(current===version)el('ops-message').textContent=error.message;}
 }
 el('ops-refresh').addEventListener('click',load);
 el('ops-open').addEventListener('click',async()=>{
  if(!isActive())return;
  el('notes-area').hidden=true;el('operations-panel').hidden=false;await load();
 });
 el('vault-open').addEventListener('click',()=>{
  el('operations-panel').hidden=true;el('notes-area').hidden=false;
 });
 el('ops-run').addEventListener('click',async()=>{
  if(!isActive())return;
  const check=last?.cases.find(c=>c.id===el('ops-case').value);
  if(!check)return;
  const payload={caseId:check.id};if(check.input)payload[check.input]=el('ops-target').value.trim();
  const current=version;el('ops-run').disabled=true;el('ops-message').textContent='실제 읽기 요청과 서버 기록 저장 중입니다.';
  try{
   const result=await request({method:'POST',body:JSON.stringify(payload)});
   if(current!==version||!isActive())return;
   el('ops-message').textContent=`기록 저장 완료: HTTP ${result.actual_status??'미확인'} · 점검 ${result.check_id}`;
   await load();
  }catch(error){if(current===version)el('ops-message').textContent=error.message;}
  finally{el('ops-run').disabled=false;}
 });
 el('ops-download').addEventListener('click',()=>{
  if(!last||!isActive())return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='operations-redacted.json';link.click();URL.revokeObjectURL(url);
 });
 reset();return {reset,load};
}
