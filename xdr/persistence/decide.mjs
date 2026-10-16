const PATTERNS = [
  {
    "name": "낯선 서비스 등록·변경",
    "condition": "T1543 계열 경보에서 새 서비스·실행 파일 변경과 서명 없음 또는 평소 목록 이탈이 확인되고 임시 실행 경로가 겹칠 때, 수준 10 이상이면 block 후보. 경로가 없어도 서명 없는 서비스 등록 집계 3건 이상은 후보. 서명 미확인은 서명 없음으로 바꾸지 않는다.",
    "evidence": "MITRE T1543은 서비스를 만들거나 변경하여 재시작 뒤에도 악성 프로그램을 실행하는 지속성 기법을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1543/"
    ],
    "thresholds": {
      "highLevel": 10,
      "alertLevel": 5,
      "minRepeat": 3
    }
  },
  {
    "name": "낯선 예약 작업",
    "condition": "T1053 계열에서 새롭거나 임의 이름의 예약 작업이 임시 경로의 실행 파일을 가리키거나, 시작 프로그램과 예약 작업이 같은 임시 파일을 가리키며 수준 10 이상이면 block 후보. 수업 시각의 작업·서명 미확인만 있으면 alert.",
    "evidence": "MITRE T1053은 예약 작업을 이용한 반복 실행과 지속성을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1053/"
    ]
  },
  {
    "name": "시작 폴더의 미등록 프로그램",
    "condition": "실제 Startup 경로에 평소 목록에 없는 실행 파일이 추가된 무결성 경보이며 수준 10 이상이면 block 후보. 변경만 있거나 목록·실행 파일 근거가 없으면 alert. 수집기의 T1543 표기는 시작 폴더 기법 자체의 분류로 간주하지 않는다.",
    "evidence": "MITRE T1547.001은 시작 폴더에 프로그램을 추가해 로그인 때 실행하는 지속성 기법을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1547/001/"
    ]
  },
  {
    "name": "지속성 의심 변경",
    "condition": "수준 5 이상 T1543·T1053·T1547.001 경보 또는 시작 폴더 변경은 근거가 부족하면 alert. 저수준의 기존·서명된 서비스·일상 작업·읽기만 한 이벤트는 record.",
    "evidence": "MITRE T1543·T1053의 서비스·작업 생성 및 변경을 조사하되 정상 관리 작업과 구분해야 한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1543/",
      "https://attack.mitre.org/techniques/T1053/"
    ]
  }
];

function answer(confidence, reason) {
  return {action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason};
}
function text(value){return typeof value==='string'?value.slice(0,4096):'';}
function count(value){
  if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return 0;
  const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;
}
export function decide(alert){
  if(!alert||typeof alert!=='object'||Array.isArray(alert))return answer(0,'일반 이벤트');
  const data=alert.data||{},description=text(alert.rule?.description),path=text(data.path);
  const level=count(alert.rule?.level),mitre=alert.rule?.mitre;
  const tags=Array.isArray(mitre)?mitre:Array.isArray(mitre?.id)?mitre.id:[];
  const has=prefix=>tags.some(tag=>typeof tag==='string'&&(tag===prefix||tag.startsWith(prefix+'.')));
  const service=/서비스|\bservice\b/i.test(description);
  const task=/예약 작업|scheduled task|cron job/i.test(description);
  const startup=/시작 폴더|시작 프로그램|startup/i.test(description);
  const temp=/(?:^|[\\/])(?:temp|tmp)(?:[\\/])/i.test(path);
  const executable=/\.(?:exe|cmd|bat|ps1|vbs|js|sh)$/i.test(path);
  const unsigned=/서명 없는|서명이 없|\bunsigned\b/i.test(description);
  const unknown=/평소 목록에 없|처음 보는|낯선|임의 문자열|unknown|unrecognized/i.test(description);
  const changed=/새 서비스|서비스 등록|등록됐|실행 파일이 바뀌|new service|service.*(?:created|modified)/i.test(description);
  const negative=/등록은 없|등록되지 않|실행 파일은 그대로|읽기만|변경 없음|no (?:service|task) (?:created|registered)/i.test(description);
  const high=level>=PATTERNS[0].thresholds.highLevel;
  if(high&&!negative){
    if(has('T1543')&&service&&changed&&((temp&&executable&&(unsigned||unknown))||(unsigned&&count(data.count)>=PATTERNS[0].thresholds.minRepeat)))return answer(0.95,PATTERNS[0].name);
    if(has('T1053')&&task&&temp&&executable&&(unknown||(startup&&/같은.*(?:임시|파일)/.test(description))))return answer(0.94,PATTERNS[1].name);
    const startupPath=/(?:^|[\\/])startup[\\/][^\\/]+\.(?:exe|cmd|bat|ps1|vbs|js|lnk)$/i.test(path);
    if(startup&&startupPath&&unknown&&/추가|생겼|added|created/i.test(description)&&(has('T1543')||has('T1547')))return answer(0.93,PATTERNS[2].name);
  }
  if(level>=5&&(has('T1543')||has('T1053')||has('T1547')||startup))return answer(0.6,PATTERNS[3].name);
  return answer(0.1,'일반 이벤트');
}
