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
