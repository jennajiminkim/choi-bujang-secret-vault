const PATTERNS = [
  {
    "name": "낯선 목적지의 대용량 반출",
    "condition": "T1041·T1048 계열, 수준 10 이상, 목적지와 전송 바이트 50000000 이상이 있고 처음 보는 목적지·낯선 포트·짧은 시간 전체 복사·같은 목적지 반복 5건 이상 중 추가 근거가 있으면 block 후보. 목적지·바이트·근거 누락은 alert.",
    "evidence": "MITRE T1041은 기존 C2 통로를, T1048은 다른 프로토콜을 이용한 자료 반출을 설명한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1041/",
      "https://attack.mitre.org/techniques/T1048/"
    ],
    "thresholds": {
      "highLevel": 10,
      "alertLevel": 5,
      "largeBytes": 50000000,
      "minRepeat": 5
    }
  },
  {
    "name": "시간 밖 압축 파일 반출",
    "condition": "수준 10 이상 관련 기법 경보에서 실제 외부 전송·대용량·압축 파일 요약과 낯선 목적지 또는 업무 시간 밖 사용이 겹치면 block 후보. 압축 생성만 했거나 실패·소량·시각 단독이면 alert.",
    "evidence": "MITRE T1048은 외부 목적지로 파일을 전송하는 반출 기법을 설명하며 압축·시각은 전송 맥락을 보강하는 신호로만 사용한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1048/"
    ]
  },
  {
    "name": "외부 전송 확인 필요",
    "condition": "수준 5 이상 T1041·T1048 경보에 불충분한 전송·증가·압축·실패 신호가 있으면 alert. 정상·작은 동기화·자료실 조회는 record.",
    "evidence": "MITRE T1041·T1048 관련 전송은 정상 통신과 구분해야 하므로 용량·목적지·실제 전송을 함께 확인한다.",
    "sources": [
      "https://attack.mitre.org/techniques/T1041/",
      "https://attack.mitre.org/techniques/T1048/"
    ]
  }
];

function answer(confidence,reason){return {action:confidence>=0.85?'block':confidence>=0.5?'alert':'record',confidence,reason};}
function integer(value){
 if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))return 0;
 const n=Number(value);return Number.isSafeInteger(n)&&n>=0?n:0;
}
export function decide(alert){
 if(!alert||typeof alert!=='object'||Array.isArray(alert))return answer(0,'일반 이벤트');
 const data=alert.data||{},description=typeof alert.rule?.description==='string'?alert.rule.description.slice(0,4096):'';
 const tags=Array.isArray(alert.rule?.mitre)?alert.rule.mitre:Array.isArray(alert.rule?.mitre?.id)?alert.rule.mitre.id:[];
 const relevant=tags.some(t=>typeof t==='string'&&/^(?:T1041|T1048)(?:\.|$)/.test(t));
 const level=integer(alert.rule?.level),bytes=integer(data.bytes),repeat=integer(data.count);
 const destination=typeof data.dstip==='string'&&data.dstip.length>0&&data.dstip.length<=45;
 const large=bytes>=PATTERNS[0].thresholds.largeBytes;
 const negative=/전송은.*없|전송이 실패|전송하지 않|승인된 정상|no (?:external )?transfer|transfer failed/i.test(description);
 const novel=/처음 보는 (?:목적지|주소)|처음 봅니다|평소와 다른 주소|unusual destination|new destination/i.test(description);
 const offHours=/시간 밖|outside.*hours/i.test(description);
 const archive=/압축 파일|archive/i.test(description);
 if(relevant&&level>=PATTERNS[0].thresholds.highLevel&&destination&&large&&!negative){
  if(archive&&(novel||offHours))return answer(0.96,PATTERNS[1].name);
  const unusualPort=/평소에 쓰지 않던 포트|낯선 포트|unusual port/i.test(description);
  const whole=/짧은 시간.*전체.*외부|bulk.*external/i.test(description);
  const transfer=/나갔|전송|복사됐|올라갔|upload|transfer|copied/i.test(description);
  if(transfer&&(novel||unusualPort||whole||repeat>=PATTERNS[0].thresholds.minRepeat))return answer(0.95,PATTERNS[0].name);
 }
 if(relevant&&level>=PATTERNS[0].thresholds.alertLevel)return answer(0.6,PATTERNS[2].name);
 return answer(0.1,'일반 이벤트');
}
