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
   the resulting bridge DEX to the APK as `classes2.dex`; retain the Nitron
   runtime `classes.dex` unchanged.
4. In the base APK binary manifest, patch the exact existing values:
   `versionCode 908` to `909`, `versionName 0.9.8` to `0.9.9`, and launcher
   `com.nicron.webview.MainActivity` to
   `com.nicron.webview.SaveActivity`. The activity names have equal encoded
   length, so this release uses an exact in-place binary-string replacement.
5. Repackage without old `META-INF` signatures while preserving the base APK's
   ZIP methods. In particular, keep `resources.arsc` uncompressed (`stored`)
   and 4-byte aligned; keep the binary `AndroidManifest.xml` stored as in the
   base APK. Run zipalign before signing with the existing release key.
6. Verify package/version/SDK/launcher metadata, v1/v2/v3 signatures,
   certificate identity, both DEX files, permissions, and exact
   `dist/client` to `assets/www` file/content equality. No `_next` files or
   storage permissions are expected.

The binary-manifest patch is a release-specific compatibility step, not a new
general Android build system. Recheck all source and target values before
using the procedure for a later version.
