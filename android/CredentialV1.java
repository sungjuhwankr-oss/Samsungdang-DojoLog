package com.nicron.webview;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.regex.Pattern;

/** Credential v1 validation, JCS serialization and binary text formats. */
public final class CredentialV1 {
    public static final String SCHEMA = "samsungdang-dojolog-credential";
    public static final int VERSION = 1;
    public static final String ISSUER = "aikido-samsungdang";
    public static final String TYPE_MEMBERSHIP = "membership";
    public static final String BOOTSTRAP_SCHEMA =
            "samsungdang-dojolog-trusted-key-bootstrap";

    private static final Pattern MEMBER_ID = Pattern.compile("ASD-[0-9]{3}");
    private static final Pattern KEY_ID = Pattern.compile("k1_[A-Za-z0-9_-]{43}");
    private static final Pattern CREDENTIAL_ID = Pattern.compile("c1_[A-Za-z0-9_-]{22}");
    private static final Pattern ISSUED_AT = Pattern.compile(
            "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z");
    private static final char[] BASE64_URL =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".toCharArray();

    private CredentialV1() {
    }

    public static void validateMembership(String name, String memberId, String joinedAt) {
        requireValidUnicode(name, "name");
        if (name.trim().length() == 0) {
            throw new IllegalArgumentException("name must not be blank");
        }
        if (name.length() > 200) {
            throw new IllegalArgumentException("name is too long");
        }
        if (memberId == null || !MEMBER_ID.matcher(memberId).matches()) {
            throw new IllegalArgumentException("memberId must match ASD-000");
        }
        if (!isCalendarDate(joinedAt)) {
            throw new IllegalArgumentException("joinedAt must be a real YYYY-MM-DD date");
        }
    }

    public static String credentialId(byte[] randomBytes) {
        if (randomBytes == null || randomBytes.length != 16) {
            throw new IllegalArgumentException("credentialId requires exactly 16 random bytes");
        }
        return "c1_" + base64Url(randomBytes);
    }

    public static String keyId(byte[] spkiDer) throws Exception {
        if (spkiDer == null || spkiDer.length == 0) {
            throw new IllegalArgumentException("SPKI DER is required");
        }
        return "k1_" + base64Url(MessageDigest.getInstance("SHA-256").digest(spkiDer));
    }

    /**
     * Credential-specific RFC 8785 serialization.
     *
     * Credential v1 has one fixed number (credentialVersion=1); every other
     * signed value is a validated string or the fixed nested payload object.
     * Keys below are emitted in ECMAScript UTF-16 lexical order as required by
     * JCS, and strings use the RFC 8785 / JSON.stringify escaping rules.
     */
    public static String canonicalMembershipSigned(
            String credentialId,
            String keyId,
            String issuedAt,
            String name,
            String memberId,
            String joinedAt) {
        validateMembership(name, memberId, joinedAt);
        if (credentialId == null || !CREDENTIAL_ID.matcher(credentialId).matches()) {
            throw new IllegalArgumentException("invalid credentialId");
        }
        if (keyId == null || !KEY_ID.matcher(keyId).matches()) {
            throw new IllegalArgumentException("invalid keyId");
        }
        if (!isUtcSecond(issuedAt)) {
            throw new IllegalArgumentException("issuedAt must be a real UTC second");
        }

        return "{\"credentialId\":" + quote(credentialId)
                + ",\"credentialVersion\":1"
                + ",\"issuedAt\":" + quote(issuedAt)
                + ",\"issuer\":" + quote(ISSUER)
                + ",\"keyId\":" + quote(keyId)
                + ",\"payload\":{\"joinedAt\":" + quote(joinedAt)
                + ",\"memberId\":" + quote(memberId)
                + ",\"name\":" + quote(name) + "}"
                + ",\"schema\":" + quote(SCHEMA)
                + ",\"type\":" + quote(TYPE_MEMBERSHIP) + "}";
    }

    public static String envelope(String canonicalSigned, String signatureBase64Url) {
        if (canonicalSigned == null || canonicalSigned.length() == 0) {
            throw new IllegalArgumentException("canonical signed object is required");
        }
        requireCanonicalBase64Url(signatureBase64Url, 64, "signature");
        return "{\"signed\":" + canonicalSigned
                + ",\"signature\":" + quote(signatureBase64Url) + "}";
    }

    public static String transportToken(String compactCredentialJson) {
        if (compactCredentialJson == null || compactCredentialJson.length() == 0) {
            throw new IllegalArgumentException("credential JSON is required");
        }
        return base64Url(compactCredentialJson.getBytes(StandardCharsets.UTF_8));
    }

