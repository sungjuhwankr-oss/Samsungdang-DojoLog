import assert from "node:assert/strict";
import test from "node:test";
import {EMPTY_SPECIAL_KATA_OPTIONS,SPECIAL_KATA_POOLS,effectiveRecommendationGrades,isPin,learningRole,recentDetailed,recommend,recommendSpecialKatas,recommendWithSpecialKatas,ungradedLearningStage,type SpecialKataOptions} from "../app/recommendation";
import {KATAS,formatGrade,gradeProgressionOrder,highestNumericGrade,sortGrades} from "../app/data";

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
 for(const count of [5,7]){
  const balanced=recommend(["ungraded"],count,[],new Set(),"balanced");
  const repeated=recommend(["ungraded"],count,[],new Set(),"balanced");
  const highest=recommend(["ungraded"],count,[],new Set(),"highest");
  assert.equal(balanced.length,count);
  assert.equal(new Set(balanced.map(k=>k.id)).size,count);
  assert.ok(balanced.every(k=>ungradedLearningStage(k)!==null));
  assert.ok(balanced.every(k=>k.name!=="좌기 호흡법"&&k.name!=="엇서한손잡기 구석던지기"&&k.name!=="맞서한손잡기에서 바로 넣는 2교"));
  assert.deepEqual(balanced.map(k=>k.name),repeated.map(k=>k.name));
  assert.deepEqual(balanced.map(k=>k.name),highest.map(k=>k.name));
  assert.equal(ungradedLearningStage(balanced[0]),"initial");
 }
});

test("ungraded-only shortage never adds advanced or duplicate katas",()=>{
 const result=recommend(["ungraded"],10,[],new Set(),"balanced");
 assert.equal(result.length,7);
 assert.equal(new Set(result.map(k=>k.id)).size,result.length);
 assert.ok(result.every(k=>ungradedLearningStage(k)!==null));
});

test("mixed ungraded recommendations retain numeric highest focus and determinism",()=>{
 const grades=["ungraded",7,5,2] as const;
 const first=recommend([...grades],5,[],new Set(),"highest");
 const second=recommend([...grades],5,[],new Set(),"highest");
 assert.equal(first.length,5);
 assert.deepEqual(first.map(k=>k.name),second.map(k=>k.name));
 assert.ok(first.some(k=>k.grade===9));
});

test("mixed ungraded and seventh-grade lessons do not receive the ungraded-only cap",()=>{
 const result=recommend(["ungraded",7],7,[],new Set(),"balanced");
 assert.equal(result.length,7);
 assert.ok(result.some(k=>ungradedLearningStage(k)===null));
 assert.ok(result.some(k=>k.grade===6));
});

test("numeric-only v0.9.7 fixtures remain unchanged",()=>{
 assert.deepEqual(recommend([7,5,3,2],5,[],new Set(),"balanced").map(k=>k.name),["좌기 정면타 1교","뒤양손잡기 입신던지기","뒤양손잡기 1교","반신반립 양손잡기 사방던지기","좌기 정면타 4교"]);
 assert.deepEqual(recommend([7,5,3,2],5,[],new Set(),"highest").map(k=>k.name),["좌기 정면타 1교","반신반립 양손잡기 사방던지기","좌기 정면타 4교","반신반립 엇서한손잡기 사방던지기","횡면타 5교"]);
 const singleGradeFixtures={
  7:["뒤양손잡기 입신던지기","좌기 정면타 1교","맞서한손잡기 입신던지기","정면타 1교","맞서한손잡기 손목뒤집기"],
  5:["반신반립 양손잡기 사방던지기","좌기 정면타 2교","반신반립 엇서한손잡기 사방던지기","좌기 정면타 1교","찌르기 손목뒤집기"],
  2:["좌기 정면타 4교","한손양손잡기 호흡법","좌기 정면타 5교","반신반립 양손잡기 사방던지기","횡면타 5교"]
 } as const;
 for(const grade of [7,5,2] as const)for(const mode of ["balanced","highest"] as const)assert.deepEqual(recommend([grade],5,[],new Set(),mode).map(k=>k.name),singleGradeFixtures[grade]);
});

const specialNames=new Set<string>(Object.values(SPECIAL_KATA_POOLS).flat());
const option=(values:Partial<SpecialKataOptions>):SpecialKataOptions=>({...EMPTY_SPECIAL_KATA_OPTIONS,...values});

test("special options off preserve the exact established recommendation results",()=>{
 for(const grades of [[7],[5],[2],[7,5,3,2]] as const)for(const mode of ["balanced","highest"] as const){
  const direct=recommend([...grades],5,[],new Set(),mode);
  const combined=recommendWithSpecialKatas([...grades],5,[],EMPTY_SPECIAL_KATA_OPTIONS,new Set(),mode);
  assert.deepEqual(combined.map(k=>k.name),direct.map(k=>k.name));
 }
});

