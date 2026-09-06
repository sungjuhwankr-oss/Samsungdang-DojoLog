import {EXAM_GROUPS,KATAS,highestNumericGrade,type Grade,type Kata,type NumericGrade} from "./data";

export type GradeMode="highest"|"balanced";
export type RecommendationLog={status:"완료"|"취소";recordType?:"detailed"|"sessionOnly";session?:number;katas:Kata[]};

export const TECH_CATEGORY_ORDER=["1교","2교","3교","4교","5교","입신던지기","사방던지기","손목뒤집기","천지던지기","회전던지기","호흡던지기","입기 호흡법","십자던지기","허리던지기","합기떨어뜨리기"];
export const REPRESENTATIVE_KATAS:Record<string,string[]>={
 "1교":["정면타 1교"],"2교":["어깨잡기 2교"],"3교":["뒤양손잡기 3교"],"4교":["좌기 정면타 4교"],"5교":["횡면타 5교"],
 "입신던지기":["정면타 입신던지기"],"사방던지기":["횡면타 사방던지기"],"손목뒤집기":["찌르기 손목뒤집기"],"천지던지기":["양손잡기 천지던지기"],
 "내회전던지기":["엇서한손잡기 내회전던지기"],"외회전던지기":["찌르기 외회전던지기"],
 "호흡던지기":["엇서한손잡기 호흡던지기","한손양손잡기 호흡던지기","뒤양손잡기 호흡던지기"],
 "십자던지기":["한손양손잡기 십자던지기"],"허리던지기":["뒤양손잡기 허리던지기"],"합기떨어뜨리기":["뒤양손잡기 합기떨어뜨리기"]
};

export const UNGRADED_BEGINNER_SAFE_NAMES=[
 "뒤양손잡기 호흡던지기",
 "한손양손잡기 호흡던지기",
 "횡면타 호흡던지기"
] as const;
const UNGRADED_INITIAL_NAMES=new Set(EXAM_GROUPS[9].kata);
const UNGRADED_PREVIEW_NAMES=new Set(EXAM_GROUPS[8].kata);
const UNGRADED_BEGINNER_SAFE_SET=new Set<string>(UNGRADED_BEGINNER_SAFE_NAMES);

// Recommendation-only compatibility shim: these two duplicate exam entries were
// removed from the cumulative exam source, but v0.9.8 numeric/mixed fixtures must
// retain their established recommendation behavior. Exam data and UI still use 8급.
const LEGACY_RECOMMENDATION_GRADE:Partial<Record<string,NumericGrade>>={
 "맞서한손잡기 입신던지기":6,
 "엇서한손잡기 사방던지기":5
};
function recommendationGrade(k:Kata){return LEGACY_RECOMMENDATION_GRADE[k.name]??k.grade}

const DIRECT_RELATIONS=[["1교","입신던지기"],["1교","허리던지기"],["1교","십자던지기"],["2교","사방던지기"],["2교","손목뒤집기"],["2교","내회전던지기"],["2교","외회전던지기"],["3교","허리던지기"]];
const NEAR_RELATIONS=[["1교","4교"],["1교","5교"],["4교","5교"],["2교","5교"],["3교","4교"],["입신던지기","천지던지기"],["입신던지기","손목뒤집기"],["입신던지기","입기 호흡법"],["사방던지기","손목뒤집기"]];

