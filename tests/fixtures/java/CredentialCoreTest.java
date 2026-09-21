package com.nicron.webview;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.util.Arrays;
import java.util.Base64;

public final class CredentialCoreTest {
    public static void main(String[] args) throws Exception {
        byte[] random = new byte[16];
        for (int index = 0; index < random.length; index++) random[index] = (byte) index;
        String credentialId = CredentialV1.credentialId(random);
        require(credentialId.equals("c1_AAECAwQFBgcICQoLDA0ODw"), "credentialId encoding");
        expectFailure(() -> CredentialV1.credentialId(new byte[15]), "credentialId length");

        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"));
        KeyPair keyPair = generator.generateKeyPair();
        byte[] spki = keyPair.getPublic().getEncoded();
        String expectedKeyId = "k1_" + Base64.getUrlEncoder().withoutPadding().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(spki));
        String keyId = CredentialV1.keyId(spki);
        require(keyId.equals(expectedKeyId), "keyId derivation");

        String name = "테스트회원\n\"\\😀";
        String canonical = CredentialV1.canonicalMembershipSigned(
                credentialId, keyId, "2026-09-21T08:30:00Z",
                name, "ASD-000", "2026-09-21");
        String expected = "{\"credentialId\":\"c1_AAECAwQFBgcICQoLDA0ODw\",\"credentialVersion\":1,"
                + "\"issuedAt\":\"2026-09-21T08:30:00Z\",\"issuer\":\"aikido-samsungdang\","
                + "\"keyId\":\"" + keyId + "\",\"payload\":{\"joinedAt\":\"2026-09-21\","
                + "\"memberId\":\"ASD-000\",\"name\":\"테스트회원\\n\\\"\\\\😀\"},"
                + "\"schema\":\"samsungdang-dojolog-credential\",\"type\":\"membership\"}";
        require(canonical.equals(expected), "credential-specific RFC 8785 serialization");
        expectFailure(() -> CredentialV1.canonicalMembershipSigned(
                credentialId, keyId, "2026-09-21T08:30:60Z",
                name, "ASD-000", "2026-09-21"), "invalid UTC second");
        expectFailure(() -> CredentialV1.validateMembership("회원", "ASD-X01", "2026-09-21"), "memberId");
        expectFailure(() -> CredentialV1.validateMembership("회원", "ASD-001", "2026-02-30"), "joinedAt");
        expectFailure(() -> CredentialV1.validateMembership("invalid\ud800", "ASD-001", "2026-09-21"), "invalid Unicode");

        byte[] signedBytes = canonical.getBytes(StandardCharsets.UTF_8);
        Signature signer = Signature.getInstance("SHA256withECDSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(signedBytes);
        byte[] der = signer.sign();
        byte[] raw = StrictEcdsaDer.toP256Raw(der);
        require(raw.length == 64, "DER to fixed-width P-256 r||s");
        String rawText = CredentialV1.base64Url(raw);
        require(!rawText.contains("=") && rawText.length() == 86, "unpadded signature base64url");
        String envelope = CredentialV1.envelope(canonical, rawText);
        String token = CredentialV1.transportToken(envelope);
        require(!token.contains("="), "unpadded transport token");

        Signature verifier = Signature.getInstance("SHA256withECDSA");
        verifier.initVerify(keyPair.getPublic());
        verifier.update(signedBytes);
        require(verifier.verify(der), "signature self verification");
        verifier.initVerify(keyPair.getPublic());
        verifier.update((canonical + " ").getBytes(StandardCharsets.UTF_8));
        require(!verifier.verify(der), "signed field tamper rejection");

        expectFailure(() -> StrictEcdsaDer.toP256Raw(Arrays.copyOf(der, der.length + 1)), "trailing DER bytes");
        expectFailure(() -> StrictEcdsaDer.toP256Raw(new byte[]{0x30, 0x06, 0x02, 0x01, 0, 0x02, 0x01, 1}), "zero r");
        expectFailure(() -> StrictEcdsaDer.toP256Raw(new byte[]{0x30, 0x06, 0x02, 0x01, (byte) 0x80, 0x02, 0x01, 1}), "negative r");
        expectFailure(() -> StrictEcdsaDer.toP256Raw(new byte[]{0x30, 0x07, 0x02, 0x02, 0, 1, 0x02, 0x01, 1}), "non-minimal r");
        byte[] oversized = new byte[40];
        oversized[0] = 0x30;
        oversized[1] = 0x26;
        oversized[2] = 0x02;
        oversized[3] = 0x21;
        oversized[4] = 1;
        oversized[37] = 0x02;
        oversized[38] = 0x01;
        oversized[39] = 0x01;
        expectFailure(() -> StrictEcdsaDer.toP256Raw(oversized), "oversized r");

        String bootstrap = CredentialV1.bootstrapJson(keyId, spki, "generated", true);
        require(bootstrap.contains("\"publicKeySpkiBase64Url\""), "bootstrap public key");
        require(!bootstrap.contains("privateKeyBytes") && !bootstrap.contains("privateKeyBase64"), "no private material");
        expectFailure(() -> CredentialV1.bootstrapJson(keyId, spki, "generated", false), "private key export guard");

        System.out.println("CredentialCoreTest PASS");
    }

    private static void require(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }

    private static void expectFailure(CheckedRunnable operation, String label) throws Exception {
        try {
            operation.run();
            throw new AssertionError("expected failure: " + label);
        } catch (IllegalArgumentException | SecurityException expected) {
            // Expected fail-closed behavior.
        }
    }

    private interface CheckedRunnable {
        void run() throws Exception;
    }
}
