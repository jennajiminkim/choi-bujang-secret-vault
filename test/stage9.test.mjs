import test from 'node:test';
import assert from 'node:assert/strict';
import { detect, readEvent } from '../src/detect.mjs';
const start = Date.UTC(2026,9,1);
const reads = (count, overrides={}) => Array.from({length:count},(_,i)=>({
  at:new Date(start+i*2000).toISOString(),method:'GET',identity:{sub:'learner_fixture'},
  deviceId:'a'.repeat(16),network:'unusual',decision:'allow',...overrides}));
const observe = {action:'observe'};
test('normal, isolated signals, missing signals and denied requests stay observe',()=>{
  for(const input of [reads(30),reads(121,{network:'usual'}),reads(121,{network:undefined}),
    reads(121,{deviceId:undefined}),reads(121,{decision:undefined}),reads(121,{decision:'deny'}),
    reads(121,{method:'PUT'}),reads(120),reads(121,{network:'unknown'})])
    assert.deepEqual(detect(input),observe);
});
test('compound read burst proposes precisely one confirmed device',()=>{
  assert.deepEqual(detect(reads(121)),{action:'propose_revocation',reasonCode:'burst_read',subject:'learner_fixture',device:'a'.repeat(16)});
});
test('different subjects and devices never combine',()=>{
  assert.deepEqual(detect([...reads(100),...reads(100,{deviceId:'b'.repeat(16)})]),observe);
  assert.deepEqual(detect([...reads(100),...reads(100,{identity:{sub:'other_fixture'}})]),observe);
});
test('normal first burst cannot hide later suspicious burst, unsorted events supported',()=>{
  const later=reads(121).map(e=>({...e,at:new Date(Date.parse(e.at)+1200000).toISOString()}));
  assert.equal(detect([...later,...reads(121,{network:'usual'})].reverse()).device,'a'.repeat(16));
});
test('600 seconds is outside window; 599 seconds is inside',()=>{
  const input=reads(121).map((e,i)=>({...e,at:new Date(start+(i===120?600000:i)).toISOString()}));
  assert.deepEqual(detect(input),observe);
  input[120].at=new Date(start+599000).toISOString();
  assert.equal(detect(input).action,'propose_revocation');
});
test('credentials and contents are never read, inputs never mutated',()=>{
  const input=reads(121);const before=JSON.stringify(input);
  for(const event of input) for(const key of ['token','body','fullName','email'])
    Object.defineProperty(event,key,{get(){throw Error('secret_access');}});
  assert.equal(detect(input).action,'propose_revocation');
  assert.equal(JSON.stringify(input),before);
  assert.equal(readEvent({at:'bad',method:'GET',identity:{sub:'fixture'}}),null);
});
test('legacy compatibility isolated from enriched events',()=>{
  const legacy=reads(121).map(({at,method,identity})=>({at,method,identity}));
  assert.deepEqual(detect(legacy),{action:'propose_revocation',reasonCode:'burst_read',subject:'learner_fixture'});
  assert.deepEqual(detect([...legacy,...reads(20)]),observe);
});
