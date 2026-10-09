import { openBackupFile } from "./backup-file";

// Read-only document transport. This module never parses or restores a backup.
export const MAX_CREDENTIAL_FILE_BYTES = 128 * 1024;
let selectionPending = false;

export async function openCredentialFile(input: HTMLInputElement): Promise<{ filename: string; content: string } | null> {
  if (selectionPending) throw new Error("이미 JSON 파일을 선택하고 있습니다.");
  selectionPending = true;
  try {
    const selected = await openBackupFile(input);
    if (!selected) return null;
    if (!selected.content.trim()) throw new Error("빈 JSON 파일입니다.");
    if (new TextEncoder().encode(selected.content).byteLength > MAX_CREDENTIAL_FILE_BYTES) {
      throw new Error("전자 증명서 JSON 파일은 128 KiB 이하여야 합니다.");
    }
    return selected;
  } finally {
    selectionPending = false;
  }
}
