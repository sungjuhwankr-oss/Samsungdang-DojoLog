export function scrollNavigationState(height:number,viewport:number,scrollY:number){
  const maximum=Math.max(0,height-viewport),long=maximum>8;
  return {top:long&&scrollY>8,bottom:long&&scrollY<maximum-8};
}
export function scrollDocument(host:{scrollTo:(options:ScrollToOptions)=>void},target:'top'|'bottom',height:number){
  host.scrollTo({top:target==='top'?0:height,behavior:'smooth'});
}
