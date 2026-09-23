import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

const execute = promisify(execFile);

const stubs = {
  "android/app/Activity.java": `package android.app;
public class Activity { public void runOnUiThread(Runnable runnable) { runnable.run(); } }
`,
  "android/security/keystore/KeyGenParameterSpec.java": `package android.security.keystore;
import java.security.spec.AlgorithmParameterSpec;
public final class KeyGenParameterSpec implements AlgorithmParameterSpec {
  public static final class Builder {
    public Builder(String alias, int purposes) {}
    public Builder setAlgorithmParameterSpec(AlgorithmParameterSpec spec) { return this; }
    public Builder setDigests(String... digests) { return this; }
    public Builder setUserAuthenticationRequired(boolean required) { return this; }
    public KeyGenParameterSpec build() { return new KeyGenParameterSpec(); }
  }
}
`,
  "android/security/keystore/KeyProperties.java": `package android.security.keystore;
public final class KeyProperties {
  public static final String KEY_ALGORITHM_EC = "EC";
  public static final int PURPOSE_SIGN = 4;
  public static final String DIGEST_SHA256 = "SHA-256";
}
`,
  "android/webkit/JavascriptInterface.java": `package android.webkit;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
@Retention(RetentionPolicy.RUNTIME) @Target(ElementType.METHOD)
public @interface JavascriptInterface {}
`,
  "android/webkit/WebView.java": `package android.webkit;
public class WebView {
  public String getUrl() { return null; }
  public void evaluateJavascript(String script, Object callback) {}
}
`,
  "org/json/JSONObject.java": `package org.json;
import java.util.Collections;
import java.util.Iterator;
public class JSONObject {
  public static final Object NULL = new Object();
  public JSONObject(String json) {}
  public Object get(String key) throws Exception { return null; }
  public Iterator<String> keys() { return Collections.<String>emptyList().iterator(); }
  public static String quote(String value) { return value; }
}
`
};

test("Android Credential bridge compiles against the Java 8 Android API surface", async () => {
  const root = await mkdtemp(join(tmpdir(), "dojolog-credential-bridge-"));
  const classes = join(root, "classes");
  try {
    await mkdir(classes, { recursive: true });
    const paths = [];
    for (const [relative, source] of Object.entries(stubs)) {
      const path = join(root, relative);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source, "utf8");
      paths.push(path);
    }
    const result = await execute("java", [
      "com.sun.tools.javac.Main",
      "-encoding", "UTF-8",
      "-source", "8",
      "-target", "8",
      "-Xlint:-options",
      "-d", classes,
      ...paths,
      "android/CredentialV1.java",
      "android/StrictEcdsaDer.java",
      "android/CredentialIssuerBridge.java"
    ]);
    assert.equal(result.stderr, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
