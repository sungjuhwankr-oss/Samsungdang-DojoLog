import {currentKataPresentation,examBadge,type Kata} from './data';
import {videoActions} from './video-links';
import type {DojoLog} from './backup';

export type JournalMode='all'|'memo'|'search';
export type AnalysisExamItem={label:string|null;detail:string;direct:boolean;foundation:boolean};
export function analysisExamItem(id:string):AnalysisExamItem{
  const label=examBadge(id);
  return {label,detail:label?`${label} 심사 직접 대응`:'삼성당 심사표 외',direct:label!==null,foundation:label==='9급'||label==='8급'};
}
export function analysisExamSummary(katas:readonly Pick<Kata,'id'>[]){
  const items=katas.map(kata=>analysisExamItem(kata.id));
  return {items,directCount:items.filter(item=>item.direct).length,hasFoundation:items.some(item=>item.foundation)};
}
export function filterJournal(logs:DojoLog[],mode:JournalMode,query:string):DojoLog[]{
  if(mode==='all')return logs;
  if(mode==='memo')return logs.filter(log=>log.note.trim().length>0).sort((a,b)=>b.date.localeCompare(a.date));
  if(!query.trim())return [];
  return logs.filter(log=>log.note.includes(query));
}
export function JournalMemoCard({log,onOriginal}:{log:DojoLog;onOriginal:(id:string)=>void}){
  return <article className="panel journal-memo-card">
    <h3>{log.date} {log.session?`· ${log.session}차`:'· 회차 미반영'}</h3>
    <p className="note">{log.note}</p>
    <button type="button" className="ghost original-log-button" onClick={()=>onOriginal(log.id)}>원본 수업일지 보기</button>
  </article>;
}
export function SavedKataDetails({kata,onOpen}:{kata:Kata;onOpen:(url:string)=>void}){
  const current=currentKataPresentation(kata),badge=examBadge(kata.id),actions=videoActions(current.links);
  return <div className="saved-kata-detail"><strong>{kata.name}</strong>{badge&&<span className="blue">{badge}</span>}
    {actions.length?<div className="video-actions" aria-label={`${kata.name} 영상 보기`}><span>영상 보기</span>{actions.map(action=><button key={action.kind} className="video-link" onClick={()=>onOpen(action.url)}>{action.label}</button>)}</div>:<span className="no-video">영상 없음</span>}
  </div>;
}
