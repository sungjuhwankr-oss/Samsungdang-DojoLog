package kr.or.aikido.samsungdang.dojolog.credentialpoc;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Dev/test-only UI for the isolated Android Keystore signing PoC. */
public final class CredentialSigningPocActivity extends Activity {
    private static final int CREATE_TEST_VECTOR = 4202;
    private static final String TEST_VECTOR_FILENAME =
            "Samsungdang-DojoLog-4G-A2-test-vector.json";

    private TextView statusView;
    private Button generateButton;
    private Button exportButton;
    private String pendingTestVectorJson;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_HORIZONTAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Samsungdang DojoLog\nCredential Signing PoC");
        title.setTextSize(24);
        title.setTextColor(Color.rgb(23, 92, 69));
        content.addView(title, matchWidthWrapHeight());

        TextView details = new TextView(this);
        details.setText("dev/test only · Phase 4G-A2\n\n"
                + "Version: " + BuildInfo.VERSION_NAME + " (" + BuildInfo.VERSION_CODE + ")\n"
                + "Build: " + BuildInfo.BUILD_LABEL + "\n\n"
                + "Creates a fresh test-only EC key inside AndroidKeyStore, signs the fixed UTF-8 input, "
                + "and prepares a public test-vector JSON. This does not define Credential v1.");
        details.setTextSize(16);
        details.setPadding(0, padding, 0, padding);
        content.addView(details, matchWidthWrapHeight());

        generateButton = new Button(this);
        generateButton.setText("Generate key and sign test input");
        generateButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                generateTestVector();
            }
        });
        content.addView(generateButton, matchWidthWrapHeight());

        exportButton = new Button(this);
        exportButton.setText("Export public test-vector JSON");
        exportButton.setEnabled(false);
        exportButton.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View view) {
                chooseExportLocation();
            }
        });
        content.addView(exportButton, matchWidthWrapHeight());

        statusView = new TextView(this);
        statusView.setText("Ready. No key or test vector has been generated in this app session.");
        statusView.setTextIsSelectable(true);
        statusView.setTextSize(15);
        statusView.setPadding(0, padding, 0, 0);
        content.addView(statusView, matchWidthWrapHeight());

        ScrollView scrollView = new ScrollView(this);
        scrollView.addView(content);
        setContentView(scrollView);
    }

    private LinearLayout.LayoutParams matchWidthWrapHeight() {
        return new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT);
    }

    private void generateTestVector() {
        generateButton.setEnabled(false);
        exportButton.setEnabled(false);
        pendingTestVectorJson = null;
        statusView.setText("Generating a fresh AndroidKeyStore test key and signing…");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final AndroidKeystoreSigningPoc.Result result =
                            AndroidKeystoreSigningPoc.generateTestVector();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            pendingTestVectorJson = result.json;
                            statusView.setText(result.summary);
                            generateButton.setEnabled(true);
                            exportButton.setEnabled(true);
                        }
                    });
                } catch (final Exception error) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            statusView.setText("Signing failed: " + safeError(error));
                            generateButton.setEnabled(true);
                            exportButton.setEnabled(false);
                        }
                    });
                }
            }
        }, "credential-poc-signing").start();
    }

    private String safeError(Exception error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName()
                + (message == null || message.length() == 0 ? "" : ": " + message);
    }

    private void chooseExportLocation() {
        if (pendingTestVectorJson == null) {
            statusView.setText("Generate a test vector before export.");
            exportButton.setEnabled(false);
            return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_TITLE, TEST_VECTOR_FILENAME);
        startActivityForResult(intent, CREATE_TEST_VECTOR);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CREATE_TEST_VECTOR || resultCode != RESULT_OK || data == null) {
            return;
        }
        Uri destination = data.getData();
        if (destination == null || pendingTestVectorJson == null) {
            statusView.setText("Export failed: no destination or test vector available.");
            return;
        }
        try (OutputStream output = getContentResolver().openOutputStream(destination, "w")) {
            if (output == null) {
                throw new IllegalStateException("Document output stream is unavailable");
            }
            output.write(pendingTestVectorJson.getBytes(StandardCharsets.UTF_8));
            output.flush();
            statusView.append("\n\nTest-vector JSON exported successfully.");
        } catch (Exception error) {
            statusView.append("\n\nExport failed: " + safeError(error));
        }
    }
}
