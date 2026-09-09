import assert from "node:assert/strict";
import test from "node:test";
import {EXAM_GROUPS,KATAS} from "../app/data";
import {ungradedLearningStage} from "../app/recommendation";

test("the direct-entry second control is a non-exam Hombu kata but not beginner-safe",()=>{
 const kata=KATAS.find(item=>item.name==="맞서한손잡기에서 바로 넣는 2교");
 assert.ok(kata);
 assert.equal(kata.hombu,true);
 assert.equal(kata.exam,false);
 assert.equal(kata.grade,undefined);
 assert.equal(kata.technique,"2교");
 assert.equal(kata.attack,"맞서한손잡기");
 assert.equal(ungradedLearningStage(kata),null);
 assert.ok(!Object.values(EXAM_GROUPS).some(group=>group.kata.includes(kata.name)));
});

test("numbered generic video pairs survive canonical Kata construction",()=>{
 for(const name of ["찌르기 손목뒤집기","양손잡기 허리던지기"]){
  const kata=KATAS.find(item=>item.name===name);
  assert.ok(kata);
  assert.equal(kata.links.length,2);
  assert.deepEqual(kata.links.map(link=>link.label),["1","2"]);
 }
});

test("eighth-grade basics are not duplicated in later cumulative exam tabs",()=>{
 const cases=[
  {name:"맞서한손잡기 입신던지기",removedFrom:6},
  {name:"엇서한손잡기 사방던지기",removedFrom:5}
 ] as const;
 for(const {name,removedFrom} of cases){
  const kata=KATAS.find(item=>item.name===name);
  assert.ok(kata);
  assert.equal(kata.grade,8);
  assert.equal(kata.exam,true);
  assert.equal(kata.hombu,true);
  assert.ok(EXAM_GROUPS[8].kata.includes(name));
  assert.ok(!EXAM_GROUPS[removedFrom].kata.includes(name));
  assert.ok(kata.links.length>0);
 }
});

test("registers the thirteen Hombu special katas with fifteen exact video links",()=>{
 const expected={
  "2인 잡기 사방던지기":[[undefined,141]],
  "2인 잡기 호흡던지기 1":[[undefined,226]],
  "2인 잡기 호흡던지기 2":[[undefined,306]],
  "단도 뺏기 좌기 정면타 5교":[["오모테",376],["우라",493]],
  "단도 뺏기 횡면타 5교":[["오모테",593],["우라",713]],
  "단도 뺏기 찌르기 팔꿈치굳히기(6교)":[[undefined,819]],
  "단도 뺏기 찌르기 손목뒤집기":[[undefined,909]],
  "단도 뺏기 횡면타 사방던지기":[[undefined,989]],
  "검 뺏기 손목뒤집기":[[undefined,1079]],
  "검 뺏기 호흡던지기":[[undefined,1149]],
  "장 뺏기 입신던지기":[[undefined,1219]],
  "장 뺏기 호흡던지기":[[undefined,1274]],
  "장 뺏기 사방던지기":[[undefined,1339]]
 } as const;
 const special=KATAS.filter(k=>Object.hasOwn(expected,k.name));
 assert.equal(special.length,13);
 assert.equal(special.reduce((sum,k)=>sum+k.links.length,0),15);
 assert.deepEqual([special.filter(k=>k.name.startsWith("2인 잡기 ")).length,special.filter(k=>k.name.startsWith("단도 뺏기 ")).length,special.filter(k=>k.name.startsWith("검 뺏기 ")).length,special.filter(k=>k.name.startsWith("장 뺏기 ")).length],[3,5,2,3]);
 for(const [name,links] of Object.entries(expected)){
  const kata=KATAS.find(k=>k.name===name);
  assert.ok(kata);
  assert.equal(kata.hombu,true);
  assert.equal(kata.exam,false);
  assert.equal(kata.grade,undefined);
  assert.deepEqual(kata.links.map(link=>[link.label,Number(new URL(link.url).searchParams.get("t"))]),links);
 }
 assert.ok(!KATAS.some(k=>/^(단도잡기|검잡기|장잡기)/.test(k.name)));
 assert.ok(!Object.values(EXAM_GROUPS).some(group=>group.kata.some(name=>Object.hasOwn(expected,name))));
});

test("finds Hombu special katas through the existing name and technique search fields",()=>{
 const search=(query:string)=>KATAS.filter(k=>k.hombu&&(k.name.includes(query)||k.technique.includes(query)||k.attack.includes(query)));
 for(const query of ["2인 잡기","단도 뺏기","검 뺏기","장 뺏기","사방던지기","호흡던지기","5교","6교","팔꿈치굳히기","손목뒤집기","입신던지기"]){
  assert.ok(search(query).length>0,query);
 }
});
