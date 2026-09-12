export type BrowserGate = { ok: true } | { ok: false; reason: string };

export function checkBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''): BrowserGate {
  const uaL = ua.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(uaL);
  const isAndroid = /android/.test(uaL);
  const isSafari = isIos && /safari/.test(uaL) && !/crios|fxios|edgios/.test(uaL);
  const isAndroidChrome = isAndroid && /chrome/.test(uaL) && !/edg/.test(uaL);
  const isDesktopChrome = /chrome/.test(uaL) && !/edg|opr|android|iphone|ipad/.test(uaL);
  const isEdge = /edg\//.test(uaL);
  const isFirefox = /firefox/.test(uaL) && !/android|iphone|ipad/.test(uaL);
  if (isSafari || isAndroidChrome || isDesktopChrome || isEdge || isFirefox) return { ok: true };
  return {
    ok: false,
    reason: 'Use iOS Safari, Android Chrome, or desktop Chrome, Edge, or Firefox.'
  };
}
