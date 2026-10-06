import {type Kata} from './data';
import {categoryOf,TECH_CATEGORY_ORDER,techniqueOrder} from './recommendation';

// Presentation only: sort a copy, never the canonical catalog or a lesson plan.
export function orderHombuKatas(katas:readonly Kata[]):Kata[]{
  return [...katas].sort((a,b)=>techniqueOrder(a)-techniqueOrder(b)
    ||categoryOf(a).localeCompare(categoryOf(b),'ko')||a.name.localeCompare(b.name,'ko'));
}
export function basicReplacementGroups(katas:readonly Kata[]){
  const basic=orderHombuKatas(katas.filter(k=>k.categoryId==='taijutsu'));
  const known=TECH_CATEGORY_ORDER.filter(category=>basic.some(k=>categoryOf(k)===category));
  const extra=[...new Set(basic.map(categoryOf).filter(category=>!TECH_CATEGORY_ORDER.includes(category)))];
  return [...known,...extra].map(category=>({label:category,katas:basic.filter(k=>categoryOf(k)===category)}));
}
