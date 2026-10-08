"use client";

import { BookOpen, CalendarDays, Dumbbell, History, Settings } from "lucide-react";

export type InstructorNavId = "today" | "logs" | "hombu" | "exam" | "beginner" | "manage";

export const INSTRUCTOR_NAV_ITEMS = [
  { id: "today", label: "수업구성", icon: CalendarDays },
  { id: "logs", label: "수업일지", icon: History },
  { id: "hombu", label: "본부 카타", icon: BookOpen },
  { id: "exam", label: "삼성당 심사표", icon: Dumbbell },
  { id: "beginner", label: "초심자 동영상", icon: BookOpen },
  { id: "manage", label: "관리", icon: Settings }
] as const;

export function isInstructorNavId(value: unknown): value is InstructorNavId {
  return INSTRUCTOR_NAV_ITEMS.some(item => item.id === value);
}

export function InstructorBottomNav({
  active,
  onSelect
}: {
  active: InstructorNavId;
  onSelect?: (id: InstructorNavId) => void;
}) {
  return <nav className="bottom-nav" aria-label="지도자용 주요 메뉴">
    {INSTRUCTOR_NAV_ITEMS.map(({ id, label, icon: Icon }) => onSelect
      ? <button key={id} type="button" className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} onClick={() => onSelect(id)}><Icon /><span>{label}</span></button>
      : <a key={id} className={active === id ? "active" : ""} aria-current={active === id ? "page" : undefined} href={`/?tab=${id}`}><Icon /><span>{label}</span></a>)}
  </nav>;
}
