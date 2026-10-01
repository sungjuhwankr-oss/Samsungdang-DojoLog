import type { VideoLink } from "./data";

export type VideoAction = {
  kind: "omote" | "ura" | "generic" | `generic-${number}`;
  label: "영상(오모테)" | "영상(우라)" | "영상" | `영상 ${number}`;
  url: string;
};

export type CompositionVideoAction = Omit<VideoAction, "label"> & {
  label: "오모테" | "우라" | "영상" | `영상 ${number}`;
};

export type VideoNavigationHost = {
  SamsungdangBackupBridge?: { openExternalUrl?: (url: string) => void };
  location: { assign: (url: string) => void };
};
export type VideoLaunchStamp = { url: string; at: number };

const YOUTUBE_URL = /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//;

export function videoActions(links: VideoLink[]): VideoAction[] {
  const valid = links.filter((link) => YOUTUBE_URL.test(link.url));
  const omote = valid.find((link) => link.label === "오모테");
  const ura = valid.find((link) => link.label === "우라");

  if (omote || ura) {
    const actions:VideoAction[]=[];
    if(omote)actions.push({kind:"omote",label:"영상(오모테)",url:omote.url});
    if(ura)actions.push({kind:"ura",label:"영상(우라)",url:ura.url});
    return actions;
  }

  const generic = valid.filter((link,index,items)=>items.findIndex(item=>item.url===link.url)===index);
  if (generic.length === 1) {
    return [{ kind: "generic", label: "영상", url: generic[0].url }];
  }
  return generic.map((link,index)=>({kind:`generic-${index+1}` as const,label:`영상 ${index+1}` as const,url:link.url}));
}

export function compositionVideoActions(links: VideoLink[]): CompositionVideoAction[] {
  return videoActions(links).map((action) => ({
    ...action,
    label: action.kind === "omote" ? "오모테" : action.kind === "ura" ? "우라" : action.kind === "generic" ? "영상" : `영상 ${action.kind.slice(8)}` as `영상 ${number}`,
  }));
}

export function launchVideoUrl(host: VideoNavigationHost, url: string): "native" | "web" {
  const openExternalUrl = host.SamsungdangBackupBridge?.openExternalUrl;
  if (typeof openExternalUrl === "function") {
    openExternalUrl.call(host.SamsungdangBackupBridge, url);
    return "native";
  }
  host.location.assign(url);
  return "web";
}

export function shouldLaunchVideo(last: VideoLaunchStamp | null, url: string, now: number, duplicateWindowMs = 800): boolean {
  return last?.url !== url || now - last.at >= duplicateWindowMs;
}
