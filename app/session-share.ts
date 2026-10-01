import type { DojoLog } from "./backup";
import { bandText,currentKataPresentation } from "./data";

export const SESSION_SHARE_SCHEMA = "samsungdang-dojolog-session" as const;
export const SESSION_SHARE_VERSION = 1 as const;
export const SESSION_SHARE_DOJO = "samsungdang" as const;
export const IMPORT_BASE_URL = "https://sungjuhwankr-oss.github.io/Samsungdang-DojoLog-Member/import/";

export type SessionSharePayload = {
  schema: typeof SESSION_SHARE_SCHEMA;
  version: typeof SESSION_SHARE_VERSION;
  dojo: typeof SESSION_SHARE_DOJO;
  sessionNo: number;
  date: string;
  kata: { id: string; name: string }[];
};

export function createSessionSharePayload(log: DojoLog): SessionSharePayload {
  if (log.status !== "완료" || log.recordType === "sessionOnly" || !Number.isInteger(log.session)) {
    throw new Error("확정된 상세 수업일지만 공유할 수 있습니다.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(log.date) || !log.katas.length) throw new Error("공유할 수업 내용이 없습니다.");
  const seen = new Set<string>();
  const kata = log.katas.map(({ id, name }) => {
    if (!id || !name || seen.has(id)) throw new Error("수업 카타 식별자가 올바르지 않습니다.");
    seen.add(id);
    return { id, name };
  });
  return { schema: SESSION_SHARE_SCHEMA, version: SESSION_SHARE_VERSION, dojo: SESSION_SHARE_DOJO, sessionNo: log.session!, date: log.date, kata };
}

export function serializeSessionSharePayload(payload: SessionSharePayload): string {
  return JSON.stringify(payload);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function createImportLink(payload: SessionSharePayload, baseUrl = IMPORT_BASE_URL): string {
  if (!baseUrl) throw new Error("가져오기 주소가 없습니다.");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:") throw new Error("가져오기 주소는 HTTPS여야 합니다.");
  const path=url.pathname.replace(/\/$/, "");
  url.pathname = path.endsWith("/import") ? `${path}/` : `${path}/import/`;
  url.search = "";
  url.hash = `session=${encodeBase64Url(serializeSessionSharePayload(payload))}`;
  return url.toString();
}

export function decodeImportLink(link: string): SessionSharePayload {
  const url = new URL(link);
  const prefix = "#session=";
  if (!url.hash.startsWith(prefix)) throw new Error("수련기록 링크가 아닙니다.");
  return JSON.parse(decodeBase64Url(url.hash.slice(prefix.length))) as SessionSharePayload;
}

export function createQrContent(_payload: SessionSharePayload, importLink: string): string {
  if(!importLink)throw new Error("가져오기 주소가 없습니다.");
  return importLink;
}

export function sessionShareIntro(importLink: string): string {
  if(!importLink)throw new Error("가져오기 주소가 없습니다.");
  return `[회원용 DojoLog 수련기록 가져오기]\n${importLink}`;
}

export function createBandShareText(log: DojoLog, importLink: string, existingBody?: string): string {
  const payload = createSessionSharePayload(log);
  return `${existingBody ?? bandText(payload.date,payload.sessionNo,log.katas.map(currentKataPresentation))}\n\n${sessionShareIntro(importLink)}`;
}
