#!/usr/bin/env bash
set -euo pipefail
# API compile only. The trusted WebView runtime supplies MainActivity at packaging.
# This does not build/sign an APK or create a key.
if [[ $# != 1 || ! -f "$1" ]]; then
  echo 'Usage: bash android/compile-bridges.sh /path/to/android.jar' >&2
  exit 2
fi
android_jar="$(realpath "$1")"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compile_dir="$(mktemp -d)"
trap 'rm -rf "$compile_dir"' EXIT
mkdir -p "$compile_dir/classes"
cat > "$compile_dir/MainActivity.java" <<'JAVA'
package com.nicron.webview;
public class MainActivity extends android.app.Activity {
    protected android.webkit.WebView webView;
}
JAVA
java com.sun.tools.javac.Main -encoding UTF-8 -source 8 -target 8 -Xlint:-options \
  -classpath "$android_jar" -d "$compile_dir/classes" \
  "$compile_dir/MainActivity.java" "$project_root"/android/*.java
echo 'Android API compile PASS: all production bridges/provider; MainActivity ABI stub.'
