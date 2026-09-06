import assert from "node:assert/strict";
import test from "node:test";
import {isPin,learningRole,recentDetailed,recommend} from "../app/recommendation";
import {formatGrade,gradeProgressionOrder,highestNumericGrade,sortGrades} from "../app/data";

test("review and preview roles follow the selected grade",()=>{
 assert.equal(learningRole(9,7),"review");
 assert.equal(learningRole(7,7),"review");
 assert.equal(learningRole(6,7),"preview");
 assert.equal(learningRole(5,7),null);
 assert.equal(learningRole(1,1),"review");
 assert.equal(learningRole(undefined,3),null);
});

test("ungraded is explicit, displayed first and never treated as numeric grade zero",()=>{
 assert.equal(formatGrade("ungraded"),"무급");
 assert.deepEqual(sortGrades([2,"ungraded",9,5]),["ungraded",9,5,2]);
 assert.ok(gradeProgressionOrder("ungraded")<gradeProgressionOrder(9));
 assert.equal(highestNumericGrade(["ungraded",7,5,2]),2);
 assert.equal(highestNumericGrade(["ungraded"]),undefined);
});

test("ungraded receives initial ninth-grade coverage only",()=>{
 assert.equal(learningRole(9,"ungraded"),"initial");
 assert.equal(learningRole(8,"ungraded"),null);
 assert.equal(learningRole(9,9),"review");
 assert.equal(learningRole(8,9),"preview");
});

test("recent detailed lessons use session order and exclude session-only and canceled records",()=>{
 const kata=recommend([7],1,[])[0];
 const logs=[
  {status:"완료" as const,recordType:"detailed" as const,session:1012,katas:[kata]},
  {status:"완료" as const,recordType:"sessionOnly" as const,session:1014,katas:[]},
  {status:"취소" as const,session:undefined,katas:[kata]},
  {status:"완료" as const,recordType:"detailed" as const,session:1013,katas:[kata]}
 ];
 assert.deepEqual(recentDetailed(logs).map(log=>log.session),[1013,1012]);
});

test("recommendations keep ratios, alternation, limits and determinism from 2 to 10 katas",()=>{
 for(let count=2;count<=10;count++){
  const first=recommend([7,5,3,2],count,[],new Set(),"balanced");
  const second=recommend([7,5,3,2],count,[],new Set(),"balanced");
  assert.equal(first.length,count);
  assert.deepEqual(first.map(k=>k.name),second.map(k=>k.name));
  const pins=first.filter(isPin).length;
  assert.ok(Math.abs(pins-(count-pins))<=1);
  for(let index=1;index<first.length;index++)assert.notEqual(isPin(first[index]),isPin(first[index-1]));
  for(const technique of new Set(first.map(k=>k.technique)))assert.ok(first.filter(k=>k.technique===technique).length<=2);
  for(const attack of new Set(first.map(k=>k.attack)))assert.ok(first.filter(k=>k.attack===attack).length<=2);
  assert.ok(first.every(k=>k.name!=="엇서한손잡기 구석던지기"));
 }
});

test("regeneration avoids the current plan when enough alternatives exist",()=>{
 const first=recommend([7,5,3,2],5,[],new Set(),"balanced");
 const alternative=recommend([7,5,3,2],5,[],new Set(first.map(k=>k.name)),"balanced");
 assert.equal(alternative.length,5);
 assert.ok(alternative.filter(k=>first.some(item=>item.name===k.name)).length<5);
});

test("a single selected grade behaves consistently in both grade modes",()=>{
 const balanced=recommend([5],5,[],new Set(),"balanced");
 const highest=recommend([5],5,[],new Set(),"highest");
 assert.deepEqual(balanced.map(k=>k.name),highest.map(k=>k.name));
});

test("ungraded-only recommendations are safe and consistent in both modes",()=>{
 const balanced=recommend(["ungraded"],5,[],new Set(),"balanced");
 const highest=recommend(["ungraded"],5,[],new Set(),"highest");
 assert.equal(balanced.length,5);
 assert.deepEqual(balanced.map(k=>k.name),highest.map(k=>k.name));
 assert.ok(balanced.some(k=>k.grade===9));
});

test("mixed ungraded recommendations retain numeric highest focus and determinism",()=>{
 const grades=["ungraded",7,5,2] as const;
 const first=recommend([...grades],5,[],new Set(),"highest");
 const second=recommend([...grades],5,[],new Set(),"highest");
 assert.equal(first.length,5);
 assert.deepEqual(first.map(k=>k.name),second.map(k=>k.name));
 assert.ok(first.some(k=>k.grade===9));
});

test("numeric-only v0.9.7 fixtures remain unchanged",()=>{
 assert.deepEqual(recommend([7,5,3,2],5,[],new Set(),"balanced").map(k=>k.name),["좌기 정면타 1교","뒤양손잡기 입신던지기","뒤양손잡기 1교","반신반립 양손잡기 사방던지기","좌기 정면타 4교"]);
 assert.deepEqual(recommend([7,5,3,2],5,[],new Set(),"highest").map(k=>k.name),["좌기 정면타 1교","반신반립 양손잡기 사방던지기","좌기 정면타 4교","반신반립 엇서한손잡기 사방던지기","횡면타 5교"]);
});
