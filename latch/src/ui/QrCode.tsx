import { useMemo } from 'react';
import { qrMatrix, type ErrorCorrection } from '../lib/qr';

interface Props {
  value: string;
  /** Rendered edge length in CSS pixels; the SVG itself is resolution-free. */
  size?: number;
  ecl?: ErrorCorrection;
  className?: string;
}

/**
 * Quiet zone of 4 modules is part of the spec — scanners get unreliable without
 * it, especially on a screen where the code sits against a dark background.
 */
const QUIET = 4;

export default function QrCode({ value, size = 240, ecl = 'M', className }: Props) {
  const { path, count } = useMemo(() => qrMatrix(value, ecl), [value, ecl]);
  const span = count + QUIET * 2;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`0 0 ${span} ${span}`}
      shapeRendering="crispEdges"
      role="img"
      aria-label="Wi-Fi QR code"
    >
      <rect width={span} height={span} fill="#fff" />
      <g transform={`translate(${QUIET} ${QUIET})`}>
        <path d={path} fill="#000" />
      </g>
    </svg>
  );
}
