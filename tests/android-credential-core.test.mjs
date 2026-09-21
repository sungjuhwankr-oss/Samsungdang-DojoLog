import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import test from "node:test";

const execute = promisify(execFile);

test("pure Java Credential v1 core passes JCS, DER and tamper vectors", async () => {
  const output = await mkdtemp(join(tmpdir(), "dojolog-credential-core-"));
  try {
    await execute("java", [
      "com.sun.tools.javac.Main",
      "-encoding", "UTF-8",
      "-source", "8",
      "-target", "8",
      "-d", output,
      "android/CredentialV1.java",
      "android/StrictEcdsaDer.java",
      "tests/fixtures/java/CredentialCoreTest.java"
    ]);
    const result = await execute("java", ["-cp", output, "com.nicron.webview.CredentialCoreTest"]);
    assert.match(result.stdout, /CredentialCoreTest PASS/);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});
