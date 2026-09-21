package com.nicron.webview;

import android.app.Activity;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.atomic.AtomicBoolean;

/** Android-only issuer bridge for Credential v1. */
public final class CredentialIssuerBridge {
    public static final String PRODUCTION_ALIAS =
            "samsungdang.dojolog.instructor.credential.v1.active";

    private static final String KEYSTORE_TYPE = "AndroidKeyStore";
    private static final String SIGNATURE_ALGORITHM = "SHA256withECDSA";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Activity activity;
    private final WebView webView;
    private final AtomicBoolean operationRunning = new AtomicBoolean(false);

    public CredentialIssuerBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    @JavascriptInterface
    public void provisionProductionKey() {
        run("provision-key", new Operation() {
            @Override public Result execute() throws Exception {
                KeyMaterial material = loadOrCreateActiveKey();
                return new Result(material.bootstrapJson(), null, null);
            }
        });
    }

    @JavascriptInterface
    public void issueMembershipCredential(
            final String name,
            final String memberId,
            final String joinedAt) {
        run("issue-membership", new Operation() {
            @Override public Result execute() throws Exception {
                CredentialV1.validateMembership(name, memberId, joinedAt);
                KeyMaterial material = loadOrCreateActiveKey();
                byte[] randomBytes = new byte[16];
                RANDOM.nextBytes(randomBytes);
                String credentialId = CredentialV1.credentialId(randomBytes);
                Arrays.fill(randomBytes, (byte) 0);
                String issuedAt = utcNow();
                String signed = CredentialV1.canonicalMembershipSigned(
                        credentialId,
                        material.keyId,
                        issuedAt,
                        name,
                        memberId,
                        joinedAt);
                byte[] signingBytes = signed.getBytes(StandardCharsets.UTF_8);
                Signature signer = Signature.getInstance(SIGNATURE_ALGORITHM);
                signer.initSign(material.privateKey);
                signer.update(signingBytes);
                byte[] derSignature = signer.sign();

                Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM);
                verifier.initVerify(material.publicKey);
                verifier.update(signingBytes);
                if (!verifier.verify(derSignature)) {
                    throw new SecurityException("Android signature self-verification failed");
                }

                byte[] rawSignature = StrictEcdsaDer.toP256Raw(derSignature);
                if (rawSignature.length != 64) {
                    throw new SecurityException("Credential signature is not 64 bytes");
                }
                String signature = CredentialV1.base64Url(rawSignature);
                String credential = CredentialV1.envelope(signed, signature);
                String token = CredentialV1.transportToken(credential);
                String diagnostics = "{"
                        + "\"signatureAlgorithm\":\"SHA256withECDSA\""
                        + ",\"derSignatureByteLength\":" + derSignature.length
                        + ",\"wireSignatureByteLength\":64"
                        + ",\"jcsUtf8ByteLength\":" + signingBytes.length
                        + ",\"signatureSelfVerificationPassed\":true"
                        + ",\"privateKeyEncodedIsNull\":true"
                        + "}";
                Arrays.fill(derSignature, (byte) 0);
                Arrays.fill(rawSignature, (byte) 0);
                return new Result(credential, material.bootstrapJson(), token, diagnostics);
            }
        });
    }

    private void run(final String operation, final Operation task) {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                if (!isTrustedAppPage()) {
                    emit(operation, "error", null, null, null, null,
                            "Credential bridge is unavailable outside the packaged app");
                    return;
                }
                if (!operationRunning.compareAndSet(false, true)) {
                    emit(operation, "error", null, null, null, null,
                            "Another credential operation is already running");
                    return;
                }
                new Thread(new Runnable() {
                    @Override public void run() {
                        try {
                            Result result = task.execute();
                            emit(operation, "success", result.json, result.bootstrap,
                                    result.transportToken, result.diagnostics, null);
                        } catch (Exception error) {
                            emit(operation, "error", null, null, null, null, safeError(error));
                        } finally {
                            operationRunning.set(false);
                        }
                    }
                }, "credential-v1-issuer").start();
            }
        });
    }

    private synchronized KeyMaterial loadOrCreateActiveKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_TYPE);
        keyStore.load(null);
        boolean generated = false;
        if (!keyStore.containsAlias(PRODUCTION_ALIAS)) {
            KeyPairGenerator generator = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_TYPE);
            generator.initialize(new KeyGenParameterSpec.Builder(
                    PRODUCTION_ALIAS,
                    KeyProperties.PURPOSE_SIGN)
                    .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                    .setDigests(KeyProperties.DIGEST_SHA256)
                    .setUserAuthenticationRequired(false)
                    .build());
            generator.generateKeyPair();
            generated = true;
        }

        Key key = keyStore.getKey(PRODUCTION_ALIAS, null);
        Certificate certificate = keyStore.getCertificate(PRODUCTION_ALIAS);
        if (!(key instanceof PrivateKey) || certificate == null) {
            throw new IllegalStateException("EXISTING_ALIAS_CONFLICT: signing entry unavailable");
        }
        PrivateKey privateKey = (PrivateKey) key;
        PublicKey publicKey = certificate.getPublicKey();
        if (!(publicKey instanceof ECPublicKey)
                || ((ECPublicKey) publicKey).getParams().getCurve().getField().getFieldSize() != 256) {
            throw new IllegalStateException("EXISTING_ALIAS_CONFLICT: expected EC P-256 key");
        }
        byte[] privateEncoded = privateKey.getEncoded();
        if (privateEncoded != null) {
            Arrays.fill(privateEncoded, (byte) 0);
            throw new SecurityException("AndroidKeyStore private key was unexpectedly exportable");
        }
        byte[] spki = publicKey.getEncoded();
        if (spki == null || spki.length == 0 || !"X.509".equals(publicKey.getFormat())) {
            throw new IllegalStateException("X.509 SPKI public key encoding unavailable");
        }

        Signature capability = Signature.getInstance(SIGNATURE_ALGORITHM);
        capability.initSign(privateKey);
        String keyId = CredentialV1.keyId(spki);
        String bootstrap = CredentialV1.bootstrapJson(
                keyId, spki, generated ? "generated" : "reused", true);
        return new KeyMaterial(privateKey, publicKey, keyId, bootstrap);
    }

    private boolean isTrustedAppPage() {
        String url = webView == null ? null : webView.getUrl();
        return url != null && url.startsWith("https://appassets.androidplatform.net/");
    }

    private String utcNow() {
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        return format.format(new Date());
    }

    private String safeError(Exception error) {
        String message = error.getMessage();
        return error.getClass().getSimpleName()
                + (message == null || message.length() == 0 ? "" : ": " + message);
    }

    private void emit(
            final String operation,
            final String status,
            final String json,
            final String bootstrap,
            final String transportToken,
            final String diagnostics,
            final String message) {
        activity.runOnUiThread(new Runnable() {
            @Override public void run() {
                if (webView == null) return;
                String script = "window.dispatchEvent(new CustomEvent('samsungdang-credential-result',{detail:{operation:"
                        + JSONObject.quote(operation) + ",status:" + JSONObject.quote(status)
                        + field("json", json)
                        + field("bootstrap", bootstrap)
                        + field("transportToken", transportToken)
                        + field("diagnostics", diagnostics)
                        + field("message", message)
                        + "}}))";
                webView.evaluateJavascript(script, null);
            }
        });
    }

    private String field(String name, String value) {
        return value == null ? "" : "," + JSONObject.quote(name) + ":" + JSONObject.quote(value);
    }

    private interface Operation {
        Result execute() throws Exception;
    }

    private static final class Result {
        final String json;
        final String bootstrap;
        final String transportToken;
        final String diagnostics;

        Result(String json, String bootstrap, String transportToken) {
            this(json, bootstrap, transportToken, null);
        }

        Result(String json, String bootstrap, String transportToken, String diagnostics) {
            this.json = json;
            this.bootstrap = bootstrap;
            this.transportToken = transportToken;
            this.diagnostics = diagnostics;
        }
    }

    private static final class KeyMaterial {
        final PrivateKey privateKey;
        final PublicKey publicKey;
        final String keyId;
        final String bootstrap;

        KeyMaterial(PrivateKey privateKey, PublicKey publicKey, String keyId, String bootstrap) {
            this.privateKey = privateKey;
            this.publicKey = publicKey;
            this.keyId = keyId;
            this.bootstrap = bootstrap;
        }

        String bootstrapJson() {
            return bootstrap;
        }
    }
}
