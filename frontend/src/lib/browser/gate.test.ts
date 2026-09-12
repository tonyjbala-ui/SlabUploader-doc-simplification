import { describe, expect, it } from 'vitest';
import { checkBrowser } from './gate';

describe('browser gate', () => {
  it('allows iOS Safari', () => {
    expect(
      checkBrowser(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      ).ok
    ).toBe(true);
  });
  it('allows Android Chrome', () => {
    expect(
      checkBrowser(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
      ).ok
    ).toBe(true);
  });
  it('allows desktop Firefox', () => {
    expect(checkBrowser('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0').ok).toBe(
      true
    );
  });
  it('stops unknown clients', () => {
    expect(checkBrowser('SlabBot/1.0').ok).toBe(false);
  });
});
