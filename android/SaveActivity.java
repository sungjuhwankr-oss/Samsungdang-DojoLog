package com.nicron.webview;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;

/** Minimal Storage Access Framework extension for the Nitron WebView runtime. */
public final class SaveActivity extends MainActivity {
    private static final int CREATE_BACKUP = 9901;
    private static final int OPEN_BACKUP = 9902;
    private static final int MAX_BACKUP_BYTES = 10 * 1024 * 1024;
    private WebView appWebView;
    private String pendingFilename;
    private String pendingContent;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        try {
            Field field = MainActivity.class.getDeclaredField("webView");
            field.setAccessible(true);
            appWebView = (WebView) field.get(this);
            appWebView.addJavascriptInterface(this, "SamsungdangBackupBridge");
        } catch (Exception error) {
            throw new IllegalStateException("Unable to attach backup bridge", error);
        }
    }

    private boolean isTrustedAppPage() {
        String url = appWebView == null ? null : appWebView.getUrl();
        return url != null && url.startsWith("https://appassets.androidplatform.net/");
    }

    @JavascriptInterface
    public void saveJson(final String filename, final String content) {
        if (!isTrustedAppPage() || filename == null || content == null) return;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                pendingFilename = filename.endsWith(".json") ? filename : filename + ".json";
                pendingContent = content;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                intent.putExtra(Intent.EXTRA_TITLE, pendingFilename);
                startActivityForResult(intent, CREATE_BACKUP);
            }
        });
    }

    @JavascriptInterface
    public void openJson() {
        if (!isTrustedAppPage()) return;
        runOnUiThread(new Runnable() {
            @Override public void run() {
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("application/json");
                startActivityForResult(intent, OPEN_BACKUP);
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_BACKUP && requestCode != OPEN_BACKUP) return;
        String operation = requestCode == CREATE_BACKUP ? "save" : "open";
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            emit(operation, "cancel", null, null);
            return;
        }
        Uri uri = data.getData();
        try {
            if (requestCode == CREATE_BACKUP) {
                writeUtf8(uri, pendingContent == null ? "" : pendingContent);
                emit("save", "success", pendingFilename, null);
            } else {
                emit("open", "success", displayName(uri), readUtf8(uri));
            }
        } catch (Exception error) {
            emit(operation, "error", null, null);
        } finally {
            pendingFilename = null;
            pendingContent = null;
        }
    }

    private void writeUtf8(Uri uri, String content) throws Exception {
        ContentResolver resolver = getContentResolver();
        OutputStream stream = resolver.openOutputStream(uri);
        if (stream == null) throw new IllegalStateException("No output stream");
        try {
            stream.write(content.getBytes(StandardCharsets.UTF_8));
            stream.flush();
        } finally {
            stream.close();
        }
    }

    private String readUtf8(Uri uri) throws Exception {
        InputStream stream = getContentResolver().openInputStream(uri);
        if (stream == null) throw new IllegalStateException("No input stream");
        try {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int total = 0;
            int count;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > MAX_BACKUP_BYTES) throw new IllegalArgumentException("Backup too large");
                output.write(buffer, 0, count);
            }
            return new String(output.toByteArray(), StandardCharsets.UTF_8);
        } finally {
            stream.close();
        }
    }

    private String displayName(Uri uri) {
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (cursor != null && cursor.moveToFirst()) return cursor.getString(0);
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) cursor.close();
        }
        return "Android 백업 파일";
    }

    private void emit(String operation, String status, String filename, String content) {
        if (appWebView == null) return;
        String script = "window.dispatchEvent(new CustomEvent('samsungdang-backup-result',{detail:{operation:"
                + JSONObject.quote(operation) + ",status:" + JSONObject.quote(status)
                + (filename == null ? "" : ",filename:" + JSONObject.quote(filename))
                + (content == null ? "" : ",content:" + JSONObject.quote(content))
                + "}}))";
        appWebView.evaluateJavascript(script, null);
    }
}
