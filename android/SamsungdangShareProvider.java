package com.nicron.webview;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Read-only content URI for the single-use QR card kept in the app cache. */
public final class SamsungdangShareProvider extends ContentProvider {
    public static final String AUTHORITY = "kr.or.aikido.samsungdang.dojolog.instructor.share";
    public static final String CACHE_DIRECTORY = "session-share";

    public static Uri uriFor(String filename) {
        return new Uri.Builder().scheme("content").authority(AUTHORITY).appendPath("card").appendPath(filename).build();
    }

    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "image/png"; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new FileNotFoundException("Read only");
        File file = resolve(uri);
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File file;
        try { file = resolve(uri); } catch (FileNotFoundException error) { return null; }
        String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE} : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        MatrixCursor.RowBuilder row = cursor.newRow();
        for (String column : columns) {
            if (OpenableColumns.DISPLAY_NAME.equals(column)) row.add(file.getName());
            else if (OpenableColumns.SIZE.equals(column)) row.add(file.length());
            else row.add(null);
        }
        return cursor;
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        if (getContext() == null || !AUTHORITY.equals(uri.getAuthority()) || uri.getPathSegments().size() != 2
                || !"card".equals(uri.getPathSegments().get(0))) throw new FileNotFoundException("Invalid share URI");
        String filename = uri.getLastPathSegment();
        if (filename == null || filename.contains("/") || filename.contains("..")) throw new FileNotFoundException("Invalid filename");
        File directory = new File(getContext().getCacheDir(), CACHE_DIRECTORY);
        File file = new File(directory, filename);
        try {
            if (!file.getCanonicalPath().startsWith(directory.getCanonicalPath() + File.separator) || !file.isFile()) {
                throw new FileNotFoundException("Share card not found");
            }
        } catch (IOException error) {
            throw new FileNotFoundException("Invalid share card path");
        }
        return file;
    }

    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException("Read only"); }
    @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
