package kr.or.aikido.samsungdang.dojolog.credentialpoc;

import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.widget.LinearLayout;
import android.widget.TextView;

/**
 * Independent native shell for the credential-signing PoC.
 *
 * Phase 4G-A1 intentionally has no Android Keystore, credential, or signing
 * implementation. A later approved phase may add that work only in this
 * separate app, never by reusing the instructor production identity.
 */
public final class CredentialSigningPocActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER_VERTICAL);
        content.setPadding(padding, padding, padding, padding);

        TextView title = new TextView(this);
        title.setText("Samsungdang DojoLog\nCredential Signing PoC");
        title.setTextSize(24);
        title.setTextColor(Color.rgb(23, 92, 69));
        content.addView(title);

        TextView details = new TextView(this);
        details.setText("dev/test only\n\n"
                + "Version: " + BuildInfo.VERSION_NAME + " (" + BuildInfo.VERSION_CODE + ")\n"
                + "Build: " + BuildInfo.BUILD_LABEL + "\n\n"
                + "Phase 4G-A1: APK build/install delivery path only.\n"
                + "Android Keystore credential signing is not implemented.");
        details.setTextSize(16);
        details.setPadding(0, padding, 0, 0);
        content.addView(details);

        setContentView(content);
    }
}
