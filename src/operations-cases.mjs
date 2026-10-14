// Current-pipeline checklist. Unrun entries are not results of the 41-kind judge assault.
export const OPERATIONS_CASES = Object.freeze([
 {id:'app_page',stages:'1,11',label:'접속 앱 공개 화면',method:'GET',path:'/',expected:[200],input:null},
 {id:'own_list',stages:'2,3,4,5,8,11',label:'API 본인 목록(서버 소유자 필터)',method:'GET',path:'/api/notes',expected:[200],input:null},
 {id:'own_read',stages:'3,4,8,11',label:'본인 메모 한 건 읽기',method:'GET',path:'/api/notes/:id',expected:[200],input:'noteId'},
 {id:'anonymous_read',stages:'3,5',label:'익명 자료 요청 거부',method:'GET',path:'/api/notes',expected:[401,403],input:null},
 {id:'foreign_read',stages:'4,8',label:'다른 계정의 실제 메모 읽기 거부',method:'GET',path:'/api/notes/:id',expected:[404],input:'noteId'},
 {id:'unregistered_read',stages:'6,11',label:'기기 확인값 없는 자료 요청 거부',method:'GET',path:'/api/notes',expected:[403],input:null},
 {id:'backup_verify',stages:'10',label:'본인 사전 백업 재검증',method:'GET',path:'/api/note-backups?backupId=:id',expected:[200],input:'backupId'},
 {id:'own_write',stages:'2,4,8',label:'본인 메모 수정',method:'PUT',path:'/api/notes/:id',expected:[200],runnable:false,mode:'editor'},
 {id:'notice_write',stages:'8',label:'학생 공지 수정 거부',method:'PUT',path:'/api/notices/:id',expected:[403],runnable:false,mode:'notice',input:'noticeId'},
 {id:'compound_step_up',stages:'7',label:'복합 이상과 새 로그인 확인',method:'ENGINE',path:'ALEPH SDP',expected:['step_up','verified_request_allow'],runnable:false,mode:'engine'},
 {id:'detect_revoke',stages:'9',label:'복합 탐지 제안·엔진 회수',method:'ENGINE',path:'ALEPH SDP',expected:['propose_revocation','engine_confirmed_revocation'],runnable:false,mode:'engine'},
 {id:'restore_one',stages:'10',label:'B 시험 메모 한 건 복원',method:'POST',path:'/api/note-restores',expected:[200],runnable:false,mode:'restore',input:'backupId'},
]);

// User reports have no captured request ID or exact API timestamp. Keep them separate.
export const USER_VERIFICATIONS = Object.freeze([
 {stages:'11',label:'설치 앱 승인 전 자료 없음·승인 후 메모 읽기/수정',observed:'사용자 확인 완료'},
 {stages:'11',label:'오프라인 숨김·재연결 확인',observed:'사용자 확인 완료'},
 {stages:'11',label:'승인 철회 시 숨김·재승인 후 표시',observed:'사용자 화면 확인 완료; HTTP 상태 미기록'},
 {stages:'6,11',label:'승인 전 직접 자료 API',observed:'HTTP 403'},
 {stages:'4,8,11',label:'B의 A 메모 읽기',observed:'HTTP 404'},
 {stages:'10,11',label:'B 한 건 백업·복원 후 재검증',observed:'GET/POST/GET 200; verified true; 최종 현재내용일치 true'},
].map(row=>Object.freeze({...row,source:'user_report',reportedDate:'2026-10-14',requestId:null})));
