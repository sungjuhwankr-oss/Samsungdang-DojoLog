export type NativeCredentialResult = {
  operation: "provision-key" | "issue-membership" | "issue-promotion";
  status: "success" | "error";
  json?: string;
  bootstrap?: string;
  transportToken?: string;
  diagnostics?: string;
  message?: string;
};

type NativeCredentialBridge = {
  provisionProductionKey: () => void;
  issueMembershipCredential: (name: string, memberId: string, joinedAt: string) => void;
  issuePromotionCredential: (payloadJson: string) => void;
};

type CredentialWindow = Window & { SamsungdangCredentialBridge?: NativeCredentialBridge };

function bridge(): NativeCredentialBridge | undefined {
  return (window as CredentialWindow).SamsungdangCredentialBridge;
}

export function hasNativeCredentialBridge(): boolean {
  return typeof bridge()?.provisionProductionKey === "function"
    && typeof bridge()?.issueMembershipCredential === "function"
    && typeof bridge()?.issuePromotionCredential === "function";
}

function nativeResult(
  operation: NativeCredentialResult["operation"],
  invoke: (bridge: NativeCredentialBridge) => void
): Promise<NativeCredentialResult> {
  return new Promise((resolve, reject) => {
    const native = bridge();
    if (!native) return reject(new Error("Android Credential bridge를 사용할 수 없습니다."));
    const timer = window.setTimeout(() => {
      window.removeEventListener("samsungdang-credential-result", handler);
      reject(new Error("Android Credential 작업 응답 시간이 초과되었습니다."));
    }, 60_000);
    const handler = (event: Event) => {
      const result = (event as CustomEvent<NativeCredentialResult>).detail;
      if (result?.operation !== operation) return;
      window.clearTimeout(timer);
      window.removeEventListener("samsungdang-credential-result", handler);
      resolve(result);
    };
    window.addEventListener("samsungdang-credential-result", handler);
    try {
      invoke(native);
    } catch (error) {
      window.clearTimeout(timer);
      window.removeEventListener("samsungdang-credential-result", handler);
      reject(error);
    }
  });
}

export function provisionProductionCredentialKey(): Promise<NativeCredentialResult> {
  return nativeResult("provision-key", native => native.provisionProductionKey());
}

export function issueNativeMembershipCredential(
  name: string,
  memberId: string,
  joinedAt: string
): Promise<NativeCredentialResult> {
  return nativeResult("issue-membership", native => native.issueMembershipCredential(name, memberId, joinedAt));
}

export function issueNativePromotionCredential(payload: object): Promise<NativeCredentialResult> {
  return nativeResult("issue-promotion", native => native.issuePromotionCredential(JSON.stringify(payload)));
}
