# Samsungdang DojoLog Credential Signing PoC APK

This directory is an intentionally independent, dev/test-only Android APK.
It is not the Samsungdang DojoLog instructor application and does not alter
its Nitron packaging, production package identity, or release signing process.

## Phase 4G-A2 scope

Version `0.0.2-dev` (`versionCode` 2) performs one isolated runtime probe:

- Replaces the PoC-only alias
  `samsungdang.dojolog.credentialpoc.4g-a2.test-only` with a fresh
  Android Keystore EC key using the `secp256r1` / P-256 candidate.
- Signs one fixed Korean UTF-8 literal with the `SHA256withECDSA` candidate.
- Confirms that `PrivateKey.getEncoded()` returns `null`; unexpected
  exportability stops vector generation and no private bytes are retained.
- Exports only the public key encoding and raw provider signature bytes using
  unpadded base64url in a public test-vector JSON.
- Saves the JSON with Android `ACTION_CREATE_DOCUMENT`, requiring no storage
  permission.

These algorithm, serialization, public-key, signature, and transport choices
are PoC observations only. They do not define Credential v1. This APK contains
no membership credential, member data, production key, or private-key export.

The runtime Android Keystore result must be verified on the Fold8. GitHub
Actions verifies only that the isolated APK builds and is packaged correctly.

## Build and installation signing

The GitHub Actions workflow installs Android platform 35 and build-tools 35.0.0,
then runs:

```sh
bash poc/android-credential-signing/build.sh --sdk-root "$ANDROID_HOME" --output-dir "$RUNNER_TEMP/poc-out"
```

`build.sh` uses `javac`, `jar`, `d8`, `aapt2`, and `zipalign`; the workflow
performs the separate `apksigner` step. Source compilation explicitly uses
UTF-8. The workflow generates a fresh `test-only.jks` for every run. That
ephemeral APK-installation certificate is neither the production release
certificate nor the Android Keystore runtime signing key.

Because every Actions run uses a new APK-installation certificate, Android may
reject an update over a previously installed A1 PoC APK. If that occurs, remove
the old PoC app before installing A2. This does not affect the production
Samsungdang DojoLog instructor app because its package and signing identity are
separate.
