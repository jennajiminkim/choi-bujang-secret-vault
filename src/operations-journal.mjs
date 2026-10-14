import {randomUUID} from 'node:crypto';
const specs={own_write:{method:'PUT',route:'/api/notes/:id',expected:[200]},
 notice_write:{method:'PUT',route:'/api/notices/:id',expected:[403]},
 restore_one:{method:'POST',route:'/api/note-restores',expected:[200]}};
// Installed only after the API has verified login and device approval.
// Capture server-selected status, never client-supplied test outcomes or memo contents.
export function installMutationJournal({res,supabase,user,caseId,requestId}) {
 const spec=specs[caseId];
 const send=res.json.bind(res),status=res.status.bind(res);let code=200,sent=false;
 res.status=value=>{code=value;status(value);return res;};
 res.json=async body=>{
  if(sent)return;sent=true;
  const details={expectedResponseType:true};
  if(caseId==='restore_one'&&code===200)details.verified=body?.verified===true;
  const record={check_id:randomUUID(),owner_id:user.userId,request_id:requestId,case_id:caseId,
   method:spec.method,route:spec.route,expected_statuses:spec.expected,actual_status:code,
   matched:spec.expected.includes(code)&&(caseId!=='restore_one'||details.verified===true),
   checked_at:new Date().toISOString(),source:'server_api',details};
  try {
   const {error}=await supabase.from('vault_ops_checks').insert(record);
   res.setHeader('X-Operations-Recorded',error?'false':'true');
  }catch{res.setHeader('X-Operations-Recorded','false');}
  // A logging outage must not report a completed mutation as failed and invite a retry.
  return send(body);
 };
}
