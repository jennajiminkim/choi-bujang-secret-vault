const PATTERNS = [
  {
    "name": "비정상 관리자 그룹 추가",
    "condition": "관리자 그룹 필드와 실제 추가·재가입 요약, T1078 계열 근거가 있고 원격 추가·즉시 권한 명령·다수 계정 추가(3건 이상)·회수 직후 재가입(2건 이상)이 겹치며 수준 10 이상이면 block 후보. 수업 그룹·단순 조회·취소·실패는 차단하지 않는다.",
    "evidence": "MITRE T1078은 정상 계정 악용을 설명하고 T1098.007은 추가 그룹 가입으로 권한을 확대하는 계정 조작을 구체화한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1078/",
      "https://attack.mitre.org/techniques/T1098/007/"
    ],
    "thresholds": {
      "highLevel": 10,
      "alertLevel": 5,
      "multipleAccounts": 3,
      "rejoin": 2
    }
  },
  {
    "name": "권한 상승 직후 관리자 명령",
    "condition": "T1068·T1078 계열의 수준 10 이상 경보에서 방금 얻은 관리자 권한의 명령 실행, 다른 계정 권한의 관리자 명령, 낯선 주소와 업무 시간 밖 관리자 실행 또는 세션 권한 상승과 낯선 주소가 함께 확인되면 block 후보. 시각 하나로 차단하지 않는다.",
    "evidence": "MITRE T1068은 취약점 악용을 통한 권한 상승을, T1078은 도용한 계정의 권한 사용을 설명하며 본 경보만으로 특정 취약점 악용을 확정하지 않는다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1068/",
      "https://attack.mitre.org/techniques/T1078/"
    ]
  },
  {
    "name": "권한 사용 확인 필요",
    "condition": "수준 5 이상 T1068·T1078·T1098 계열의 불충분한 권한 변경·관리자 명령 경보는 alert. 정상·낮은 수준의 로그인·조회·예약 확인은 record.",
    "evidence": "MITRE T1078 관련 계정 악용은 정상 사용과 맥락을 비교해야 하므로 권한 단어 하나나 시각만으로 회수를 확정하지 않는다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1078/"
    ]
  }
];

function answer(confidence, reason){return {action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason};}
function count(value){
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return 0;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;
}
export function decide(alert){
 if(!alert||typeof alert!=='object'||Array.isArray(alert))return answer(0,'일반 이벤트');
 const data=alert.data||{},description=typeof alert.rule?.description==='string'?alert.rule.description.slice(0,4096):'';
 const level=count(alert.rule?.level),mitre=alert.rule?.mitre;
 const tags=Array.isArray(mitre)?mitre:Array.isArray(mitre?.id)?mitre.id:[];
 const has=prefix=>tags.some(t=>typeof t==='string'&&(t===prefix||t.startsWith(prefix+'.')));
 const relevant=has('T1068')||has('T1078')||has('T1098');
 const negative=/취소|실패|명령은 없|변경은 없|그룹은 아|읽기만|조회한|설명만|cancelled|failed|read.only/i.test(description);
 if(level>=PATTERNS[0].thresholds.highLevel&&relevant&&!negative){
  const group=typeof data.group==='string'?data.group.toLowerCase():'';
  const adminGroup=['administrators','domain admins','enterprise admins','관리자'].includes(group);
  const addition=/추가|그룹에 들어|다시 관리자로 들어|added|rejoined/i.test(description);
  const command=/관리자 명령|권한 명령|명령 실행|admin(?:istrator)? command/i.test(description);
  const rejoin=/빠진|회수|제거|removed/i.test(description)&&/다시|rejoin/i.test(description)&&count(data.count)>=PATTERNS[0].thresholds.rejoin;
  const multi=count(data.count)>=PATTERNS[0].thresholds.multipleAccounts;
  if(has('T1078')&&adminGroup&&addition&&(/원격/.test(description)||command||multi||rejoin))return answer(0.96,PATTERNS[0].name);
  const unknown=/처음 보는 주소|주소는 처음|낯선 주소|unusual address/i.test(description);
  const offHours=/시간 밖|업무처럼 보이지 않는 시각|outside.*hours/i.test(description);
  const justElevated=/방금 관리자가|새로.*관리자|just.*admin/i.test(description);
  const otherAccount=/다른 계정의 권한|another account/i.test(description);
  const changedSession=/세션이 관리자 권한으로 바뀌|session.*elevated/i.test(description);
  if((command&&(justElevated||otherAccount||(unknown&&offHours)))||(changedSession&&unknown))return answer(0.94,PATTERNS[1].name);
 }
 if(level>=5&&relevant)return answer(0.6,PATTERNS[2].name);
 return answer(0.1,'일반 이벤트');
}
