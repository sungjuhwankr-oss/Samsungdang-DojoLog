# Android v0.9.9 packaging note

The Android app is a Nitron WebView APK. The v0.9.9 native document bridge is
implemented by `SaveActivity.java`; SDK tools, the Nitron base APK, and the
release keystore stay outside Git.

## Required external inputs

- Android SDK platform 34 `android.jar`
- Android build-tools D8 and APK signing/zipalign tools
- the last compatible Nitron APK containing
  `com.nicron.webview.MainActivity`
- the existing Samsungdang release keystore and `release` alias

Never generate a replacement signing key. Verify the finished certificate
SHA-256 against the established release certificate before publishing.

## Packaging sequence

1. Run the production build and use only `dist/client` as `assets/www`.
2. Compile `SaveActivity.java` for Java 8 against API 34. A compile-only stub
   for `com.nicron.webview.MainActivity` may be used because the real class is
   already in the Nitron APK.
3. Run D8 with `min-api 21`, treating the MainActivity stub as a library. Add
   the resulting bridge and share-provider DEX to the APK as `classes2.dex`;
   retain the Nitron runtime `classes.dex` unchanged.
4. For r8, compile `android/AndroidManifest.xml` and `android/res` with AAPT2.
   Copy the launcher PNG resources from the compatible Nitron APK before
   compiling. The source manifest keeps the established launcher and adds only
   the read-only QR-card content provider. It also advances `versionCode` to
   910 so r8 can update r7 while keeping `versionName` 0.9.9.
5. Repackage without old `META-INF` signatures while preserving the base APK's
   ZIP methods. In particular, keep `resources.arsc` uncompressed (`stored`)
   and 4-byte aligned; keep the binary `AndroidManifest.xml` stored. Run
   zipalign before signing with the existing release key.
6. Verify package/version/SDK/launcher metadata, v1/v2/v3 signatures,
   certificate identity, both DEX files, permissions, and exact
   `dist/client` to `assets/www` file/content equality. No `_next` files or
   storage permissions are expected.

The earlier binary-manifest patch was a release-specific compatibility step.
The checked-in r8 manifest is the reproducible source of the provider and
version metadata; recheck all external inputs before using it later.

## Phase 4H-A development update build

`build-update.sh` provides the checked-in packaging path used for the 4H-A
device build. It takes the trusted r8 APK as its Nitron runtime/resource base,
compiles every checked-in `android/*.java` source, replaces `classes2.dex` and
the exact `dist/client` tree, and signs with the existing release key supplied
outside Git. It verifies the release certificate, preserves the base binary
manifest byte-for-byte, and compares the packaged web assets with `dist/client`.

The script never creates or replaces an APK signing key. Passwords are accepted
only through `SAMSUNGDANG_STOREPASS` and `SAMSUNGDANG_KEYPASS`; they must not be
placed in source, logs, or command-line arguments. Because the exact r8 binary
manifest is preserved, this Phase 4H-A APK remains versionCode 910 and is a
development update candidate, not a new stable release.
