import { MAX_BACKUP_BYTES } from "./backup";

export type NativeBackupResult = {
  operation: "save" | "open";
  status: "success" | "cancel" | "error";
  filename?: string;
  content?: string;
};

type NativeBackupBridge = {
  saveJson: (filename: string, content: string) => void;
  openJson: () => void;
};
type BackupWindow = Window & {
  SamsungdangBackupBridge?: NativeBackupBridge;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<{ createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }> }>;
};

function nativeResult(operation: NativeBackupResult["operation"], invoke: () => void): Promise<NativeBackupResult> {
  return new Promise((resolve, reject) => {
    const handler = (event: Event) => {
      const result = (event as CustomEvent<NativeBackupResult>).detail;
      if (result?.operation !== operation) return;
      window.removeEventListener("samsungdang-backup-result", handler);
      resolve(result);
    };
    window.addEventListener("samsungdang-backup-result", handler);
    try {
      invoke();
    } catch (error) {
      window.removeEventListener("samsungdang-backup-result", handler);
      reject(error);
    }
  });
}

export async function saveBackupFile(filename: string, content: string): Promise<"saved" | "cancelled"> {
  const host = window as BackupWindow;
  if (host.SamsungdangBackupBridge) {
    const result = await nativeResult("save", () => host.SamsungdangBackupBridge?.saveJson(filename, content));
    if (result.status === "cancel") return "cancelled";
    if (result.status !== "success") throw new Error("native save failed");
    return "saved";
  }

  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  if (host.showSaveFilePicker) {
    try {
      const handle = await host.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: "JSON 백업 파일", accept: { "application/json": [".json"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return "saved";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
      throw error;
    }
  }

  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    return "saved";
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function openBackupFile(input: HTMLInputElement): Promise<{ filename: string; content: string } | null> {
  const host = window as BackupWindow;
  if (host.SamsungdangBackupBridge) {
    const result = await nativeResult("open", () => host.SamsungdangBackupBridge?.openJson());
    if (result.status === "cancel") return null;
    if (result.status !== "success" || typeof result.content !== "string") throw new Error("native open failed");
    if (new TextEncoder().encode(result.content).byteLength > MAX_BACKUP_BYTES) throw new Error("file too large");
    return { filename: result.filename ?? "Android 백업 파일", content: result.content };
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeEventListener("change", change);
      input.removeEventListener("cancel", cancel);
    };
    const cancel = () => {
      cleanup();
      input.value = "";
      resolve(null);
    };
    const change = async () => {
      cleanup();
      const file = input.files?.[0];
      input.value = "";
      if (!file) return resolve(null);
      if (file.size > MAX_BACKUP_BYTES) return reject(new Error("file too large"));
      try {
        resolve({ filename: file.name, content: await file.text() });
      } catch (error) {
        reject(error);
      }
    };
    input.addEventListener("change", change, { once: true });
    input.addEventListener("cancel", cancel, { once: true });
    input.click();
  });
}
