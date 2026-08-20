/**
 * QR rendering. We draw the module matrix ourselves as a single SVG path so the
 * same code produces a crisp code on screen, on a printed card at any size, and
 * in a kiosk view scaled to a whole tablet — no canvas rasterisation anywhere.
 */
import qrcode from 'qrcode-generator';

export type ErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export interface QrMatrix {
  /** SVG path data in a `count` x `count` unit grid. */
  path: string;
  count: number;
}

export function qrMatrix(text: string, ecl: ErrorCorrection = 'M'): QrMatrix {
  // Type 0 lets the encoder pick the smallest version that fits the data.
  const qr = qrcode(0, ecl);
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const parts: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(row, col)) parts.push(`M${col} ${row}h1v1h-1z`);
    }
  }
  return { path: parts.join(''), count };
}
