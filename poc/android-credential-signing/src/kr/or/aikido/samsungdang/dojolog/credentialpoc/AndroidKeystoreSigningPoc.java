package kr.or.aikido.samsungdang.dojolog.credentialpoc;

import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.security.cert.Certificate;
import java.security.interfaces.ECPublicKey;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;

/**
 * Phase 4G-A2 test-only Android Keystore signing probe.
 *
 * Candidate algorithms and transport encodings here are observations for an
 * interoperability PoC. They do not define the final Credential v1 format.
 */
public final class AndroidKeystoreSigningPoc {
    public static final String KEY_ALIAS =
            "samsungdang.dojolog.credentialpoc.4g-a2.test-only";
    public static final String TEST_INPUT =
            "Samsungdang DojoLog | Android Keystore PoC | 한글 UTF-8 | 2026-09-21";

    private static final String KEYSTORE_TYPE = "AndroidKeyStore";
    private static final String CURVE_CANDIDATE = "secp256r1 (P-256)";
    private static final String SIGNATURE_ALGORITHM_CANDIDATE = "SHA256withECDSA";

    private AndroidKeystoreSigningPoc() {
    }

    public static Result generateTestVector() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE_TYPE);
        keyStore.load(null);

        boolean replacedExistingAlias = keyStore.containsAlias(KEY_ALIAS);
        if (replacedExistingAlias) {
            keyStore.deleteEntry(KEY_ALIAS);
        }

        KeyPairGenerator generator = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC, KEYSTORE_TYPE);
        generator.initialize(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN | KeyProperties.PURPOSE_VERIFY)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build());
        generator.generateKeyPair();

        Key storedKey = keyStore.getKey(KEY_ALIAS, null);
        if (!(storedKey instanceof PrivateKey)) {
            throw new IllegalStateException("AndroidKeyStore private key is unavailable");
        }
        PrivateKey privateKey = (PrivateKey) storedKey;
        Certificate certificate = keyStore.getCertificate(KEY_ALIAS);
        if (certificate == null) {
            throw new IllegalStateException("AndroidKeyStore certificate is unavailable");
        }
        PublicKey publicKey = certificate.getPublicKey();
        if (!(publicKey instanceof ECPublicKey)) {
            throw new IllegalStateException("Generated public key is not EC");
        }
        int curveFieldSizeBits = ((ECPublicKey) publicKey)
                .getParams().getCurve().getField().getFieldSize();
        if (curveFieldSizeBits != 256) {
            throw new IllegalStateException("Unexpected EC field size: " + curveFieldSizeBits);
        }

        byte[] privateKeyEncoded = privateKey.getEncoded();
        boolean privateKeyEncodedIsNull = privateKeyEncoded == null;
        if (!privateKeyEncodedIsNull) {
            Arrays.fill(privateKeyEncoded, (byte) 0);
            throw new SecurityException("AndroidKeyStore private key was unexpectedly exportable");
        }

        byte[] inputBytes = TEST_INPUT.getBytes(StandardCharsets.UTF_8);
        Signature signer = Signature.getInstance(SIGNATURE_ALGORITHM_CANDIDATE);
        signer.initSign(privateKey);
        signer.update(inputBytes);
        byte[] signatureBytes = signer.sign();
        byte[] publicKeyBytes = publicKey.getEncoded();
        if (publicKeyBytes == null || publicKeyBytes.length == 0) {
            throw new IllegalStateException("Public key encoding is unavailable");
        }
        Signature verifier = Signature.getInstance(SIGNATURE_ALGORITHM_CANDIDATE);
        verifier.initVerify(publicKey);
        verifier.update(inputBytes);
        boolean signatureSelfVerificationPassed = verifier.verify(signatureBytes);
        if (!signatureSelfVerificationPassed) {
            throw new IllegalStateException("Generated signature failed public-key verification");
        }

        JSONObject vector = new JSONObject();
        vector.put("schema", "samsungdang-dojolog-android-keystore-poc-test-vector");
        vector.put("schemaVersion", 1);
        vector.put("pocPhase", "4G-A2");
        vector.put("pocStatus", "candidate-not-credential-v1");
        vector.put("appVersionName", BuildInfo.VERSION_NAME);
        vector.put("appVersionCode", BuildInfo.VERSION_CODE);
        vector.put("keyAlias", KEY_ALIAS);
        vector.put("replacedExistingAlias", replacedExistingAlias);
        vector.put("androidKeyStoreUsed", true);
        vector.put("keyStoreType", KEYSTORE_TYPE);
        vector.put("keyStoreProvider", keyStore.getProvider().getName());
        vector.put("keyPairGeneratorProvider", generator.getProvider().getName());
        vector.put("keyAlgorithmCandidate", KeyProperties.KEY_ALGORITHM_EC);
        vector.put("curveCandidate", CURVE_CANDIDATE);
        vector.put("curveFieldSizeBits", curveFieldSizeBits);
        vector.put("signatureAlgorithmCandidate", SIGNATURE_ALGORITHM_CANDIDATE);
        vector.put("signatureAlgorithmObserved", signer.getAlgorithm());
        vector.put("signatureProvider", signer.getProvider().getName());
        vector.put("verificationProvider", verifier.getProvider().getName());
        vector.put("inputText", TEST_INPUT);
        vector.put("inputUtf8Base64Url", base64Url(inputBytes));
        vector.put("inputUtf8ByteLength", inputBytes.length);
        vector.put("base64UrlPadding", false);
        vector.put("publicKeyAlgorithm", publicKey.getAlgorithm());
        vector.put("publicKeyFormat", nullable(publicKey.getFormat()));
        vector.put("publicKeyEncodingDiagnostic",
                "PublicKey.getEncoded() bytes; runtime format reported by PublicKey.getFormat()");
        vector.put("publicKeyBase64Url", base64Url(publicKeyBytes));
        vector.put("publicKeyByteLength", publicKeyBytes.length);
        vector.put("signatureEncodingDiagnostic",
                "Raw bytes returned by java.security.Signature.sign(); not normalized or converted");
        vector.put("signatureBase64Url", base64Url(signatureBytes));
        vector.put("signatureByteLength", signatureBytes.length);
        vector.put("signatureSelfVerificationPassed", signatureSelfVerificationPassed);
        vector.put("privateKeyPresent", true);
        vector.put("privateKeyAlgorithm", privateKey.getAlgorithm());
        vector.put("privateKeyFormat", nullable(privateKey.getFormat()));
        vector.put("privateKeyImplementationClass", privateKey.getClass().getName());
        vector.put("privateKeyProviderDiagnostic",
                "PrivateKey has no getProvider(); AndroidKeyStore provider and implementation class recorded");
        vector.put("privateKeyEncodedIsNull", privateKeyEncodedIsNull);
        vector.put("androidSdkLevel", Build.VERSION.SDK_INT);

        String summary = "Phase 4G-A2 signing succeeded.\n\n"
                + "AndroidKeyStore key: generated"
                + (replacedExistingAlias ? " (previous PoC alias replaced)" : "") + "\n"
                + "Alias: " + KEY_ALIAS + "\n"
                + "Candidate: EC / " + CURVE_CANDIDATE + " / "
                + SIGNATURE_ALGORITHM_CANDIDATE + "\n"
                + "Private key non-export: " + privateKeyEncodedIsNull + "\n"
                + "Public key: " + publicKeyBytes.length + " bytes, format "
                + publicKey.getFormat() + "\n"
                + "Signature: " + signatureBytes.length + " raw provider bytes\n\n"
                + "Public test-vector JSON is ready for export.";
        return new Result(vector.toString(2), summary);
    }

    private static String base64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
    }

    private static Object nullable(String value) {
        return value == null ? JSONObject.NULL : value;
    }

    public static final class Result {
        public final String json;
        public final String summary;

        Result(String json, String summary) {
            this.json = json;
            this.summary = summary;
        }
    }
}
