import catalog from "../reference/kata-catalog.v2.json";
import baseline from "../reference/kata-catalog.v1.json";

export type CategoryId="taijutsu"|"tanto"|"ken"|"jo"|"multi-other";
export type ExamEntry={track:"kyu";grade:NumericGrade}|{track:"dan"};
export const CATALOG_CATEGORIES: {id:CategoryId;label:string}[]=[{id:"taijutsu",label:"기본 체술"},{id:"tanto",label:"단도"},{id:"ken",label:"검"},{id:"jo",label:"장"},{id:"multi-other",label:"다인·기타"}];

export type NumericGrade = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type Grade = NumericGrade | "ungraded";
export type VideoLink = { label?: string; url: string };
export type Kata = { id:string; name:string; form:"입기"|"좌기"|"반신반립"; attack:string; technique:string; grade?:NumericGrade; hombu:boolean; exam:boolean; area:"일반 체술"|"호흡력"|"다인 잡기"|"무기 잡기"; links:VideoLink[]; categoryId?:CategoryId; examEntries?:ExamEntry[] };

export const GRADES:NumericGrade[]=[9,8,7,6,5,4,3,2,1];
export const PARTICIPANT_GRADES:Grade[]=["ungraded",...GRADES];
export function formatGrade(grade:Grade){return grade==="ungraded"?"무급":`${grade}급`}
export function gradeProgressionOrder(grade:Grade){return grade==="ungraded"?0:10-grade}
export function sortGrades(grades:Grade[]){return [...grades].sort((a,b)=>gradeProgressionOrder(a)-gradeProgressionOrder(b))}
export function highestNumericGrade(grades:Grade[]):NumericGrade|undefined{return grades.reduce<NumericGrade|undefined>((highest,grade)=>grade==="ungraded"?highest:highest===undefined||grade<highest?grade:highest,undefined)}

export const EXAM_GROUPS: Record<NumericGrade,{sessions:number;focus:string;basics?:string[];kata:string[]}> = {
  9:{sessions:10,focus:"구석던지기·호흡던지기",basics:["후방낙법","측방회전낙법","전방회전낙법","반신(좌·우)","맞서기·엇서기","입신·전환·회전·전회","전환법"],kata:["엇서한손잡기 구석던지기","엇서한손잡기 호흡던지기"]},
  8:{sessions:10,focus:"기초 체술",basics:["무릎걸음","좌기 호흡법"],kata:["맞서한손잡기 입신던지기","맞서한손잡기 손목뒤집기","맞서한손잡기 1교","엇서한손잡기 사방던지기"]},
  7:{sessions:20,focus:"1교",kata:["정면타 1교","어깨잡기 1교","횡면타 1교","뒤양손잡기 1교","좌기 정면타 1교"]},
  6:{sessions:20,focus:"입신던지기·천지던지기",kata:["정면타 입신던지기","횡면타 입신던지기","찌르기 입신던지기","엇서한손잡기 입신던지기","양손잡기 입신던지기","한손양손잡기 입신던지기","뒤양손잡기 입신던지기","양손잡기 천지던지기"]},
  5:{sessions:20,focus:"사방던지기·손목뒤집기",kata:["횡면타 사방던지기","양손잡기 사방던지기","뒤양손잡기 사방던지기","반신반립 엇서한손잡기 사방던지기","반신반립 양손잡기 사방던지기","찌르기 손목뒤집기","엇서한손잡기 손목뒤집기","정면타 손목뒤집기","횡면타 손목뒤집기","한손양손잡기 손목뒤집기","뒤양손잡기 손목뒤집기"]},
  4:{sessions:30,focus:"2교·외회전던지기",kata:["엇서한손잡기 2교","맞서한손잡기 2교","어깨잡기 2교","한손양손잡기 2교","좌기 정면타 2교","엇서한손잡기 외회전던지기","정면타 외회전던지기","찌르기 외회전던지기"]},
  3:{sessions:30,focus:"3교·내회전던지기",kata:["정면타 3교","횡면타 3교","엇서한손잡기 3교","뒤양손잡기 3교","엇서한손잡기 내회전던지기","뒤양손잡기 내회전던지기"]},
  2:{sessions:40,focus:"4교·5교·호흡법",kata:["횡면타 4교","어깨잡기 4교","양손잡기 4교","뒤양손잡기 4교","좌기 정면타 4교","횡면타 5교","좌기 정면타 5교","한손양손잡기 호흡법"]},
  1:{sessions:40,focus:"허리던지기·합기떨어뜨리기·십자던지기",kata:["뒤양손잡기 허리던지기","양손잡기 허리던지기","양어깨잡기 합기떨어뜨리기","뒤양손잡기 합기떨어뜨리기","한손양손잡기 십자던지기","뒤양손잡기 십자던지기","뒤양어깨잡기 십자던지기"]}
};

// Legacy scalar fields adapt existing consumers; canonical exam truth is examEntries.
export const KATAS:Kata[]=catalog.kata.map(item=>{
 const examEntries=item.examEntries as ExamEntry[],kyu=examEntries.find(entry=>entry.track==="kyu");
 return {id:item.id,name:item.nameKo,form:item.form as Kata["form"],attack:item.attack,technique:item.technique,
  area:item.area as Kata["area"],hombu:item.hombu,exam:examEntries.length>0,grade:kyu?.grade,
  categoryId:item.categoryId as CategoryId,examEntries,links:item.links};
});
const byId=new Map(KATAS.map(k=>[k.id,k]));
export function currentKata(id:string){return byId.get(id)}
export function examBadge(id:string):string|null{
 const entries=currentKata(id)?.examEntries??[],kyu=entries.filter(e=>e.track==="kyu");
 if(kyu.length>1)throw new Error("복수 급수 배정은 계약 확정이 필요합니다.");
 return kyu.length?`${kyu[0].grade}급`:entries.some(e=>e.track==="dan")?"유단자용":null;
}
export function currentKataPresentation(snapshot:Kata):Kata{
 const current=currentKata(snapshot.id);
 return {...snapshot,grade:current?.grade,exam:current?.exam??false,examEntries:current?.examEntries??[],links:current?.links??[]};
}
// Preserve the Phase 4J pool/order and video scoring signal independently of V2 links.
export const RECOMMENDATION_KATAS=baseline.kata.map(k=>byId.get(k.id)!);
const baselineVideos=new Set(baseline.kata.filter(k=>k.links.length>0).map(k=>k.id));
export function recommendationHasVideo(kata:Kata){return baselineVideos.has(kata.id)}
export function bandText(date:string,session:number,katas:Kata[]){const d=new Date(`${date}T00:00:00`);const ds=`${String(d.getFullYear()).slice(2)}. ${d.getMonth()+1}. ${d.getDate()}.`;const entries=katas.map(k=>{if(!k.links.length)return`○ ${k.name}`;if(k.links.length===1&&!k.links[0].label)return`○ ${k.name} ${k.links[0].url}`;return`○ ${k.name}\n${k.links.map(l=>`(${l.label??"영상"}) ${l.url}`).join("\n")}`});return`【 #수업일지 】 ${ds}(${session}차)\n\n${entries.join("\n\n")}`}