    public static String bootstrapJson(
            String keyId,
            byte[] spkiDer,
            String provisioning,
            boolean privateKeyEncodedIsNull) {
        if (keyId == null || !KEY_ID.matcher(keyId).matches()) {
            throw new IllegalArgumentException("invalid keyId");
        }
        if (spkiDer == null || spkiDer.length == 0) {
            throw new IllegalArgumentException("SPKI DER is required");
        }
        if (!"generated".equals(provisioning) && !"reused".equals(provisioning)) {
            throw new IllegalArgumentException("invalid provisioning diagnostic");
        }
        if (!privateKeyEncodedIsNull) {
            throw new SecurityException("private key must remain non-exportable");
        }
        return "{"
                + "\"schema\":" + quote(BOOTSTRAP_SCHEMA)
                + ",\"schemaVersion\":1"
                + ",\"purpose\":\"credential-v1-initial-trust-provisioning\""
                + ",\"keyId\":" + quote(keyId)
                + ",\"algorithm\":\"ECDSA-SHA-256\""
                + ",\"curve\":\"P-256\""
                + ",\"publicKeyFormat\":\"X.509 SubjectPublicKeyInfo DER\""
                + ",\"publicKeySpkiBase64Url\":" + quote(base64Url(spkiDer))
                + ",\"publicKeyByteLength\":" + spkiDer.length
                + ",\"trustStatus\":\"pending-member-pwa-distribution\""
                + ",\"intendedRegistryStatus\":\"active\""
                + ",\"generatedOrReused\":" + quote(provisioning)
                + ",\"androidKeyStoreUsed\":true"
                + ",\"privateKeyEncodedIsNull\":true"
                + "}";
    }

    public static String base64Url(byte[] input) {
        if (input == null) {
            throw new IllegalArgumentException("bytes are required");
        }
        StringBuilder output = new StringBuilder((input.length * 4 + 2) / 3);
        int index = 0;
        while (index + 3 <= input.length) {
            int value = ((input[index] & 0xff) << 16)
                    | ((input[index + 1] & 0xff) << 8)
                    | (input[index + 2] & 0xff);
            output.append(BASE64_URL[(value >>> 18) & 0x3f]);
            output.append(BASE64_URL[(value >>> 12) & 0x3f]);
            output.append(BASE64_URL[(value >>> 6) & 0x3f]);
            output.append(BASE64_URL[value & 0x3f]);
            index += 3;
        }
        int remaining = input.length - index;
        if (remaining == 1) {
            int value = (input[index] & 0xff) << 16;
            output.append(BASE64_URL[(value >>> 18) & 0x3f]);
            output.append(BASE64_URL[(value >>> 12) & 0x3f]);
        } else if (remaining == 2) {
            int value = ((input[index] & 0xff) << 16) | ((input[index + 1] & 0xff) << 8);
            output.append(BASE64_URL[(value >>> 18) & 0x3f]);
            output.append(BASE64_URL[(value >>> 12) & 0x3f]);
            output.append(BASE64_URL[(value >>> 6) & 0x3f]);
        }
        return output.toString();
    }

    public static void requireCanonicalBase64Url(String value, int expectedBytes, String field) {
        if (value == null || value.indexOf('=') >= 0 || !value.matches("[A-Za-z0-9_-]+")) {
            throw new IllegalArgumentException(field + " must be unpadded base64url");
        }
        int encodedLength = (expectedBytes * 8 + 5) / 6;
        if (value.length() != encodedLength) {
            throw new IllegalArgumentException(field + " has an unexpected byte length");
        }
    }

    public static String quote(String value) {
        requireValidUnicode(value, "JSON string");
        StringBuilder output = new StringBuilder(value.length() + 2);
        output.append('"');
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            switch (character) {
                case '"': output.append("\\\""); break;
                case '\\': output.append("\\\\"); break;
                case '\b': output.append("\\b"); break;
                case '\t': output.append("\\t"); break;
                case '\n': output.append("\\n"); break;
                case '\f': output.append("\\f"); break;
                case '\r': output.append("\\r"); break;
                default:
                    if (character <= 0x001f) {
                        output.append("\\u00");
                        output.append(Character.forDigit((character >>> 4) & 0xf, 16));
                        output.append(Character.forDigit(character & 0xf, 16));
                    } else {
                        output.append(character);
                    }
            }
        }
        output.append('"');
        return output.toString();
    }

    private static void requireValidUnicode(String value, String field) {
        if (value == null) {
            throw new IllegalArgumentException(field + " is required");
        }
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (Character.isHighSurrogate(character)) {
                if (index + 1 >= value.length()
                        || !Character.isLowSurrogate(value.charAt(index + 1))) {
                    throw new IllegalArgumentException(field + " contains an unpaired surrogate");
                }
                index += 1;
            } else if (Character.isLowSurrogate(character)) {
                throw new IllegalArgumentException(field + " contains an unpaired surrogate");
            }
        }
    }

    private static boolean isUtcSecond(String value) {
        if (value == null || !ISSUED_AT.matcher(value).matches()) return false;
        if (!isCalendarDate(value.substring(0, 10))) return false;
        int hour = Integer.parseInt(value.substring(11, 13));
        int minute = Integer.parseInt(value.substring(14, 16));
        int second = Integer.parseInt(value.substring(17, 19));
        return hour <= 23 && minute <= 59 && second <= 59;
    }

    private static boolean isCalendarDate(String value) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return false;
        int year = Integer.parseInt(value.substring(0, 4));
        int month = Integer.parseInt(value.substring(5, 7));
        int day = Integer.parseInt(value.substring(8, 10));
        if (year < 1 || month < 1 || month > 12 || day < 1) return false;
        int[] days = {31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30,
                31, 31, 30, 31, 30, 31};
        return day <= days[month - 1];
    }

    private static boolean isLeapYear(int year) {
        return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    }
}
