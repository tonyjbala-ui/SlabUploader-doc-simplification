/**
 * Browser gate.
 *
 * Phone: iOS Safari, Android Chrome.
 * PC: Chrome, Edge, Firefox.
 * Every other client gets a hard stop screen. There is no app.
 *
 * The gate is engine based, so a desktop Chromium browser that is not branded
 * Chrome or Edge passes. See docs/CAPTURE.md "Browsers".
 */

export type ClientFamily =
  | 'ios-safari'
  | 'android-chrome'
  | 'desktop-chromium'
  | 'desktop-firefox'
  | 'unsupported';

export type GateEnv = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
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

export function collectGateEnv(nav: Navigator = navigator, win: Window & typeof globalThis = window): GateEnv {
  const canvas = typeof win.document !== 'undefined' ? win.document.createElement('canvas') : null;
  const ctx = canvas ? canvas.getContext('2d') : null;
  return {
    userAgent: nav.userAgent,
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
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
  return /Macintosh|Mac OS X/i.test(env.userAgent) && env.maxTouchPoints > 1;
}

export function identifyFamily(env: GateEnv): ClientFamily {
  const ua = env.userAgent;

  if (isIos(env)) {
    // On iOS every browser is WebKit; the spec names Safari, so in-app and
    // third party iOS browsers (Chrome, Firefox, Edge, Opera, Google app) stop.
    const thirdParty = /CriOS|FxiOS|EdgiOS|OPiOS|GSA|DuckDuckGo|Mercury/i.test(ua);
    const isSafari = /Safari\//.test(ua) && !thirdParty;
    return isSafari ? 'ios-safari' : 'unsupported';
  }

  if (/Android/i.test(ua)) {
    const androidChrome =
      /Chrome\//.test(ua) && !/EdgA\/|Firefox\/|SamsungBrowser|OPR\/|YaBrowser/i.test(ua);
    return androidChrome ? 'android-chrome' : 'unsupported';
  }

  if (/Firefox\//.test(ua) && !/Seamonkey/i.test(ua)) return 'desktop-firefox';
  if (/Chrome\/|Chromium\//.test(ua) && !/OPR\/|Edge\//.test(ua)) return 'desktop-chromium';
  if (/Edg\//.test(ua)) return 'desktop-chromium';

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