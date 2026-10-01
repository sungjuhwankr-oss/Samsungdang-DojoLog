import {KATAS,currentKata,type Kata} from './data';

export type PlanUnit =
  | {kind:'single'; canonicalIds:[string]; snapshot:Kata}
  | {kind:'bundle'; id:'ken-awase-1-7'|'jo-awase-1-8'; canonicalIds:string[]};
export const AWASE_BUNDLES: Extract<PlanUnit,{kind:'bundle'}>[] = [
  {kind:'bundle',id:'ken-awase-1-7',canonicalIds:Array.from({length:7},(_,i)=>`검-아와세-${i+1}번`)},
  {kind:'bundle',id:'jo-awase-1-8',canonicalIds:Array.from({length:8},(_,i)=>`장-아와세-${i+1}번`)},
];
export function singleUnit(kata:Kata):PlanUnit{return {kind:'single',canonicalIds:[kata.id],snapshot:kata}}
export function unitKata(unit:PlanUnit):Kata{
  if(unit.kind==='single')return unit.snapshot;
  const kata=currentKata(unit.canonicalIds[0])!;
  return {...kata,id:unit.id,name:unit.id==='ken-awase-1-7'?'검 아와세 1~7번':'장 아와세 1~8번',grade:undefined,exam:false,examEntries:[],links:[]};
}
export function expandPlan(units:PlanUnit[]):Kata[]{
  return units.flatMap(unit=>unit.kind==='single'?[unit.snapshot]:unit.canonicalIds.map(id=>{
    const kata=currentKata(id);
    if(!kata)throw new Error(`등록되지 않은 카타: ${id}`);
    return kata;
  }));
}
export function collapsePlan(katas:Kata[]):PlanUnit[]{
  const units:PlanUnit[]=[];
  for(let index=0;index<katas.length;){
    const bundle=AWASE_BUNDLES.find(candidate=>candidate.canonicalIds.every((id,offset)=>katas[index+offset]?.id===id));
    if(bundle){units.push({...bundle,canonicalIds:[...bundle.canonicalIds]});index+=bundle.canonicalIds.length}
    else{units.push(singleUnit(katas[index]));index++}
  }
  return units;
}
export function selectionUnit(id:string):PlanUnit|undefined{
  const bundle=AWASE_BUNDLES.find(unit=>unit.id===id);
  if(bundle)return {...bundle,canonicalIds:[...bundle.canonicalIds]};
  const kata=currentKata(id);return kata?singleUnit(kata):undefined;
}
export function hasOverlappingIds(units:PlanUnit[]){
  const ids=units.flatMap(unit=>unit.canonicalIds);return new Set(ids).size!==ids.length;
}
export const PICKER_KATAS:Kata[]=[...KATAS,...AWASE_BUNDLES.map(unitKata)];
