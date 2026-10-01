import {currentKataPresentation,examBadge,type Kata} from './data';
import {videoActions} from './video-links';
import type {DojoLog} from './backup';

export type JournalMode='all'|'memo'|'search';
export function filterJournal(logs:DojoLog[],mode:JournalMode,query:string):DojoLog[]{
  if(mode==='all')return logs;
  if(mode==='memo')return logs.filter(log=>log.note.trim().length>0);
  if(!query.trim())return [];
  return logs.filter(log=>log.note.includes(query));
}
export function SavedKataDetails({kata,onOpen}:{kata:Kata;onOpen:(url:string)=>void}){
  const current=currentKataPresentation(kata),badge=examBadge(kata.id),actions=videoActions(current.links);
  return <div className="saved-kata-detail"><strong>{kata.name}</strong>{badge&&<span className="blue">{badge}</span>}
    {actions.length?<div className="video-actions" aria-label={`${kata.name} 영상 보기`}><span>영상 보기</span>{actions.map(action=><button key={action.kind} className="video-link" onClick={()=>onOpen(action.url)}>{action.label}</button>)}</div>:<span className="no-video">영상 없음</span>}
  </div>;
}
