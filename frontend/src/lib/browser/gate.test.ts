import { describe, expect, it } from 'vitest';
import { gate, identifyFamily, type GateEnv } from './gate';

const CHROME_PC =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const EDGE_PC = CHROME_PC.replace(' Chrome/131.0.0.0', ' Chrome/131.0.0.0 Edg/131.0.0.0');
const FIREFOX_PC =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const SAFARI_PC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const IOS_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
const IOS_CHROME = IOS_SAFARI.replace('Safari/604.1', 'CriOS/131.0.0.0 Mobile/15E148 Safari/604.1');
const IOS_FIREFOX = IOS_SAFARI.replace('Safari/604.1', 'FxiOS/133.0 Mobile/15E148 Safari/604.1');
const IPADOS_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
const ANDROID_FIREFOX =
  'Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0';
const SAMSUNG =
  'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36';
const OPERA_PC = CHROME_PC.replace('Safari/537.36', 'Safari/537.36 OPR/115.0.0.0');
const VIVALDI_PC = CHROME_PC.replace('Safari/537.36', 'Safari/537.36 Vivaldi/6.9');
const BRAVE_PC = CHROME_PC; // Brave sends an ordinary Chrome user agent.
const CHROMIUM_PC = CHROME_PC.replace('Chrome/131.0.0.0', 'Chromium/131.0.0.0 Chrome/131.0.0.0');

function env(overrides: Partial<GateEnv> = {}): GateEnv {
  return {
    userAgent: CHROME_PC,
    platform: 'Win32',
    maxTouchPoints: 0,
    isBrave: false,
    hasCreateImageBitmap: true,
    hasWorker: true,
    hasIndexedDb: true,
    hasCanvas2d: true,
    hasBlobEncode: true,
    ...overrides
  };
}

describe('brand strict gate', () => {
  it('allows the three named families', () => {
    expect(gate(env({ userAgent: IOS_SAFARI })).supported).toBe(true);
    expect(identifyFamily(env({ userAgent: IOS_SAFARI }))).toBe('ios-safari');
    expect(gate(env({ userAgent: ANDROID_CHROME })).supported).toBe(true);
    expect(identifyFamily(env({ userAgent: ANDROID_CHROME }))).toBe('android-chrome');
    expect(identifyFamily(env({ userAgent: CHROME_PC }))).toBe('desktop-chrome');
    expect(identifyFamily(env({ userAgent: EDGE_PC }))).toBe('desktop-edge');
    expect(identifyFamily(env({ userAgent: FIREFOX_PC }))).toBe('desktop-firefox');
    expect(gate(env({ userAgent: FIREFOX_PC })).supported).toBe(true);
  });

  it('lets an iPad on iPadOS through only when it is Safari', () => {
    const ipad = env({ userAgent: IPADOS_SAFARI, platform: 'MacIntel', maxTouchPoints: 5 });
    expect(identifyFamily(ipad)).toBe('ios-safari');
    expect(
      identifyFamily({ ...ipad, userAgent: IPADOS_SAFARI.replace('Safari/605.1.15', 'CriOS/131.0.0.0 Safari/605.1.15') })
    ).toBe('unsupported');
  });

  it('hard stops every other brand, same engine or not', () => {
    const refused: Array<[string, Partial<GateEnv>]> = [
      ['Brave desktop', { userAgent: BRAVE_PC, isBrave: true }],
      ['Brave with a token', { userAgent: CHROME_PC.replace('Safari/537.36', 'Safari/537.36 Brave/1.71') }],
      ['Vivaldi', { userAgent: VIVALDI_PC }],
      ['Opera', { userAgent: OPERA_PC }],
      ['Chromium', { userAgent: CHROMIUM_PC }],
      ['Safari desktop', { userAgent: SAFARI_PC }],
      ['iOS Chrome', { userAgent: IOS_CHROME }],
      ['iOS Firefox', { userAgent: IOS_FIREFOX }],
      ['Android Firefox', { userAgent: ANDROID_FIREFOX }],
      ['Samsung Internet', { userAgent: SAMSUNG }],
      ['Android Brave', { userAgent: ANDROID_CHROME, isBrave: true }],
      ['iOS web view', { userAgent: `${IOS_SAFARI} FBAN/FBIOS` }]
    ];
    for (const [name, overrides] of refused) {
      const result = gate(env(overrides));
      expect(result.supported, name).toBe(false);
      expect(result.family, name).toBe('unsupported');
    }
  });

  it('refuses an allowed brand that is missing an API', () => {
    expect(gate(env({ hasWorker: false })).supported).toBe(false);
    expect(gate(env({ hasWorker: false })).reason).toBe('Worker');
    expect(gate(env({ userAgent: IOS_SAFARI, hasIndexedDb: false })).reason).toBe('IndexedDB');
  });
});