export function categoryOf(k:Kata){if(k.name==="엇서한손잡기 구석던지기")return"호흡던지기";if(k.technique==="내회전던지기"||k.technique==="외회전던지기")return"회전던지기";if(k.technique==="호흡법")return"입기 호흡법";return k.technique}
export function techniqueOrder(k:Kata){const index=TECH_CATEGORY_ORDER.indexOf(categoryOf(k));return index<0?TECH_CATEGORY_ORDER.length:index}
export function isPin(k:Kata){return/^[1-5]교$/.test(k.technique)}
export function recentDetailed<T extends RecommendationLog>(logs:T[]){return logs.filter(log=>log.status==="완료"&&(log.recordType??"detailed")==="detailed"&&typeof log.session==="number").sort((a,b)=>(b.session??0)-(a.session??0)).slice(0,10)}
export type LearningRole="review"|"preview"|"initial";
export function learningRole(kataGrade:NumericGrade|undefined,participant:Grade):LearningRole|null{if(!kataGrade)return null;if(participant==="ungraded")return kataGrade===9?"initial":null;if(kataGrade>=participant)return"review";if(participant>1&&kataGrade===participant-1)return"preview";return null}
export function isUngradedOnly(grades:Grade[]){return grades.length>0&&grades.every(grade=>grade==="ungraded")}
export function ungradedLearningStage(k:Kata):"initial"|"preview"|"beginnerSafe"|null{if(UNGRADED_INITIAL_NAMES.has(k.name))return"initial";if(UNGRADED_PREVIEW_NAMES.has(k.name))return"preview";if(UNGRADED_BEGINNER_SAFE_SET.has(k.name))return"beginnerSafe";return null}

function techniqueKey(k:Kata){return k.technique==="호흡법"?"입기 호흡법":k.technique}
function related(a:string,b:string,pairs:string[][]){return pairs.some(pair=>pair.includes(a)&&pair.includes(b))}
function isRepresentative(k:Kata){return(REPRESENTATIVE_KATAS[techniqueKey(k)]??[]).includes(k.name)}
function alternateOrder(items:Kata[],pinTarget:number,otherTarget:number){
 const pools={pin:items.filter(isPin),other:items.filter(k=>!isPin(k))},result:Kata[]=[];
 let family:"pin"|"other"=pinTarget>=otherTarget?"pin":"other";
 while(result.length<items.length){
  let pool=pools[family];if(!pool.length){family=family==="pin"?"other":"pin";pool=pools[family]}if(!pool.length)break;
  const ranked=pool.map((kata,index)=>{const key=techniqueKey(kata),previous=result.at(-1),twoBack=result.at(-2);let relation=0;if(previous&&related(key,techniqueKey(previous),DIRECT_RELATIONS))relation+=20;if(twoBack&&related(key,techniqueKey(twoBack),NEAR_RELATIONS))relation+=9;return{kata,index,relation}}).sort((a,b)=>b.relation-a.relation||a.index-b.index);
  const chosen=ranked[0];result.push(chosen.kata);pool.splice(chosen.index,1);family=family==="pin"?"other":"pin";
 }
 return result;
}

