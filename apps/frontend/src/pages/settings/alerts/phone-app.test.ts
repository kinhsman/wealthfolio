import { describe, expect, it } from "vitest";
import { keyBytes, phoneStep, sameKey } from "./phone-app";

describe("phoneStep", () => {
  it("sends an iPhone in a Safari tab to the home screen steps, even though it cannot subscribe there", () => {
    expect(phoneStep({ ios: true, standalone: false, supported: false })).toBe("home-screen");
    expect(phoneStep({ ios: true, standalone: false, supported: true })).toBe("home-screen");
  });
  it("offers the buttons from the home screen app, or a browser that can receive", () => {
    expect(phoneStep({ ios: true, standalone: true, supported: true })).toBe("ready");
    expect(phoneStep({ ios: false, standalone: false, supported: true })).toBe("ready");
  });
  it("says so when the browser cannot receive (an iPhone older than 16.4 in the home screen app, an old browser)", () => {
    expect(phoneStep({ ios: true, standalone: true, supported: false })).toBe("unsupported");
    expect(phoneStep({ ios: false, standalone: false, supported: false })).toBe("unsupported");
  });
});

describe("keyBytes", () => {
  // RFC 8291 Appendix A's phone key: 65 bytes, an uncompressed P-256 point.
  const PUBLIC = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
  it("turns the service's base64url key into its 65 bytes", () => {
    const bytes = keyBytes(PUBLIC);
    expect(bytes.length).toBe(65);
    expect(bytes[0]).toBe(4);
  });
  it("takes a key with or without padding", () => {
    expect(keyBytes("AQID")).toEqual(new Uint8Array([1, 2, 3]));
    expect(keyBytes("AQI")).toEqual(new Uint8Array([1, 2]));
  });
});

describe("sameKey", () => {
  const key = new Uint8Array([4, 5, 6]);
  it("is true only for the same bytes", () => {
    expect(sameKey(new Uint8Array([4, 5, 6]).buffer, key)).toBe(true);
    expect(sameKey(new Uint8Array([4, 5, 7]).buffer, key)).toBe(false);
    expect(sameKey(new Uint8Array([4, 5]).buffer, key)).toBe(false);
  });
  it("is false when the browser kept no key", () => {
    expect(sameKey(null, key)).toBe(false);
    expect(sameKey(undefined, key)).toBe(false);
  });
});
