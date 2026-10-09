"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type IssuerOutcome = {
  workspace: "new-member" | "onboarding" | "special-v2" | "membership-test" | "promotion-test" | "special-v1-test";
  label: string;
  success: boolean;
  message: string;
  credentialId?: string;
  keyId?: string;
};
export type OutcomeReporter = (outcome: IssuerOutcome) => void;

export function CredentialWorkspace({ title, active, children }: { title: string; active: boolean; children: ReactNode }) {
  const details = useRef<HTMLDetailsElement>(null);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (!active && details.current) details.current.open = false;
  }, [active]);
  return <details ref={details} className="credential-workspace" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary aria-expanded={expanded}><span>{title}</span><ChevronDown aria-hidden="true" /></summary>
    <div className="credential-workspace-body">{children}</div>
  </details>;
}

export function IssuerStatus({ message, failed = false }: { message: string; failed?: boolean }) {
  return message ? <p className={failed ? "credential-error" : "credential-status"} role={failed ? "alert" : "status"}>{message}</p> : null;
}
