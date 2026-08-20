import { describe, expect, it } from 'vitest';
import { buildWscRecord } from '../src/lib/wsc';

/** Reads a big-endian uint16 at an offset. */
const u16 = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;

describe('buildWscRecord', () => {
  const record = buildWscRecord({ ssid: 'Guest', password: 'hunter22', security: 'WPA2' });

  it('wraps everything in a Credential TLV whose length matches the body', () => {
    expect(u16(record, 0)).toBe(0x100e);
    expect(u16(record, 2)).toBe(record.length - 4);
  });

  it('carries the SSID and network key as ASCII', () => {
    const text = new TextDecoder().decode(record);
    expect(text).toContain('Guest');
    expect(text).toContain('hunter22');
  });

  it('declares WPA2-PSK with AES for a protected network', () => {
    // Walk the inner TLVs rather than trusting fixed offsets.
    const found: Record<number, number> = {};
    let at = 4;
    while (at + 4 <= record.length) {
      const type = u16(record, at);
      const len = u16(record, at + 2);
      if (len === 2) found[type] = u16(record, at + 4);
      at += 4 + len;
    }
    expect(found[0x1003]).toBe(0x0020); // auth: WPA2-PSK
    expect(found[0x100f]).toBe(0x0008); // encryption: AES
  });

  it('describes an open network as open with no cipher and an empty key', () => {
    const open = buildWscRecord({ ssid: 'Cafe', password: '', security: 'open' });
    const text = new TextDecoder().decode(open);
    expect(text).toContain('Cafe');
    // Network Key TLV present but zero length.
    let at = 4;
    let keyLen: number | null = null;
    while (at + 4 <= open.length) {
      const type = u16(open, at);
      const len = u16(open, at + 2);
      if (type === 0x1027) keyLen = len;
      at += 4 + len;
    }
    expect(keyLen).toBe(0);
  });

  it('produces a well-formed TLV chain that consumes the record exactly', () => {
    let at = 4;
    while (at + 4 <= record.length) at += 4 + u16(record, at + 2);
    expect(at).toBe(record.length);
  });
});
