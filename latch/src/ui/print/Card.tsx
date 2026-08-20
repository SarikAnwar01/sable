import type { GuestPass, WifiNetwork } from '../../types';
import { buildWifiUri } from '../../lib/wifiQr';
import QrCode from '../QrCode';

export type CardLayout = 'bedside' | 'fridge' | 'stickers';

export const LAYOUT_LABEL: Record<CardLayout, string> = {
  bedside: 'Bedside card (A6)',
  fridge: 'Fridge card',
  stickers: 'Sticker sheet (8 up)',
};

/**
 * Printed cards. Deliberately black-on-white with a heavy border: these get
 * photocopied, laminated and stuck to fridges, and a dark theme would eat a
 * cartridge and scan badly.
 */
function CardFace({
  net,
  pass,
  compact = false,
}: {
  net: WifiNetwork;
  pass: GuestPass;
  compact?: boolean;
}) {
  return (
    <div
      className={`print-card flex gap-4 rounded-xl border-2 border-black bg-white p-4 text-black ${
        compact ? 'text-xs' : 'text-sm'
      }`}
    >
      <div className="shrink-0">
        <QrCode value={buildWifiUri(net)} size={compact ? 96 : 150} ecl="Q" />
      </div>
      <div className="min-w-0 flex-1">
        <p className={compact ? 'text-sm font-bold' : 'text-lg font-bold'}>Wi-Fi</p>
        <p className="mt-1 break-words">
          <span className="uppercase tracking-wide opacity-60">Network </span>
          <span className="mono font-semibold">{net.ssid}</span>
        </p>
        {net.security !== 'open' && (
          <p className="break-words">
            <span className="uppercase tracking-wide opacity-60">Password </span>
            <span className="mono font-semibold">{net.password}</span>
          </p>
        )}
        {net.hidden && <p className="mt-1 italic">Hidden network — add it by hand.</p>}
        {!compact && (
          <p className="mt-2 opacity-70">
            Point your phone camera at the code, then tap the banner to join.
          </p>
        )}
        {!compact && pass.houseInfo.rules && (
          <p className="mt-2 border-t border-black/20 pt-2">{pass.houseInfo.rules}</p>
        )}
        {!compact && (pass.houseInfo.printer || pass.houseInfo.tv) && (
          <p className="mt-1 opacity-70">
            {pass.houseInfo.printer && <>Printer: {pass.houseInfo.printer}. </>}
            {pass.houseInfo.tv && <>TV: {pass.houseInfo.tv}.</>}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PrintSheet({
  pass,
  networks,
  layout,
}: {
  pass: GuestPass;
  networks: WifiNetwork[];
  layout: CardLayout;
}) {
  if (layout === 'stickers') {
    // One sticker per network, repeated to fill a sheet of 8.
    const cells = Array.from({ length: 8 }, (_, i) => networks[i % networks.length]!);
    return (
      <div className="grid grid-cols-2 gap-3">
        {cells.map((net, i) => (
          <CardFace key={`${net.id}-${i}`} net={net} pass={pass} compact />
        ))}
      </div>
    );
  }

  return (
    <div className={layout === 'bedside' ? 'mx-auto max-w-[105mm] space-y-4' : 'space-y-4'}>
      <h1 className="text-xl font-bold text-black">{pass.label}</h1>
      {networks.map((net) => (
        <CardFace key={net.id} net={net} pass={pass} />
      ))}
    </div>
  );
}
