import {type Grade} from './data';
import {type PlanUnit,PICKER_KATAS} from './plan-units';
import {EMPTY_SPECIAL_KATA_OPTIONS,type GradeMode,type SpecialKataOptions} from './recommendation';

export function dateInputValue(date=new Date()){
  const year=date.getFullYear(),month=String(date.getMonth()+1).padStart(2,'0'),day=String(date.getDate()).padStart(2,'0');
  return `${year}-${month}-${day}`;
}
export function defaultKataCount(date:string){return new Date(`${date}T12:00:00`).getDay()===6?7:5}
export function newPlannerDraft(now=new Date()){
  const date=dateInputValue(now);
  return {
    date,participants:[] as Grade[],gradeMode:'balanced' as GradeMode,
    specialOptions:{...EMPTY_SPECIAL_KATA_OPTIONS} as SpecialKataOptions,
    generatedParticipants:null as Grade[]|null,generatedSpecialOptions:null as SpecialKataOptions|null,
    count:defaultKataCount(date),countAdjusted:false,plan:[] as PlanUnit[],planDirty:false,
    suggestionHistory:[] as string[][],showRegenerateConfirm:false,note:'',editingId:null as string|null,
    showAdd:false,addChoice:PICKER_KATAS[0]?.id??'',customName:'',draggingPlan:null as number|null
  };
}
export const DRAFT_RESET_CONFIRMATION='새 수업구성을 초기화할까요?\n수업일을 오늘로 되돌리고, 참가 급수와 모든 구성 조건을 초기화합니다.\n제시된 카타와 수동 편집한 카타, 수업 메모를 삭제합니다.\n저장된 수업일지는 변경하지 않습니다.';
export function confirmDraftReset(confirm:(message:string)=>boolean,reset:()=>void){
  if(confirm(DRAFT_RESET_CONFIRMATION))reset();
}
