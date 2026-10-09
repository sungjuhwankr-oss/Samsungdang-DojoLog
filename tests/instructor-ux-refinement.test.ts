import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {KATAS} from '../app/data';
import {filterJournal} from '../app/journal-view';
import {basicReplacementGroups,orderHombuKatas} from '../app/kata-presentation';
import {newPlannerDraft,dateInputValue,confirmDraftReset} from '../app/planner-draft';
import {PICKER_KATAS,AWASE_BUNDLES,expandPlan,collapsePlan,selectionUnit} from '../app/plan-units';
import {scrollDocument,scrollNavigationState} from '../app/scroll-navigation';
import type {DojoLog} from '../app/backup';

const record=(id:string,date:string,note:string):DojoLog=>({id,date,note,session:1011,status:'완료',recordType:'detailed',participants:[7],katas:[KATAS[0]],createdAt:`${date}T00:00:00Z`});
const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');

test('memo projection filters whitespace and sorts by lesson date rather than insertion/session',()=>{
  const records=[record('old','2026-09-30','과거 메모'),record('blank','2026-10-08',' \n '),{...record('new','2026-10-07','최근 메모'),session:1010},record('same','2026-10-07','동일일 메모')];
  const before=structuredClone(records);
  assert.deepEqual(filterJournal(records,'memo','').map(item=>item.id),['new','same','old']);
  assert.equal(filterJournal(records,'memo','')[0],records[2]);
  assert.equal(filterJournal(records,'all',''),records);
  assert.deepEqual(filterJournal(records,'search','메모').map(item=>item.id),['old','new','same']);
  assert.deepEqual(records,before);
  assert.match(page,/journalMode==="all"&&<button className="session-order-button"/);
  assert.match(page,/journalMode==="all"&&sessionOrder&&/);
});

test('confirmed reset creates all fresh draft fields once and never changes saved journals',()=>{
  const saved={logs:[record('saved','2026-10-06','보존')],lastSession:1011};
  const before=structuredClone(saved);
  let draft={...newPlannerDraft(new Date(2026,9,3)),participants:[7] as ReturnType<typeof newPlannerDraft>['participants'],note:'삭제 대상'};
  let confirmations=0,resets=0;
  confirmDraftReset(message=>{confirmations++;for(const text of ['오늘','참가 급수','모든 구성 조건','제시된 카타','수동 편집한 카타','수업 메모'])assert.ok(message.includes(text));return true},()=>{resets++;draft=newPlannerDraft(new Date(2026,9,7))});
  assert.equal(confirmations,1);assert.equal(resets,1);
  assert.deepEqual(draft,{
    date:'2026-10-07',participants:[],gradeMode:'balanced',specialOptions:{twoPerson:false,swordKnife:false,staff:false},
    generatedParticipants:null,generatedSpecialOptions:null,count:5,countAdjusted:false,plan:[],planDirty:false,
    suggestionHistory:[],showRegenerateConfirm:false,note:'',editingId:null,showAdd:false,addChoice:PICKER_KATAS[0].id,customName:'',draggingPlan:null
  });
  assert.deepEqual(saved,before);
  const another=newPlannerDraft(new Date(2026,9,7));assert.notEqual(draft.plan,another.plan);assert.notEqual(draft.specialOptions,another.specialOptions);
});

test('cancelled reset makes zero mutations and today is evaluated at reset time',()=>{
  const draft={...newPlannerDraft(new Date(2026,9,6)),note:'유지',plan:[selectionUnit(AWASE_BUNDLES[0].id)!]};
  const before=structuredClone(draft);
  confirmDraftReset(()=>false,()=>{throw new Error('cancel must not call reset')});
  assert.deepEqual(draft,before);
  assert.equal(dateInputValue(new Date(2026,9,6,23,59)),'2026-10-06');
  assert.equal(newPlannerDraft(new Date(2026,9,7,0,1)).date,'2026-10-07');
  assert.equal(newPlannerDraft(new Date(2026,9,10)).count,7);
});

test('Home reset applies every draft field and preserves edit cancellation and journal storage',()=>{
  const reset=page.slice(page.indexOf('function resetEditor()'),page.indexOf('function save('));
  for(const field of Object.keys(newPlannerDraft())){
    const setter=`set${field[0].toUpperCase()}${field.slice(1)}(draft.${field})`;
    assert.ok(reset.includes(setter),`missing full reset: ${field}`);
  }
  assert.doesNotMatch(reset,/setLogs|setLastSession|localStorage|sessionStorage/);
  assert.match(page,/!editingId&&<DraftResetButton onReset=\{resetEditor\}\/>/);
  assert.match(page,/<button className="ghost" onClick=\{resetEditor\}><X\/>수정 취소<\/button>/);
});

