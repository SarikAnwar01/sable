import { useState } from 'react';
import { useVault } from '../state/store';
import { Button, Field, inputClass } from './Bits';

/**
 * First-run and unlock screen. The passphrase is the only thing standing
 * between a stolen phone and every Wi-Fi password in the house, and there is
 * no recovery path by design — so the create flow says so plainly.
 */
export default function Lock() {
  const { status, unlock, create, error, busy } = useVault();
  const creating = status === 'empty';
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = async () => {
    setLocalError(null);
    if (creating) {
      if (passphrase.length < 8) {
        setLocalError('Use at least 8 characters — this protects every password in the house.');
        return;
      }
      if (passphrase !== confirm) {
        setLocalError('The two passphrases do not match.');
        return;
      }
      await create(passphrase);
    } else {
      await unlock(passphrase);
    }
    setPassphrase('');
    setConfirm('');
  };

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="text-center">
          <div className="text-3xl">🔐</div>
          <h1 className="mt-2 text-2xl font-semibold">Latch</h1>
          <p className="mt-1 text-sm text-slate-400">
            {creating ? 'Set a passphrase to create your vault.' : 'Enter your passphrase.'}
          </p>
        </div>

        <Field label="Passphrase">
          <input
            className={inputClass}
            type="password"
            autoFocus
            autoComplete={creating ? 'new-password' : 'current-password'}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>

        {creating && (
          <>
            <Field label="Confirm">
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </Field>
            <p className="rounded-lg border border-edge bg-panel p-3 text-xs text-slate-400">
              Your vault is encrypted on this device and never leaves it. That also means{' '}
              <strong className="text-slate-200">there is no way to recover it</strong> if you forget
              this passphrase — export an encrypted backup from Settings once you have added your
              networks.
            </p>
          </>
        )}

        {(localError ?? error) && (
          <p className="text-sm text-red-400">{localError ?? error}</p>
        )}

        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Working…' : creating ? 'Create vault' : 'Unlock'}
        </Button>
      </form>
    </div>
  );
}
