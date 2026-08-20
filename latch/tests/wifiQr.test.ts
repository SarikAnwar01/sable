import { describe, expect, it } from 'vitest';
import { buildWifiUri, escapeWifiValue, needsHexQuoting } from '../src/lib/wifiQr';

describe('escapeWifiValue', () => {
  it('escapes every reserved character', () => {
    expect(escapeWifiValue('a;b,c:d"e')).toBe('a\\;b\\,c\\:d\\"e');
  });

  it('escapes a literal backslash', () => {
    expect(escapeWifiValue('back\\slash')).toBe('back\\\\slash');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeWifiValue("Ravi's café 5G")).toBe("Ravi's café 5G");
  });
});

describe('needsHexQuoting', () => {
  it('flags the ambiguous WEP and WPA key lengths', () => {
    expect(needsHexQuoting('a'.repeat(64))).toBe(true);
    expect(needsHexQuoting('0123456789')).toBe(true);
    expect(needsHexQuoting('0'.repeat(26))).toBe(true);
  });

  it('ignores hex-looking strings of other lengths, and non-hex text', () => {
    expect(needsHexQuoting('abc123')).toBe(false);
    expect(needsHexQuoting('z'.repeat(64))).toBe(false);
  });
});

describe('buildWifiUri', () => {
  it('builds the canonical payload', () => {
    expect(
      buildWifiUri({ ssid: 'Home', password: 'hunter22', security: 'WPA2', hidden: false }),
    ).toBe('WIFI:T:WPA;S:Home;P:hunter22;;');
  });

  it('escapes an SSID containing a semicolon so it cannot split the payload', () => {
    const uri = buildWifiUri({
      ssid: 'Flat 2; upstairs',
      password: 'pass',
      security: 'WPA2',
      hidden: false,
    });
    expect(uri).toBe('WIFI:T:WPA;S:Flat 2\\; upstairs;P:pass;;');
    // Field count must be unchanged by the semicolon inside the SSID.
    expect(uri.match(/(?<!\\);/g)).toHaveLength(4);
  });

  it('marks hidden networks so phones will search for them', () => {
    expect(
      buildWifiUri({ ssid: 'Attic', password: 'pw', security: 'WPA2', hidden: true }),
    ).toBe('WIFI:T:WPA;S:Attic;P:pw;H:true;;');
  });

  it('omits the password entirely on an open network', () => {
    expect(buildWifiUri({ ssid: 'Cafe', password: '', security: 'open', hidden: false })).toBe(
      'WIFI:T:nopass;S:Cafe;;',
    );
  });

  it('emits WPA3 as WPA, which is what phones expect', () => {
    expect(
      buildWifiUri({ ssid: 'New', password: 'pw', security: 'WPA3', hidden: false }),
    ).toContain('T:WPA;');
  });

  it('uses WEP for legacy networks', () => {
    expect(
      buildWifiUri({ ssid: 'Old', password: 'abcde12345', security: 'WEP', hidden: false }),
    ).toBe('WIFI:T:WEP;S:Old;P:"abcde12345";;');
  });

  it('quotes an all-hex passphrase so readers do not treat it as a raw key', () => {
    const key = 'a1b2c3d4e5'.repeat(6) + 'abcd';
    expect(key).toHaveLength(64);
    expect(buildWifiUri({ ssid: 'S', password: key, security: 'WPA2', hidden: false })).toContain(
      `P:"${key}"`,
    );
  });
});
