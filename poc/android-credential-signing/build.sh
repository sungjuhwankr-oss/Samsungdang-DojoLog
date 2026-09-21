#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SDK_ROOT="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
OUTPUT_DIR="$SCRIPT_DIR/out"
PLATFORM_API="35"
BUILD_TOOLS_VERSION="35.0.0"

usage() {
  cat <<'EOF'
Usage: build.sh [--sdk-root PATH] [--output-dir PATH]

Builds only the unsigned, zip-aligned dev/test Credential Signing PoC APK.
APK signing is intentionally a separate CI step using an ephemeral test key.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --sdk-root) SDK_ROOT="$2"; shift 2 ;;
    --output-dir) OUTPUT_DIR="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$SDK_ROOT" ]; then
  printf '%s\n' 'Android SDK root is required (--sdk-root or ANDROID_SDK_ROOT/ANDROID_HOME).' >&2
  exit 2
fi

case "$OUTPUT_DIR" in
  /|"$SCRIPT_DIR"|"")
    printf 'Refusing unsafe output directory: %s\n' "$OUTPUT_DIR" >&2
    exit 2
    ;;
esac

if [ -e "$OUTPUT_DIR" ]; then
  printf 'Output directory must not already exist: %s\n' "$OUTPUT_DIR" >&2
  exit 2
fi

BUILD_TOOLS="$SDK_ROOT/build-tools/$BUILD_TOOLS_VERSION"
ANDROID_JAR="$SDK_ROOT/platforms/android-$PLATFORM_API/android.jar"
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
D8="$BUILD_TOOLS/d8"
AAPT2="$BUILD_TOOLS/aapt2"
ZIPALIGN="$BUILD_TOOLS/zipalign"

for tool in "$JAVA_BIN" "$D8" "$AAPT2" "$ZIPALIGN" "$ANDROID_JAR"; do
  if [ ! -e "$tool" ] && ! command -v "$tool" >/dev/null 2>&1; then
    printf 'Required tool or platform file not found: %s\n' "$tool" >&2
    exit 2
  fi
done

mkdir -p "$OUTPUT_DIR/classes" "$OUTPUT_DIR/dex"

printf 'Java compiler: '; "$JAVA_BIN" -version 2>&1
printf 'D8: '; "$D8" --version
printf 'AAPT2: '; "$AAPT2" version
printf 'zipalign: %s\n' "$ZIPALIGN"
printf 'Android platform: android-%s\n' "$PLATFORM_API"
printf 'Build tools: %s\n' "$BUILD_TOOLS_VERSION"

find "$SCRIPT_DIR/src" -name '*.java' -print0 | xargs -0 "$JAVA_BIN" \
  -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -d "$OUTPUT_DIR/classes"

"$D8" --min-api 23 --lib "$ANDROID_JAR" --output "$OUTPUT_DIR/dex" "$OUTPUT_DIR/classes"
"$AAPT2" link --manifest "$SCRIPT_DIR/AndroidManifest.xml" -I "$ANDROID_JAR" \
  --min-sdk-version 23 --target-sdk-version 35 -o "$OUTPUT_DIR/unsigned-unaligned.apk"

(cd "$OUTPUT_DIR/dex" && zip -q -0 "$OUTPUT_DIR/unsigned-unaligned.apk" classes.dex)
"$ZIPALIGN" -f -p 4 "$OUTPUT_DIR/unsigned-unaligned.apk" "$OUTPUT_DIR/credential-poc-unsigned.apk"
"$ZIPALIGN" -c -p 4 "$OUTPUT_DIR/credential-poc-unsigned.apk"

printf 'Unsigned aligned APK: %s\n' "$OUTPUT_DIR/credential-poc-unsigned.apk"
