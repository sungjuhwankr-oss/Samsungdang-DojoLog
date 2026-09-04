import type { VideoLink } from "./data";

export type VideoAction = {
  kind: "omote" | "ura" | "generic";
  label: "영상(오모테)" | "영상(우라)" | "영상";
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

  return valid[0]
    ? [{ kind: "generic", label: "영상", url: valid[0].url }]
    : [];
}
