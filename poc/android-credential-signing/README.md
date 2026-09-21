# Samsungdang DojoLog Credential Signing PoC APK

This directory is an intentionally independent, dev/test-only Android APK.
It is not the Samsungdang DojoLog instructor application and does not alter
its Nitron packaging, production package identity, or release signing process.

## Scope of Phase 4G-A1

- Builds a minimal native launcher Activity with Android SDK command-line tools.
- Uses the distinct package `kr.or.aikido.samsungdang.dojolog.credentialpoc`.
- Displays the PoC name, dev/test-only status, and fixed APK version details.
- Provides an isolated Activity into which a later, separately approved phase
  may add Android Keystore work.

This phase deliberately contains no Android Keystore calls, credential data,
cryptographic signing, public-key export, or Member PWA integration.

## Build

The GitHub Actions workflow installs Android platform 35 and build-tools 35.0.0,
then runs:

```sh
bash poc/android-credential-signing/build.sh --sdk-root "$ANDROID_HOME" --output-dir "$RUNNER_TEMP/poc-out"
```

`build.sh` uses `javac`, `aapt2`, `d8`, and `zipalign`; the workflow performs
the separate `apksigner` step. The script prints the exact selected Java and
Android build-tool versions. It writes only below its specified output
directory.

The workflow generates a fresh `test-only.jks` for every run. That ephemeral
APK-installation certificate is neither the production release certificate nor
a future Android Keystore credential-signing key. No keystore is committed,
uploaded, or required as a secret.
