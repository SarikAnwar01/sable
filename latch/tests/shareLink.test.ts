import { describe, expect, it } from 'vitest';
import type { SharePayload } from '../src/types';
import { buildShareLink, openShareLink, parseFragment } from '../src/lib/shareLink';

const payload: SharePayload = {
  v: 1,
  label: 'Priya — spare room',
  expiresAt: null,
  houseInfo: { rules: 'No torrents please', printer: 'HP-Downstairs', tv: '', extra: '' },
  networks: [
    {
      ssid: 'Sable Guest',
      password: 'copper-otter-4417',
      security: 'WPA2',
      hidden: false,
      emoji: '📶',
      coverage: 'whole house',
    },
  ],
};

describe('share links', () => {
  it('round-trips a payload in key mode', async () => {
    const link = await buildShareLink(payload, 'https://latch.example.com', 'key');
    const parsed = parseFragment(link.fragment)!;
    expect(parsed.mode).toBe('key');
    await expect(openShareLink(parsed)).resolves.toEqual(payload);
  });

  it('puts the payload after the # so it never reaches a server', async () => {
    const link = await buildShareLink(payload, 'https://latch.example.com', 'key');
    const [beforeHash] = link.url.split('#');
    expect(beforeHash).toBe('https://latch.example.com/');
    expect(link.url).not.toContain('copper-otter');
  });

  it('round-trips in PIN mode with the right PIN', async () => {
    const link = await buildShareLink(payload, '', 'pin', '482913');
    const parsed = parseFragment(link.fragment)!;
    expect(parsed.mode).toBe('pin');
    // The key is not in the link at all in PIN mode.
    expect(parsed.key).toBeNull();
    await expect(openShareLink(parsed, '482913')).resolves.toEqual(payload);
  });

  it('rejects a wrong PIN', async () => {
    const link = await buildShareLink(payload, '', 'pin', '482913');
    const parsed = parseFragment(link.fragment)!;
    await expect(openShareLink(parsed, '000000')).rejects.toThrow();
  });

  it('rejects a tampered payload rather than returning garbage', async () => {
    const link = await buildShareLink(payload, '', 'key');
    const parsed = parseFragment(link.fragment)!;
    parsed.body[parsed.body.length - 1] = (parsed.body.at(-1) ?? 0) ^ 0xff;
    await expect(openShareLink(parsed)).rejects.toThrow();
  });

  it('returns null for fragments it does not recognise', () => {
    expect(parseFragment('#nonsense')).toBeNull();
    expect(parseFragment('#p=9x.aa.bb')).toBeNull();
    expect(parseFragment('#p=1k')).toBeNull();
  });

  it('falls back to a bare fragment when no site address is configured', async () => {
    const link = await buildShareLink(payload, '', 'key');
    expect(link.url).toBe(link.fragment);
    expect(link.url.startsWith('#p=')).toBe(true);
  });
});