test("the manual dan condition reuses first-grade recommendation semantics without selecting the first-grade UI value",()=>{
 const dan=option({twoPerson:true});
 assert.deepEqual(effectiveRecommendationGrades([],dan),[1]);
 assert.deepEqual(effectiveRecommendationGrades([7],dan),[7,1]);
 assert.deepEqual(effectiveRecommendationGrades([7],EMPTY_SPECIAL_KATA_OPTIONS),[7]);
 const weekday=recommendWithSpecialKatas([],5,[],dan),saturday=recommendWithSpecialKatas([],7,[],dan);
 for(const [result,count] of [[weekday,5],[saturday,7]] as const){
  const general=result.filter(k=>!specialNames.has(k.name)),twoPerson=result.filter(k=>SPECIAL_KATA_POOLS.twoPerson.includes(k.name as never));
  assert.equal(result.length,count);
  assert.equal(general.length,count-1);
  assert.equal(twoPerson.length,1);
  assert.deepEqual(general.map(k=>k.name),recommend([1],count-1,[]).map(k=>k.name));
 }
});

test("numeric grades and the manual dan condition combine at first-grade level within fixed slots",()=>{
 const dan=option({twoPerson:true}),withSeven=recommendWithSpecialKatas([7],5,[],dan);
 assert.deepEqual(withSeven.filter(k=>!specialNames.has(k.name)).map(k=>k.name),recommend([7,1],4,[]).map(k=>k.name));
 const cases=[
  {options:dan,general:4,special:1,count:5},
  {options:option({twoPerson:true,swordKnife:true}),general:3,special:2,count:5},
  {options:option({twoPerson:true,staff:true}),general:3,special:2,count:5},
  {options:option({twoPerson:true,swordKnife:true,staff:true}),general:2,special:3,count:5},
  {options:option({twoPerson:true,swordKnife:true,staff:true}),general:4,special:3,count:7}
 ] as const;
 for(const fixture of cases){
  const result=recommendWithSpecialKatas([],fixture.count,[],fixture.options);
  assert.equal(result.length,fixture.count);
  assert.equal(result.filter(k=>specialNames.has(k.name)).length,fixture.special);
  assert.equal(result.filter(k=>!specialNames.has(k.name)).length,fixture.general);
 }
});

test("each special option contributes exactly one kata from its own pool",()=>{
 const cases=[
  {options:option({twoPerson:true}),pool:SPECIAL_KATA_POOLS.twoPerson},
  {options:option({swordKnife:true}),pool:SPECIAL_KATA_POOLS.swordKnife},
  {options:option({staff:true}),pool:SPECIAL_KATA_POOLS.staff}
 ] as const;
 for(const {options,pool} of cases){
  const result=recommendWithSpecialKatas([5],5,[],options);
  const selected=result.filter(k=>specialNames.has(k.name));
  assert.equal(result.length,5);
  assert.equal(selected.length,1);
  assert.ok(pool.includes(selected[0].name as never));
 }
});

test("multiple special options use one slot each within weekday and Saturday totals",()=>{
 const two=option({twoPerson:true,swordKnife:true}),all=option({twoPerson:true,swordKnife:true,staff:true});
 assert.equal(recommendWithSpecialKatas([5],5,[],two).filter(k=>specialNames.has(k.name)).length,2);
 for(const count of [5,7]){
  const result=recommendWithSpecialKatas([5],count,[],all);
  assert.equal(result.length,count);
  assert.equal(result.filter(k=>specialNames.has(k.name)).length,3);
  assert.equal(new Set(result.map(k=>k.id)).size,count);
 }
});

test("special pools avoid recent individual katas deterministically without weapon quotas",()=>{
 const first=KATAS.find(k=>k.name===SPECIAL_KATA_POOLS.swordKnife[0])!;
 const log={status:"완료" as const,recordType:"detailed" as const,session:1011,katas:[first]};
 const selected=recommendSpecialKatas(option({swordKnife:true}),[log]);
 assert.equal(selected[0].name,SPECIAL_KATA_POOLS.swordKnife[1]);
 assert.ok(selected[0].name.startsWith("단도 뺏기 "));
 const repeated=recommendSpecialKatas(option({swordKnife:true}),[log]);
 assert.deepEqual(repeated.map(k=>k.name),selected.map(k=>k.name));
});

test("regeneration avoidance rotates candidates inside each active special pool",()=>{
 const options=option({twoPerson:true,swordKnife:true,staff:true});
 const first=recommendSpecialKatas(options,[]),second=recommendSpecialKatas(options,[],new Set(first.map(k=>k.name)));
 assert.equal(first.length,3);
 assert.equal(second.length,3);
 assert.ok(second.every(k=>!first.some(previous=>previous.name===k.name)));
});
