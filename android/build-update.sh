#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

BASE_APK=""
ANDROID_JAR=""
D8_JAR=""
ZIPALIGN=""
APKSIGNER_JAR=""
MAIN_ACTIVITY_STUB=""
KEYSTORE=""
KEY_ALIAS="release"
OUTPUT_APK=""

usage() {
  cat <<'EOF'
Usage: android/build-update.sh \
  --base-apk PATH --android-jar PATH --d8-jar PATH --zipalign PATH \
  --apksigner-jar PATH --main-activity-stub PATH --keystore PATH \
  --output-apk PATH [--key-alias ALIAS]

Required environment variables:
  SAMSUNGDANG_STOREPASS
  SAMSUNGDANG_KEYPASS

The script reuses the exact binary manifest/resources/runtime from the trusted
r8 base APK, replaces only classes2.dex and assets/www, aligns the result, and
signs it with the existing release certificate. It never creates a signing key.
EOF
}

while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --base-apk) BASE_APK="$2"; shift 2 ;;
    --android-jar) ANDROID_JAR="$2"; shift 2 ;;
    --d8-jar) D8_JAR="$2"; shift 2 ;;
    --zipalign) ZIPALIGN="$2"; shift 2 ;;
    --apksigner-jar) APKSIGNER_JAR="$2"; shift 2 ;;
    --main-activity-stub) MAIN_ACTIVITY_STUB="$2"; shift 2 ;;
    --keystore) KEYSTORE="$2"; shift 2 ;;
    --key-alias) KEY_ALIAS="$2"; shift 2 ;;
    --output-apk) OUTPUT_APK="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; usage >&2; exit 2 ;;
  esac
done

for value in BASE_APK ANDROID_JAR D8_JAR ZIPALIGN APKSIGNER_JAR MAIN_ACTIVITY_STUB KEYSTORE OUTPUT_APK; do
  if [[ -z "${!value}" ]]; then
    printf 'Missing required argument for %s.\n' "$value" >&2
    exit 2
  fi
done
for file in "$BASE_APK" "$ANDROID_JAR" "$D8_JAR" "$ZIPALIGN" "$APKSIGNER_JAR" "$MAIN_ACTIVITY_STUB" "$KEYSTORE"; do
  if [[ ! -f "$file" ]]; then
    printf 'Required file not found: %s\n' "$file" >&2
    exit 2
  fi
done
if [[ -z "${SAMSUNGDANG_STOREPASS:-}" || -z "${SAMSUNGDANG_KEYPASS:-}" ]]; then
  printf '%s\n' 'SAMSUNGDANG_STOREPASS and SAMSUNGDANG_KEYPASS are required.' >&2
  exit 2
fi
if [[ -e "$OUTPUT_APK" ]]; then
  printf 'Output path already exists: %s\n' "$OUTPUT_APK" >&2
  exit 2
fi

for command in java unzip zip sha256sum cmp; do
  command -v "$command" >/dev/null || { printf 'Required command unavailable: %s\n' "$command" >&2; exit 69; }
done

WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT
mkdir -p "$WORK_DIR/classes" "$WORK_DIR/dex" "$WORK_DIR/apk" "$(dirname "$OUTPUT_APK")"

cd "$PROJECT_ROOT"
npm run build

java com.sun.tools.javac.Main \
  -encoding UTF-8 -source 8 -target 8 \
  -bootclasspath "$ANDROID_JAR" \
  -classpath "$MAIN_ACTIVITY_STUB" \
  -d "$WORK_DIR/classes" \
  android/*.java

(cd "$WORK_DIR/classes" && zip -q -0 -r "$WORK_DIR/classes.jar" .)
java -cp "$D8_JAR" com.android.tools.r8.D8 \
  --min-api 21 \
  --lib "$ANDROID_JAR" \
  --classpath "$MAIN_ACTIVITY_STUB" \
  --output "$WORK_DIR/dex" \
  "$WORK_DIR/classes.jar"

unzip -q "$BASE_APK" -d "$WORK_DIR/apk"
rm -rf "$WORK_DIR/apk/META-INF" "$WORK_DIR/apk/assets/www"
mkdir -p "$WORK_DIR/apk/assets/www"
cp -a dist/client/. "$WORK_DIR/apk/assets/www/"
cp "$WORK_DIR/dex/classes.dex" "$WORK_DIR/apk/classes2.dex"

(cd "$WORK_DIR/apk" && zip -q -0 -r "$WORK_DIR/update-unaligned.apk" .)
ZIPALIGN_LIBRARY_DIR="$(cd "$(dirname "$ZIPALIGN")" && pwd)"
LD_LIBRARY_PATH="${ZIPALIGN_LIBRARY_DIR}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" \
  "$ZIPALIGN" -f -p 4 "$WORK_DIR/update-unaligned.apk" "$WORK_DIR/update-aligned.apk"
LD_LIBRARY_PATH="${ZIPALIGN_LIBRARY_DIR}${LD_LIBRARY_PATH:+:${LD_LIBRARY_PATH}}" \
  "$ZIPALIGN" -c -p 4 "$WORK_DIR/update-aligned.apk"

java -jar "$APKSIGNER_JAR" sign \
  --ks "$KEYSTORE" \
  --ks-key-alias "$KEY_ALIAS" \
  --ks-pass "env:SAMSUNGDANG_STOREPASS" \
  --key-pass "env:SAMSUNGDANG_KEYPASS" \
  --v4-signing-enabled false \
  --out "$OUTPUT_APK" \
  "$WORK_DIR/update-aligned.apk"

java -jar "$APKSIGNER_JAR" verify --verbose --print-certs "$BASE_APK" > "$WORK_DIR/base-cert.txt"
java -jar "$APKSIGNER_JAR" verify --verbose --print-certs "$OUTPUT_APK" > "$WORK_DIR/output-cert.txt"
base_cert="$(awk -F': ' '/Signer #1 certificate SHA-256 digest/ {print $2; exit}' "$WORK_DIR/base-cert.txt")"
output_cert="$(awk -F': ' '/Signer #1 certificate SHA-256 digest/ {print $2; exit}' "$WORK_DIR/output-cert.txt")"
if [[ -z "$base_cert" || "$base_cert" != "$output_cert" ]]; then
  printf '%s\n' 'Release certificate mismatch.' >&2
  exit 1
fi

unzip -p "$BASE_APK" AndroidManifest.xml > "$WORK_DIR/base-manifest.bin"
unzip -p "$OUTPUT_APK" AndroidManifest.xml > "$WORK_DIR/output-manifest.bin"
cmp "$WORK_DIR/base-manifest.bin" "$WORK_DIR/output-manifest.bin"

rm -rf "$WORK_DIR/exported-assets"
mkdir -p "$WORK_DIR/exported-assets"
unzip -q "$OUTPUT_APK" 'assets/www/*' -d "$WORK_DIR/exported-assets"
diff -qr dist/client "$WORK_DIR/exported-assets/assets/www"

unzip -l "$OUTPUT_APK" | grep -F 'classes2.dex' >/dev/null
printf 'Release certificate SHA-256: %s\n' "$output_cert"
printf 'APK SHA-256: '
sha256sum "$OUTPUT_APK" | awk '{print $1}'
printf 'APK: %s\n' "$OUTPUT_APK"
