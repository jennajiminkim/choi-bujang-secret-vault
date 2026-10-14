export function mountOperations({request,isActive,protectedRequest}) {
 const el=id=>document.getElementById(id);
 let version=0,last=null,prepared=null;
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 const hash=/^[0-9a-f]{64}$/;
 function clearPreview(){prepared=null;el('ops-restore-panel').hidden=true;el('ops-restore-preview').textContent='';el('ops-restore-consent').checked=false;el('ops-restore-confirm').disabled=true;}
 function selection(){
  version++;clearPreview();
  const check=last?.cases.find(c=>c.id===el('ops-case').value);
  const mode=check?.mode;
  el('ops-target').disabled=!check?.input;
  el('ops-run').disabled=mode==='engine';
  el('ops-run').textContent=mode==='editor'?'내 메모에서 수정하기':mode==='restore'?'복원 사본 먼저 확인':mode==='notice'?'공지 수정 권한 거부 점검':'실제 읽기 점검 실행';
  el('ops-help').textContent=mode==='engine'?'제공 엔진의 실제 결과가 필요합니다. 현재 미연결이며 자동 통과로 처리하지 않습니다.':mode==='editor'?'내 메모 화면에서 수정 저장하면 API 결과가 자동 기록됩니다. 새 메모 추가는 수정 시험이 아닙니다.':mode==='restore'?'B로 로그인하여 기존 백업 ID를 넣으세요. 사본 확인 후 한 건만 복원합니다.':mode==='notice'?'학생 계정에서 실제 공지 ID를 넣으세요. 비어 있는 수정 본문을 보내 강사 권한 거부를 확인하며 공지 내용은 바꾸지 않습니다.':check?.input?'선택한 계정·점검에 맞는 실제 ID를 입력하세요.':'ID 입력 없이 실행합니다.';
 }
 const cells=(parent,values,heading=false)=>{
  const row=document.createElement('tr');
  for(const value of values){const cell=document.createElement(heading?'th':'td');cell.textContent=String(value??'없음');row.append(cell);}
  parent.append(row);
 };
 function reset(){
  version++;last=null;clearPreview();
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
   `사전 정책 사본: ${data.recovery.policySnapshotCommit} · 본인 복원 감사 ${restore===null?'조회 불가':restore+'건'}(최근 50개)`,
   data.mutationRecording==='ready'?'수정·공지 거부·복원 API 자동 기록 준비됨':'추가 SQL 필요: step12_operations_mutations.sql 적용 후 서버 기록 새로고침',
   counts?`가린 HTTP 기록 ${counts.recorded}건 · 기대 일치 ${counts.matched} · 불일치 ${counts.mismatched} · 응답 미확인 ${counts.unavailable}`:'HTTP 기록 조회 불가: step12_operations.sql 적용 여부와 서버 연결을 확인하세요.',
   `총공세 41종: 종별 명세·심판 결과 미수신, 실행 확인 0/41. 아래 자체 점검을 41종 통과로 계산하지 않습니다.`,
   `제공: ${data.provenance.engine} / 학생: ${data.provenance.student}`
  ].join('\n');
  const selected=el('ops-case').value;
  el('ops-case').replaceChildren();
  for(const check of data.cases){
   const option=document.createElement('option');option.value=check.id;option.textContent=check.label+(check.mode==='engine'?' — 엔진 확인 필요':'');el('ops-case').append(option);
  }
  el('ops-case').value=data.cases.some(c=>c.id===selected)?selected:data.cases[0].id;selection();
  const table=el('ops-table');table.replaceChildren();
  cells(table,['단계','요청/검증','기대','실제 결과','출처','API 요청 ID / 점검 ID','확인 시각'],true);
  for(const check of data.cases){
   const records=data.checks.records.filter(r=>r.case_id===check.id);
   if(!records.length)cells(table,[check.stages,`${check.label} (${check.method} ${check.path})`,check.expected.join(' / '),check.mode==='engine'?'엔진 확인 필요':check.mode==='editor'?'수정 API 기록 없음':check.mode==='restore'?'복원 API 기록 없음':'미실행',check.mode==='engine'?'제공 엔진 결과 미수신':'현재 서버 기록 없음','없음','없음']);
   for(const r of records)cells(table,[check.stages,`${check.label} (${r.method} ${r.route})`,r.expected_statuses.join(' / '),
    r.actual_status===null?'HTTP 미확인':`HTTP ${r.actual_status} · ${r.matched?'기대 일치':'불일치'}${r.details?.verified!==undefined?` · 사본검증 ${r.details.verified}${r.details.currentMatches!==undefined?' · 현재내용일치 '+r.details.currentMatches:''}`:''}`,
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
   if(check.mode==='engine')return;
   if(check.mode&&last.mutationRecording!=='ready')throw new Error('먼저 Supabase에서 step12_operations_mutations.sql을 적용한 뒤 서버 기록 새로고침을 누르세요.');
   if(check.mode==='editor'){
    el('operations-panel').hidden=true;el('notes-area').hidden=false;return;
   }
   if(check.input&&!uuid.test(el('ops-target').value.trim()))throw new Error('예시 문구 대신 실제 UUID 형식의 ID를 입력하세요.');
   if(check.mode==='restore'){
    clearPreview();
    const result=await protectedRequest('/api/note-backups?backupId='+encodeURIComponent(payload.backupId));
    if(current!==version||!isActive())return;
    const m=result.data;
    if(result.status!==200||m.verified!==true||!uuid.test(m.id??'')||m.backupId!==payload.backupId||!hash.test(m.contentHash??''))throw new Error(m.error||'사본 검증에 실패했습니다. 복원하지 않습니다.');
    prepared={backupId:m.backupId,confirmHash:m.contentHash};
    el('ops-restore-preview').textContent=`복원할 메모 ID: ${m.id}\n사전 백업 ID: ${m.backupId}\n사본 내용 해시: ${m.contentHash}\n사본 검증: true · 현재 내용 일치: ${m.currentHash===m.contentHash}\n변경 범위: 위 시험 메모 한 건의 제목·내용을 사전 백업으로 복원합니다.`;
    el('ops-restore-panel').hidden=false;
    el('ops-message').textContent='사본을 확인했습니다. 아직 복원하지 않았습니다. 대상과 변경 범위를 확인하세요.';return;
   }
   if(check.mode==='notice'){
    const result=await protectedRequest('/api/notices/'+encodeURIComponent(payload.noticeId),'PUT',{});
    if(current!==version||!isActive())return;
    el('ops-message').textContent=`HTTP ${result.status} · ${result.recorded?'서버 API 기록 저장 완료':'기록 저장 미확인: 추가 SQL을 확인하세요.'}`;
    await load();return;
   }
   const result=await request({method:'POST',body:JSON.stringify(payload)});
   if(current!==version||!isActive())return;
   el('ops-message').textContent=`기록 저장 완료: HTTP ${result.actual_status??'미확인'} · 점검 ${result.check_id}`;
   await load();
  }catch(error){if(current===version)el('ops-message').textContent=error.message;}
  finally{el('ops-run').disabled=last?.cases.find(c=>c.id===el('ops-case').value)?.mode==='engine';}
 });
 el('ops-case').addEventListener('change',selection);
 el('ops-target').addEventListener('input',()=>{version++;clearPreview();});
 el('ops-restore-consent').addEventListener('change',()=>{el('ops-restore-confirm').disabled=!prepared||!el('ops-restore-consent').checked;});
 el('ops-restore-confirm').addEventListener('click',async()=>{
  if(!isActive()||!prepared||!el('ops-restore-consent').checked)return;
  const body={...prepared},current=version;clearPreview();el('ops-run').disabled=true;
  el('ops-message').textContent='확인한 한 건을 복원하고 있습니다. 다시 누르지 마세요.';
  try {
   const result=await protectedRequest('/api/note-restores','POST',body);
   if(current!==version||!isActive())return;
   if(result.status!==200||result.data.verified!==true)throw new Error(`HTTP ${result.status} · ${result.data.error||'복원 검증 실패'}`);
   el('ops-message').textContent=`복원 API HTTP 200 · 검증 true · ${result.recorded?'복원 기록 저장 완료':'복원은 완료됐지만 기록 저장 실패: 복원을 반복하지 마세요.'}`;
   try {
    const checked=await request({method:'POST',body:JSON.stringify({caseId:'backup_verify',backupId:body.backupId})});
    if(current!==version||!isActive())return;
    el('ops-message').textContent+=` · 복원 후 재검증 HTTP ${checked.actual_status} · 현재내용일치 ${checked.details?.currentMatches??'미확인'}`;
   }catch{if(current===version)el('ops-message').textContent+=' · 복원 후 재검증은 미확인입니다. 읽기 재검증만 다시 실행하세요.';}
   await load();
  }catch(error){if(current===version){el('ops-message').textContent=error.message+' 응답 미확인 시 먼저 백업 재검증으로 현재 상태를 확인하세요.';await load();}}
  finally{el('ops-run').disabled=last?.cases.find(c=>c.id===el('ops-case').value)?.mode==='engine';}
 });
 el('ops-download').addEventListener('click',()=>{
  if(!last||!isActive())return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(last,null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='operations-redacted.json';link.click();URL.revokeObjectURL(url);
 });
 reset();return {reset,load};
}
