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
import java.util.HashSet;
import java.util.Iterator;
import java.util.Locale;
import java.util.Set;
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
                return signCredential("membership", new SignedFactory() {
                    @Override public String create(
                            String credentialId, String keyId, String issuedAt) {
                        return CredentialV1.canonicalMembershipSigned(
                                credentialId, keyId, issuedAt, name, memberId, joinedAt);
                    }
                });
            }
        });
    }

    @JavascriptInterface
    public void issuePromotionCredential(final String payloadJson) {
        run("issue-promotion", new Operation() {
            @Override public Result execute() throws Exception {
                final PromotionRequest request = PromotionRequest.parse(payloadJson);
                return signCredential("promotion", new SignedFactory() {
                    @Override public String create(
                            String credentialId, String keyId, String issuedAt) {
                        return request.canonicalSigned(credentialId, keyId, issuedAt);
                    }
                });
            }
        });
    }

    private Result signCredential(String credentialType, SignedFactory factory) throws Exception {
        KeyMaterial material = loadOrCreateActiveKey();
        byte[] randomBytes = new byte[16];
        RANDOM.nextBytes(randomBytes);
        String credentialId = CredentialV1.credentialId(randomBytes);
        Arrays.fill(randomBytes, (byte) 0);
        String issuedAt = utcNow();
        String signed = factory.create(credentialId, material.keyId, issuedAt);
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
                + "\"credentialType\":" + JSONObject.quote(credentialType)
                + ",\"signatureAlgorithm\":\"SHA256withECDSA\""
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

    private interface SignedFactory {
        String create(String credentialId, String keyId, String issuedAt);
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

    private static final class PromotionRequest {
        final String eventType;
        final String mode;
        final String examDate;
        final String memberId;
        final String rankDate;
        final String recognizedAt;
        final String rankType;
        final long rankValue;

        PromotionRequest(
                String eventType,
                String mode,
                String examDate,
                String memberId,
                String rankDate,
                String recognizedAt,
                String rankType,
                long rankValue) {
            this.eventType = eventType;
            this.mode = mode;
            this.examDate = examDate;
            this.memberId = memberId;
            this.rankDate = rankDate;
            this.recognizedAt = recognizedAt;
            this.rankType = rankType;
            this.rankValue = rankValue;
        }

        static PromotionRequest parse(String json) throws Exception {
            if (json == null || json.length() == 0) {
                throw new IllegalArgumentException("promotion payload is required");
            }
            JSONObject payload = new JSONObject(json);
            String eventType = requireString(payload, "eventType");
            String mode = requireString(payload, "mode");
            if ("promoted".equals(eventType) && "advance-one".equals(mode)) {
                requireExactKeys(payload, "eventType", "examDate", "mode");
                String examDate = requireString(payload, "examDate");
                CredentialV1.validatePromotionAdvanceOne(examDate);
                return new PromotionRequest(eventType, mode, examDate,
                        null, null, null, null, 0);
            }
            if ("promoted".equals(eventType) && "target".equals(mode)) {
                requireExactKeys(payload, "eventType", "examDate", "mode", "targetRank");
                String examDate = requireString(payload, "examDate");
                Rank rank = parseRank(requireObject(payload, "targetRank"));
                CredentialV1.validatePromotionTarget(examDate, rank.type, rank.value);
                return new PromotionRequest(eventType, mode, examDate,
                        null, null, null, rank.type, rank.value);
            }
            if ("recognized-at-entry".equals(eventType) && "target".equals(mode)) {
                requireExactKeys(payload, "eventType", "memberId", "mode", "rankDate",
                        "recognizedAt", "targetRank");
                String memberId = requireString(payload, "memberId");
                Object rankDateValue = payload.get("rankDate");
                String rankDate;
                if (rankDateValue == JSONObject.NULL) {
                    rankDate = null;
                } else if (rankDateValue instanceof String) {
                    rankDate = (String) rankDateValue;
                } else {
                    throw new IllegalArgumentException("rankDate must be a string or null");
                }
                String recognizedAt = requireString(payload, "recognizedAt");
                Rank rank = parseRank(requireObject(payload, "targetRank"));
                CredentialV1.validatePromotionRecognizedAtEntry(
                        memberId, rankDate, recognizedAt, rank.type, rank.value);
                return new PromotionRequest(eventType, mode, null,
                        memberId, rankDate, recognizedAt, rank.type, rank.value);
            }
            throw new IllegalArgumentException("invalid promotion eventType/mode combination");
        }

        String canonicalSigned(String credentialId, String keyId, String issuedAt) {
            if ("promoted".equals(eventType) && "advance-one".equals(mode)) {
                return CredentialV1.canonicalPromotionAdvanceOneSigned(
                        credentialId, keyId, issuedAt, examDate);
            }
            if ("promoted".equals(eventType)) {
                return CredentialV1.canonicalPromotionTargetSigned(
                        credentialId, keyId, issuedAt, examDate, rankType, rankValue);
            }
            return CredentialV1.canonicalPromotionRecognizedAtEntrySigned(
                    credentialId, keyId, issuedAt, memberId, rankDate,
                    recognizedAt, rankType, rankValue);
        }

        private static Rank parseRank(JSONObject rank) throws Exception {
            requireExactKeys(rank, "rankType", "rankValue");
            String type = requireString(rank, "rankType");
            Object value = rank.get("rankValue");
            if (!(value instanceof Integer) && !(value instanceof Long)) {
                throw new IllegalArgumentException("rankValue must be an integer");
            }
            return new Rank(type, ((Number) value).longValue());
        }

        private static JSONObject requireObject(JSONObject object, String key) throws Exception {
            Object value = object.get(key);
            if (!(value instanceof JSONObject)) {
                throw new IllegalArgumentException(key + " must be an object");
            }
            return (JSONObject) value;
        }

        private static String requireString(JSONObject object, String key) throws Exception {
            Object value = object.get(key);
            if (!(value instanceof String)) {
                throw new IllegalArgumentException(key + " must be a string");
            }
            return (String) value;
        }

        private static void requireExactKeys(JSONObject object, String... expected) {
            Set<String> keys = new HashSet<String>();
            Iterator<String> iterator = object.keys();
            while (iterator.hasNext()) keys.add(iterator.next());
            Set<String> expectedKeys = new HashSet<String>(Arrays.asList(expected));
            if (!keys.equals(expectedKeys)) {
                throw new IllegalArgumentException("promotion payload fields are invalid");
            }
        }

        private static final class Rank {
            final String type;
            final long value;

            Rank(String type, long value) {
                this.type = type;
                this.value = value;
            }
        }
    }
}
