import { useMemo } from 'react';
import {
  detectPlatform,
  hiddenNetworkSteps,
  manualSteps,
  platformLabel,
  scanSteps,
} from '../lib/platform';

interface Props {
  ssid: string;
  hidden: boolean;
  /** Scanning is only an option when the guest is looking at another screen. */
  showScan?: boolean;
}

export default function JoinSteps({ ssid, hidden, showScan = true }: Props) {
  const platform = useMemo(() => detectPlatform(), []);
  const steps = hidden
    ? hiddenNetworkSteps(platform, ssid)
    : showScan
      ? scanSteps(platform)
      : manualSteps(platform, ssid);

  return (
    <div className="text-sm text-slate-300">
      <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">
        On {platformLabel(platform)}
        {hidden ? ' — hidden network' : ''}
      </p>
      <ol className="space-y-1">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-2">
            <span className="mono text-latch">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
