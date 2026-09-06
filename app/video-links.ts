import type { VideoLink } from "./data";

export type VideoAction = {
  kind: "omote" | "ura" | "generic" | `generic-${number}`;
  label: "영상(오모테)" | "영상(우라)" | "영상" | `영상 ${number}`;
  url: string;
};

const YOUTUBE_URL = /^https:\/\/(?:www\.)?(?:youtube\.com|youtu\.be)\//;

export function videoActions(links: VideoLink[]): VideoAction[] {
  const valid = links.filter((link) => YOUTUBE_URL.test(link.url));
  const omote = valid.find((link) => link.label === "오모테");
  const ura = valid.find((link) => link.label === "우라");

  if (omote || ura) {
    return [
      omote && { kind: "omote" as const, label: "영상(오모테)" as const, url: omote.url },
      ura && { kind: "ura" as const, label: "영상(우라)" as const, url: ura.url },
    ].filter((action): action is VideoAction => Boolean(action));
  }

  const generic = valid.filter((link,index,items)=>items.findIndex(item=>item.url===link.url)===index);
  if (generic.length === 1) {
    return [{ kind: "generic", label: "영상", url: generic[0].url }];
  }
  return generic.map((link,index)=>({kind:`generic-${index+1}` as const,label:`영상 ${index+1}` as const,url:link.url}));
}
