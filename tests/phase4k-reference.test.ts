import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {KATAS,currentKata,currentKataPresentation,examBadge,bandText,type Grade} from '../app/data';
import {AWASE_BUNDLES,collapsePlan,expandPlan,selectionUnit,singleUnit,hasOverlappingIds} from '../app/plan-units';
import {filterJournal} from '../app/journal-view';
import {recommendWithSpecialKatas,type GradeMode,type SpecialKataOptions} from '../app/recommendation';
import {createBandShareText,createImportLink,createSessionSharePayload} from '../app/session-share';
import {serializeBackup,parseBackupText,type DojoLog} from '../app/backup';

const json=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
const catalog=json('../reference/kata-catalog.v2.json');
const baseline=json('../reference/kata-catalog.v1.json');
const log=(katas=KATAS.slice(0,5)):DojoLog=>({id:'original-log',date:'2026-10-02',session:1043,status:'완료',recordType:'detailed',participants:[7],katas,note:'회원별 보완 메모',createdAt:'2026-10-02T00:00:00.000Z'});

test('canonical v2 preserves all 77 identities and has exact exam/video counts',()=>{
 assert.equal(catalog.catalogVersion,2);
 assert.equal(KATAS.length,97);assert.equal(new Set(KATAS.map(k=>k.id)).size,97);
 assert.deepEqual(KATAS.slice(0,77).map(k=>[k.id,k.name]),baseline.kata.map((k:{id:string;nameKo:string})=>[k.id,k.nameKo]));
 assert.equal(KATAS.filter(k=>k.examEntries?.length).length,79);
 assert.equal(KATAS.filter(k=>k.examEntries?.some(e=>e.track==='kyu')).length,77);
 assert.equal(KATAS.filter(k=>k.examEntries?.some(e=>e.track==='dan')).length,2);
 assert.equal(KATAS.filter(k=>k.links.length).length,79);
 assert.equal(KATAS.reduce((n,k)=>n+k.links.length,0),113);
});
test('authoritative V2 names/labels/URLs are exact, no fuzzy mapping',()=>{
 const rows=readFileSync(new URL('../reference/sources/hombu-video-links.v2.txt',import.meta.url),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>l&&!l.startsWith('#'));
 const expected=new Map<string, {label?:string;url:string}[]>();
 for(const row of rows){const parts=row.split('|');expected.set(parts[0],[...(expected.get(parts[0])??[]),parts.length===3?{label:parts[1],url:parts[2]}:{url:parts[1]}])}
 assert.equal(rows.length,108);assert.equal(expected.size,74);
 for(const [name,links] of expected){const k=KATAS.find(k=>k.name===name);assert.ok(k);assert.deepEqual(k.links,links)}
 assert.equal(KATAS.slice(0,77).filter(k=>k.links.length).length,74);
});
test('weapon identities and exact grade assignment are numbered, dan-only has no scalar grade',()=>{
 const expected=[['사방베기',6],...[4,3,2,2,1,1,1].map((g,i)=>[`검 아와세 ${i+1}번`,g]),['6의 장',5],['8의 장',4],...[2,2,2,2,1,1,1,1].map((g,i)=>[`장 아와세 ${i+1}번`,g]),['13의 장',null],['31의 장',null]];
 for(const [name,grade] of expected){const id=String(name).replace(/\s/g,'-'),kata=currentKata(id);assert.ok(kata);assert.equal(kata.name,name);assert.equal(examBadge(id),grade===null?'유단자용':`${grade}급`);if(grade===null)assert.equal(kata.grade,undefined)}
 for(const bundle of AWASE_BUNDLES)for(const id of bundle.canonicalIds)assert.deepEqual(currentKata(id)?.links,[]);
 assert.equal(new Set(KATAS.map(k=>k.categoryId)).size,5);
});
test('bundle planner counts one unit, saves/shares flat canonical IDs, round trips Backup v1',()=>{
 for(const bundle of AWASE_BUNDLES){
  const plan=[selectionUnit(bundle.id)!];assert.equal(plan.length,1);
  const flat=expandPlan(plan);assert.deepEqual(flat.map(k=>k.id),bundle.canonicalIds);
  assert.deepEqual(collapsePlan(flat),plan);
  const record={...log(flat),session:1011},payload=createSessionSharePayload(record);
  assert.equal(payload.version,1);assert.deepEqual(payload.kata.map(k=>k.id),bundle.canonicalIds);
  const backup=parseBackupText(serializeBackup({logs:[record],lastSession:1011},'0.9.9'));
  assert.deepEqual(backup.state.logs[0].katas,flat);
 }
});
test('collapse requires a complete contiguous ordered block and preserves custom snapshots',()=>{
 for(const bundle of AWASE_BUNDLES){const flat=expandPlan([bundle]);assert.equal(collapsePlan(flat.slice(1)).length,flat.length-1);assert.equal(collapsePlan([...flat].reverse()).length,flat.length);assert.equal(collapsePlan([flat[0],KATAS[0],...flat.slice(1)]).length,flat.length+1)}
 const custom={...KATAS[0],id:'custom-unknown',name:'검 아와세 1번'};
 assert.deepEqual(expandPlan(collapsePlan([custom])),[custom]);
 assert.equal(hasOverlappingIds([AWASE_BUNDLES[0],singleUnit(currentKata('검-아와세-1번')!)]),true);
});
test('current ID lookup overrides stale grade/video, unknown/custom receive no fabricated metadata',()=>{
 const stale={...currentKata('맞서한손잡기-손목뒤집기')!,grade:1 as const,links:[{url:'https://youtu.be/stale'}]};
 const before=structuredClone(stale),current=currentKataPresentation(stale);
 assert.equal(examBadge(stale.id),'8급');assert.equal(current.grade,8);assert.equal(current.links[0].url,'https://youtu.be/9fULsFpH3oE?t=799s');assert.deepEqual(stale,before);
 for(const id of ['custom-unknown','unknown']){const unknown=currentKataPresentation({...stale,id});assert.equal(examBadge(id),null);assert.equal(unknown.grade,undefined);assert.equal(unknown.exam,false);assert.deepEqual(unknown.links,[])}
 assert.equal(examBadge('좌기-호흡법'),null);
});
test('journal memo/search use the original note and original log identity without mutation',()=>{
 const records=[log(),{...log(),id:'blank',note:'  \n '},{...log(),id:'other',note:'다른 내용'}],before=structuredClone(records);
 assert.deepEqual(filterJournal(records,'all',''),records);
 assert.deepEqual(filterJournal(records,'memo','').map(l=>l.id),['original-log','other']);
 assert.equal(filterJournal(records,'search','보완')[0],records[0]);
 assert.equal(filterJournal(records,'search','').length,0);assert.deepEqual(records,before);
});
test('all 768 Phase 4J recommendation name sequences stay exact',()=>{
 const cases=json('./fixtures/recommendation-phase4j.json') as {grades:Grade[];count:number;mode:GradeMode;options:SpecialKataOptions;initial:string[];recent:string[];regenerated:string[]}[];
 assert.equal(cases.length,256);
 for(const c of cases){const initial=recommendWithSpecialKatas(c.grades,c.count,[],c.options,new Set(),c.mode),logs=[{status:'완료' as const,session:1042,katas:initial}];assert.deepEqual(initial.map(k=>k.name),c.initial);assert.deepEqual(recommendWithSpecialKatas(c.grades,c.count,logs,c.options,new Set(),c.mode).map(k=>k.name),c.recent);assert.deepEqual(recommendWithSpecialKatas(c.grades,c.count,logs,c.options,new Set(c.initial),c.mode).map(k=>k.name),c.regenerated);assert.ok(initial.every(k=>baseline.kata.some((old:{id:string})=>old.id===k.id)))}
});
test('BAND formatter byte regression and old snapshots get current authoritative links',()=>{
 for(const fixture of json('./fixtures/band-body-phase4j.json'))assert.equal(bandText('2026-10-02',1043,fixture.katas),fixture.body);
 const stale=log([{...currentKata('맞서한손잡기-손목뒤집기')!,links:[]}]);
 const link=createImportLink(createSessionSharePayload(stale));
 const text=createBandShareText(stale,link);
 assert.ok(text.startsWith('【 #수업일지 】'));assert.ok(text.includes('https://youtu.be/9fULsFpH3oE?t=799s'));
 assert.ok(text.endsWith(`[회원용 DojoLog 수련기록 가져오기]\n${link}`));
});
test('beginner source pairs retain titles, symbols, numbering, URLs, and order exactly',()=>{
 const lines=readFileSync(new URL('../reference/sources/beginner-videos.txt',import.meta.url),'utf8').replace(/\r\n/g,'\n').split('\n').filter(l=>l!=='');
 const library=json('../reference/beginner-videos.v1.json');assert.equal(library.videos.length,53);
 assert.deepEqual(library.videos.flatMap((v:{title:string;url:string})=>[v.title,v.url]),lines);
});
