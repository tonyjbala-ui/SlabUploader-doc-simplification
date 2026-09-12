/**
 * Browser gate.
 *
 * Allowed: iOS Safari, Android Chrome, desktop Chrome, Edge, Firefox.
 * Every other client gets a hard stop screen. There is no app.
 *
 * The gate is brand strict, not engine strict: Brave, Vivaldi, Opera, Samsung
 * Internet, Chromium, Android Firefox, iOS Chrome and desktop Safari are all
 * refused even though several of them share an engine with an allowed browser.
 *
 * Brave hides from the user agent on Android and desktop, so its injected
 * `navigator.brave` object is part of the check.
 */

export type ClientFamily =
  | 'ios-safari'
  | 'android-chrome'
  | 'desktop-chrome'
  | 'desktop-edge'
  | 'desktop-firefox'
  | 'unsupported';

export type GateEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  isBrave: boolean;
  hasCreateImageBitmap: boolean;
  hasWorker: boolean;
  hasIndexedDb: boolean;
  hasCanvas2d: boolean;
  hasBlobEncode: boolean;
};

export type GateResult = {
  supported: boolean;
  family: ClientFamily;
  reason: string | null;
};

export const NOT_SUPPORTED_COPY = 'This browser is not supported';

/** iOS browsers that are not Safari, plus in-app web views. */
const IOS_NOT_SAFARI =
  /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|Mercury|YaBrowser|Yandex|Oculus|FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter|Pinterest|SnapChat/i;

/** Tokens that disqualify a Chrome user agent string. */
const NOT_CHROME =
  /EdgA\/|Edg\/|Edge\/|OPR\/|Opera|SamsungBrowser|YaBrowser|DuckDuckGo|Firefox\/|Vivaldi\/|Chromium\/|Brave|UCBrowser|QQBrowser|MiuiBrowser|HuaweiBrowser|Oculus|Puffin/i;

export function collectGateEnv(nav: Navigator = navigator, win: Window & typeof globalThis = window): GateEnv {
  const canvas = typeof win.document !== 'undefined' ? win.document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d') : null;
  const brave = (nav as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }).brave;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    // Brave injects this object on desktop and Android. No user agent tells.
    isBrave: typeof brave !== 'undefined' && brave !== null,
    hasCreateImageBitmap: typeof win.createImageBitmap === 'function',
    hasWorker: typeof win.Worker === 'function',
    hasIndexedDb: typeof win.indexedDB !== 'undefined' && win.indexedDB !== null,
    hasCanvas2d: !!ctx,
    hasBlobEncode:
      typeof win.OffscreenCanvas === 'function' ||
      (!!canvas && typeof (canvas as HTMLCanvasElement).toBlob === 'function')
  };
}

export function isIos(env: GateEnv): boolean {
  if (/iPhone|iPad|iPod/i.test(env.userAgent)) return true;
  // iPadOS reports itself as a Mac with touch.
  return /Macintosh|Mac OS X/i.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function identifyFamily(env: GateEnv): ClientFamily {
  const ua = env.userAgent;

  if (env.isBrave || /Brave/i.test(ua)) return 'unsupported';

  if (isIos(env)) {
    const isSafari = /Safari\//.test(ua) && !IOS_NOT_SAFARI.test(ua);
    return isSafari ? 'ios-safari' : 'unsupported';
  }

  if (/Android/i.test(ua)) {
    const androidChrome = /Chrome\//.test(ua) && !NOT_CHROME.test(ua);
    return androidChrome ? 'android-chrome' : 'unsupported';
  }

  if (/Vivaldi\/|OPR\/|Opera|Chromium\/|Edge\//i.test(ua)) return 'unsupported';
  if (/Firefox\//i.test(ua) && !/Seamonkey/i.test(ua)) return 'desktop-firefox';
  if (/Edg\//i.test(ua)) return 'desktop-edge';
  if (/Chrome\//.test(ua)) return 'desktop-chrome';

  return 'unsupported';
}

export function gate(env: GateEnv): GateResult {
  const family = identifyFamily(env);
  if (family === 'unsupported') {
    return { supported: false, family, reason: 'client' };
  }
  if (!env.hasCreateImageBitmap) {
    return { supported: false, family, reason: 'createImageBitmap' };
  }
  if (!env.hasCanvas2d) {
    return { supported: false, family, reason: 'canvas' };
  }
  if (!env.hasWorker) {
    return { supported: false, family, reason: 'Worker' };
  }
  if (!env.hasIndexedDb) {
    return { supported: false, family, reason: 'IndexedDB' };
  }
  if (!env.hasBlobEncode) {
    return { supported: false, family, reason: 'blob' };
  }
  return { supported: true, family, reason: null };
}