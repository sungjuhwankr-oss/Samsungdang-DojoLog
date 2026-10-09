"use client";

import {useEffect,useState} from 'react';
import {scrollDocument,scrollNavigationState} from './scroll-navigation';

export function ScrollNavigationButtons({visible,onScroll}:{visible:{top:boolean;bottom:boolean};onScroll:(target:'top'|'bottom')=>void}){
  if(!visible.top&&!visible.bottom)return null;
  return <nav className="scroll-controls" aria-label="화면 위아래 이동">
    {visible.top&&<button type="button" onClick={()=>onScroll('top')}>맨 위 ↑</button>}
    {visible.bottom&&<button type="button" onClick={()=>onScroll('bottom')}>맨 아래 ↓</button>}
  </nav>;
}

export function ScrollControls(){
  const [visible,setVisible]=useState({top:false,bottom:false});
  useEffect(()=>{
    let frame=0;
    const update=()=>{
      frame=0;
      const next=document.querySelector('.credential-shell[data-active="true"]')?{top:false,bottom:false}:scrollNavigationState(document.documentElement.scrollHeight,window.innerHeight,window.scrollY);
      setVisible(previous=>previous.top===next.top&&previous.bottom===next.bottom?previous:next);
    };
    const schedule=()=>{if(!frame)frame=window.requestAnimationFrame(update)};
    const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(schedule):null;
    resize?.observe(document.documentElement);resize?.observe(document.body);
    const mutation=new MutationObserver(schedule);
    mutation.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["data-active","hidden","open"]});
    window.addEventListener('scroll',schedule,{passive:true});
    window.addEventListener('resize',schedule);schedule();
    return()=>{resize?.disconnect();mutation.disconnect();window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule)};
  },[]);
  return <ScrollNavigationButtons visible={visible}
    onScroll={target=>scrollDocument(window,target,document.documentElement.scrollHeight)}/>;
}
