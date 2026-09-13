export type NativeShareStatus = "shared" | "unavailable";

type SessionShareBridge = {
  shareSession?: (text: string, pngBase64: string, filename: string) => void;
};

export type ShareHost = Pick<Window, "addEventListener" | "removeEventListener"> & { SamsungdangBackupBridge?: SessionShareBridge };

export function hasNativeSessionShare(host: ShareHost = window as ShareHost): boolean {
  return typeof host.SamsungdangBackupBridge?.shareSession === "function";
}

export function shareSessionCard(text: string, pngDataUrl: string, filename: string, host: ShareHost = window as ShareHost): Promise<NativeShareStatus> {
  const share = host.SamsungdangBackupBridge?.shareSession;
  if (typeof share !== "function") return Promise.resolve("unavailable");
  const comma = pngDataUrl.indexOf(",");
  if (!pngDataUrl.startsWith("data:image/png;base64,") || comma < 0) throw new Error("QR 이미지 형식이 올바르지 않습니다.");
  return new Promise((resolve, reject) => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ status?: string }>).detail;
      host.removeEventListener("samsungdang-share-result", handler);
      if (detail?.status === "success") resolve("shared");
      else reject(new Error("Android 공유 화면을 열지 못했습니다."));
    };
    host.addEventListener("samsungdang-share-result", handler, { once: true });
    try {
      share.call(host.SamsungdangBackupBridge, text, pngDataUrl.slice(comma + 1), filename);
    } catch (error) {
      host.removeEventListener("samsungdang-share-result", handler);
      reject(error);
    }
  });
}