test('replacement technical group order is exact and each group follows existing Hombu presentation',()=>{
  const before=structuredClone(KATAS),pickerBefore=structuredClone(PICKER_KATAS);
  const groups=basicReplacementGroups(PICKER_KATAS);
  assert.deepEqual(groups.map(group=>group.label),['1교','2교','3교','4교','5교','입신던지기','사방던지기','손목뒤집기','천지던지기','회전던지기','호흡던지기','입기 호흡법','십자던지기','허리던지기','합기떨어뜨리기']);
  for(const group of groups){
    assert.deepEqual(group.katas.map(k=>k.id),orderHombuKatas(KATAS.filter(k=>k.categoryId==='taijutsu')).filter(k=>group.katas.some(candidate=>candidate.id===k.id)).map(k=>k.id));
    assert.deepEqual(group.katas.map(k=>k.name),group.katas.map(k=>k.name).sort((a,b)=>a.localeCompare(b,'ko')));
  }
  assert.deepEqual(groups.find(group=>group.label==='회전던지기')!.katas.map(k=>k.id),['뒤양손잡기-내회전던지기','엇서한손잡기-내회전던지기','엇서한손잡기-외회전던지기','정면타-외회전던지기','찌르기-외회전던지기']);
  assert.deepEqual(KATAS,before);assert.deepEqual(PICKER_KATAS,pickerBefore);
  assert.deepEqual(groups.flatMap(g=>g.katas.map(k=>k.id)).sort(),KATAS.filter(k=>k.categoryId==='taijutsu').map(k=>k.id).sort());
  assert.match(page,/curriculum=orderHombuKatas/);assert.match(page,/<KataOptions current=\{kata\} replacement\/>/);
});

test('presentation sorting cannot reorder a selected lesson or change selection-unit/save expansion',()=>{
  const plan=[selectionUnit(KATAS[4].id)!,selectionUnit(AWASE_BUNDLES[1].id)!,selectionUnit(KATAS[0].id)!,selectionUnit(AWASE_BUNDLES[0].id)!];
  const before=structuredClone(plan),flat=expandPlan(plan);
  basicReplacementGroups(PICKER_KATAS);orderHombuKatas(KATAS);
  assert.deepEqual(plan,before);assert.deepEqual(expandPlan(plan),flat);assert.deepEqual(collapsePlan(flat),before);
  assert.deepEqual(flat.map(k=>k.id),[KATAS[4].id,...AWASE_BUNDLES[1].canonicalIds,KATAS[0].id,...AWASE_BUNDLES[0].canonicalIds]);
});

test('short/long scroll controls switch only at top, middle and bottom',()=>{
  for(const height of [500,800,808])assert.deepEqual(scrollNavigationState(height,800,0),{top:false,bottom:false});
  assert.deepEqual(scrollNavigationState(2400,800,0),{top:false,bottom:true});
  assert.deepEqual(scrollNavigationState(2400,800,700),{top:true,bottom:true});
  assert.deepEqual(scrollNavigationState(2400,800,1600),{top:true,bottom:false});
  assert.deepEqual(scrollNavigationState(2400,800,-50),{top:false,bottom:true});
  assert.deepEqual(scrollNavigationState(2400,800,1700),{top:true,bottom:false});
});

test('scroll commands preserve input/draft/route/storage state and request smooth top/bottom only',()=>{
  const state={input:'작성 중',draft:{note:'보존',date:'2026-10-07',plan:[AWASE_BUNDLES[0]]},route:'/credential-issuer',storage:[record('saved','2026-10-07','메모')]};
  const before=structuredClone(state),calls:ScrollToOptions[]=[];
  const host={scrollTo:(options:ScrollToOptions)=>calls.push(options)};
  scrollDocument(host,'bottom',2400);scrollDocument(host,'top',2400);
  assert.deepEqual(calls,[{top:2400,behavior:'smooth'},{top:0,behavior:'smooth'}]);assert.deepEqual(state,before);
  const component=readFileSync(new URL('../app/scroll-controls.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(component,/localStorage|sessionStorage|location|setPlan|setDate|setLogs|setTab|\.focus\(/);
  assert.match(component,/ResizeObserver/);assert.match(component,/MutationObserver/);
  assert.match(page,/label="목차 ↑"/);
});
