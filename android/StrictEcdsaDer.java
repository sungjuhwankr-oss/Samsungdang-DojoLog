package com.nicron.webview;

import java.util.Arrays;

/** Strict ASN.1 DER ECDSA parser for P-256 signatures. */
public final class StrictEcdsaDer {
    private StrictEcdsaDer() {
    }

    public static byte[] toP256Raw(byte[] der) {
        if (der == null) throw new IllegalArgumentException("DER signature is required");
        Cursor cursor = new Cursor(der);
        cursor.requireTag(0x30, "SEQUENCE");
        int sequenceLength = cursor.readLength();
        int sequenceEnd = cursor.position + sequenceLength;
        if (sequenceEnd != der.length) {
            throw new IllegalArgumentException("DER SEQUENCE length or trailing bytes invalid");
        }
        byte[] r = cursor.readPositiveInteger("r");
        byte[] s = cursor.readPositiveInteger("s");
        if (cursor.position != sequenceEnd) {
            throw new IllegalArgumentException("unexpected ECDSA DER structure");
        }
        byte[] raw = new byte[64];
        System.arraycopy(r, 0, raw, 32 - r.length, r.length);
        System.arraycopy(s, 0, raw, 64 - s.length, s.length);
        return raw;
    }

    private static final class Cursor {
        private final byte[] bytes;
        private int position;

        Cursor(byte[] bytes) {
            this.bytes = bytes;
        }

        void requireTag(int expected, String label) {
            if (position >= bytes.length || (bytes[position++] & 0xff) != expected) {
                throw new IllegalArgumentException("expected DER " + label);
            }
        }

        int readLength() {
            if (position >= bytes.length) throw new IllegalArgumentException("missing DER length");
            int first = bytes[position++] & 0xff;
            if (first < 0x80) return checkedAvailable(first);
            int count = first & 0x7f;
            if (count == 0) throw new IllegalArgumentException("indefinite DER length is forbidden");
            if (count > 2 || position + count > bytes.length) {
                throw new IllegalArgumentException("invalid DER long-form length");
            }
            if ((bytes[position] & 0xff) == 0) {
                throw new IllegalArgumentException("non-minimal DER long-form length");
            }
            int length = 0;
            for (int index = 0; index < count; index++) {
                length = (length << 8) | (bytes[position++] & 0xff);
            }
            if (length < 0x80) {
                throw new IllegalArgumentException("non-minimal DER length encoding");
            }
            return checkedAvailable(length);
        }

        private int checkedAvailable(int length) {
            if (length < 0 || length > bytes.length - position) {
                throw new IllegalArgumentException("DER length exceeds input");
            }
            return length;
        }

        byte[] readPositiveInteger(String label) {
            requireTag(0x02, "INTEGER " + label);
            int length = readLength();
            if (length == 0) throw new IllegalArgumentException(label + " INTEGER is empty");
            int start = position;
            int first = bytes[start] & 0xff;
            if ((first & 0x80) != 0) {
                throw new IllegalArgumentException(label + " INTEGER is negative");
            }
            if (length > 1 && first == 0 && (bytes[start + 1] & 0x80) == 0) {
                throw new IllegalArgumentException(label + " INTEGER is not minimally encoded");
            }
            position += length;
            if (first == 0) {
                start += 1;
                length -= 1;
            }
            if (length == 0 || length > 32) {
                throw new IllegalArgumentException(label + " is outside P-256 width");
            }
            boolean nonZero = false;
            for (int index = start; index < start + length; index++) {
                nonZero |= bytes[index] != 0;
            }
            if (!nonZero) throw new IllegalArgumentException(label + " must be non-zero");
            return Arrays.copyOfRange(bytes, start, start + length);
        }
    }
}
