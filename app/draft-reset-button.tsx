import {RefreshCw} from 'lucide-react';
import {confirmDraftReset} from './planner-draft';

export function DraftResetButton({onReset}:{onReset:()=>void}){
  return <button type="button" className="ghost draft-reset"
    onClick={()=>confirmDraftReset(message=>window.confirm(message),onReset)}><RefreshCw/>초기화</button>;
}