export function recommend(grades:Grade[],count:number,logs:RecommendationLog[],avoidNames=new Set<string>(),mode:GradeMode="balanced"):Kata[]{
 if(!grades.length)return[];
 const ungradedOnly=isUngradedOnly(grades),highest=highestNumericGrade(grades),focusGrade=highest??9,recentLogs=recentDetailed(logs),recentKatas=recentLogs.flatMap(log=>log.katas),recentNames=recentKatas.map(k=>k.name);
 const selected=[...grades].sort((a,b)=>a==="ungraded"?-1:b==="ungraded"?1:a-b),participantWeight=(grade:Grade)=>selected.length===1?1:mode==="highest"?(grade===highest?2.5:0.65):1;
 const roleFor=(k:Kata,grade:Grade)=>learningRole(ungradedOnly?k.grade:recommendationGrade(k),grade);
 const history=new Map(selected.map(grade=>[grade,{review:recentKatas.filter(k=>roleFor(k,grade)==="review").length,preview:recentKatas.filter(k=>roleFor(k,grade)==="preview").length,initial:recentKatas.filter(k=>roleFor(k,grade)==="initial").length}]));
 const previewCeiling=highest===undefined?1:highest>1?highest-1:1;
 const candidates=KATAS.filter(k=>{
  const grade=ungradedOnly?k.grade:recommendationGrade(k);
  return(k.area==="일반 체술"||k.area==="호흡력")&&k.name!=="좌기 호흡법"&&k.name!=="엇서한손잡기 구석던지기"&&k.name!=="맞서한손잡기에서 바로 넣는 2교"&&k.hombu&&(ungradedOnly?ungradedLearningStage(k)!==null:(!grade||grade>=previewCeiling));
 }).map(k=>{
  const grade=ungradedOnly?k.grade:recommendationGrade(k);
  return{k,base:30+(k.exam?20:0)+(grade===focusGrade?16:0)+(k.form!=="입기"?14:0)-recentNames.filter(name=>name===k.name).length*18+(k.links.length?2:0)+(ungradedOnly?(ungradedLearningStage(k)==="initial"?24:ungradedLearningStage(k)==="preview"?10:0):0)};
 });
 const baseSort=(a:{k:Kata;base:number},b:{k:Kata;base:number})=>b.base-a.base||Number(isRepresentative(b.k))-Number(isRepresentative(a.k))||techniqueOrder(a.k)-techniqueOrder(b.k)||a.k.name.localeCompare(b.k.name,"ko");
 candidates.sort(baseSort);
 if(count===1)return candidates.length?[candidates[0].k]:[];
 const half=Math.floor(count/2),recentPin=recentKatas.filter(isPin).length,recentOther=recentKatas.length-recentPin;
 let pinTarget=half,otherTarget=half;
 if(count%2){if(recentPin<recentOther)pinTarget++;else if(recentOther<recentPin)otherTarget++;else{const firstPin=candidates.find(x=>isPin(x.k)),firstOther=candidates.find(x=>!isPin(x.k));if((firstPin?.base??-Infinity)>=(firstOther?.base??-Infinity))pinTarget++;else otherTarget++}}
 const out:Kata[]=[],planCoverage=new Map(selected.map(grade=>[grade,{review:0,preview:0,initial:0}]));
 const diversityLimit=ungradedOnly?3:2,canAdd=(k:Kata)=>out.filter(item=>item.technique===k.technique).length<diversityLimit&&out.filter(item=>item.attack===k.attack).length<diversityLimit;
 const coverageGain=(k:Kata)=>selected.reduce((sum,grade)=>{const role=roleFor(k,grade);if(!role)return sum;const recent=history.get(grade)![role],planned=planCoverage.get(grade)![role],priority=role==="preview"?6:12;return sum+participantWeight(grade)*priority*(1+1/(1+recent))/(1+planned)},0);
 const relationGain=(k:Kata)=>out.reduce((sum,item)=>sum+(related(techniqueKey(k),techniqueKey(item),DIRECT_RELATIONS)?2:0)+(related(techniqueKey(k),techniqueKey(item),NEAR_RELATIONS)?1:0),0);
 const choose=(pool:typeof candidates,observeTargets:boolean)=>{
  const valid=pool.filter(x=>!out.some(k=>k.id===x.k.id)&&canAdd(x.k)&&(!observeTargets||(isPin(x.k)?out.filter(isPin).length<pinTarget:out.filter(k=>!isPin(k)).length<otherTarget)));
  valid.sort((a,b)=>(b.base+coverageGain(b.k)+relationGain(b.k))-(a.base+coverageGain(a.k)+relationGain(a.k))||Number(isRepresentative(b.k))-Number(isRepresentative(a.k))||baseSort(a,b));
  return valid[0];
 };
 const preferred=candidates.filter(x=>!avoidNames.has(x.k.name)),avoided=candidates.filter(x=>avoidNames.has(x.k.name));
 for(const pool of [preferred,avoided])while(out.length<count){const next=choose(pool,true);if(!next)break;out.push(next.k);for(const grade of selected){const role=roleFor(next.k,grade);if(role)planCoverage.get(grade)![role]++}}
 for(const pool of [preferred,avoided])while(out.length<count){const next=choose(pool,false);if(!next)break;out.push(next.k);for(const grade of selected){const role=roleFor(next.k,grade);if(role)planCoverage.get(grade)![role]++}}
 if(!ungradedOnly&&out.length<count){const directEntry=KATAS.find(k=>k.name==="맞서한손잡기에서 바로 넣는 2교");if(directEntry&&directEntry.hombu&&canAdd(directEntry))out.push(directEntry)}
 const actualPin=out.filter(isPin).length,actualOther=out.length-actualPin;
 return alternateOrder(out.slice(0,count),actualPin,actualOther);
}
