/**
 * Per-OS join instructions. A guest handed a password still has to find the
 * right settings screen, and the steps differ enough per platform that
 * generic advice is useless.
 */
export type Platform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';

export function detectPlatform(ua: string = navigator.userAgent): Platform {
  const s = ua.toLowerCase();
  // iPadOS 13+ reports a Mac UA, so check for touch points to tell them apart.
  const iPadOnMacUa =
    s.includes('macintosh') && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1;
  if (/iphone|ipad|ipod/.test(s) || iPadOnMacUa) return 'ios';
  if (s.includes('android')) return 'android';
  if (s.includes('macintosh') || s.includes('mac os x')) return 'macos';
  if (s.includes('windows')) return 'windows';
  if (s.includes('linux') || s.includes('x11')) return 'linux';
  return 'unknown';
}

export function platformLabel(p: Platform): string {
  return { ios: 'iPhone / iPad', android: 'Android', macos: 'Mac', windows: 'Windows', linux: 'Linux', unknown: 'this device' }[p];
}

/** Steps for scanning the QR code with the device's own camera. */
export function scanSteps(p: Platform): string[] {
  switch (p) {
    case 'ios':
      return ['Open the Camera app', 'Point it at the code', 'Tap the "Join Network" banner that appears'];
    case 'android':
      return ['Open the Camera app (or Settings → Network → Wi-Fi → scan icon)', 'Point it at the code', 'Tap the pop-up to connect'];
    default:
      return ['Scan the code with a phone camera', 'Tap the join prompt', 'Or type the password in by hand below'];
  }
}

/** Steps for joining by hand, once the password has been copied. */
export function manualSteps(p: Platform, ssid: string): string[] {
  switch (p) {
    case 'ios':
      return ['Settings → Wi-Fi', `Tap "${ssid}"`, 'Paste the password, tap Join'];
    case 'android':
      return ['Settings → Network & internet → Wi-Fi', `Tap "${ssid}"`, 'Paste the password, tap Connect'];
    case 'macos':
      return ['Click the Wi-Fi icon in the menu bar', `Choose "${ssid}"`, 'Paste the password, click Join'];
    case 'windows':
      return ['Click the network icon by the clock', `Choose "${ssid}" → Connect`, 'Paste the password, click Next'];
    default:
      return ['Open your Wi-Fi settings', `Choose "${ssid}"`, 'Paste the password and connect'];
  }
}

/** Hidden networks never appear in the list; you have to add them by hand. */
export function hiddenNetworkSteps(p: Platform, ssid: string): string[] {
  switch (p) {
    case 'ios':
      return ['Settings → Wi-Fi → Other…', `Name: ${ssid}`, 'Set Security to match, then paste the password'];
    case 'android':
      return ['Settings → Wi-Fi → Add network', `Name: ${ssid}`, 'Set Security to match, then paste the password'];
    default:
      return [`This network is hidden — add it by hand as "${ssid}"`, 'Set the security type to match, then paste the password'];
  }
}
