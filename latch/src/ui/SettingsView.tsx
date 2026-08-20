import { useRef, useState } from 'react';
import { useVault } from '../state/store';
import { backupFilename, exportBackup, importBackup } from '../lib/backup';
import { Button, Field, inputClass } from './Bits';

export default function SettingsView() {
  const { data, saveSettings, replaceAll, wipe, lock } = useVault();
  const [settings, setSettings] = useState(data.settings);
  const [saved, setSaved] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = async () => {
    await saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const doExport = async () => {
    setError(null);
    setMessage(null);
    if (passphrase.length < 8) {
      setError('Use at least 8 characters to protect the backup.');
      return;
    }
    const text = await exportBackup(data, passphrase);
    // A plain anchor download rather than the File System API: it works in every
    // browser this app targets, including Safari on iOS.
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFilename();
    a.click();
    URL.revokeObjectURL(url);
    setMessage('Backup saved. Keep it somewhere you would keep a spare key.');
    setPassphrase('');
  };

  const doImport = async (file: File) => {
    setError(null);
    setMessage(null);
    if (!passphrase) {
      setError('Enter the passphrase the backup was made with.');
      return;
    }
    try {
      const restored = await importBackup(await file.text(), passphrase);
      await replaceAll(restored);
      setMessage('Backup restored.');
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That backup could not be restored.');
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Settings</h1>
      </header>

      <section className="space-y-4 rounded-xl border border-edge bg-panel p-4">
        <Field
          label="Site address"
          hint="Where you deployed Latch, e.g. https://latch.example.com. Needed only for share and kiosk links — codes, cards and tags work without it."
        >
          <input
            className={inputClass}
            value={settings.baseUrl}
            placeholder="https://"
            onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
          />
        </Field>

        <Field label="Auto-lock after">
          <select
            className={inputClass}
            value={settings.autoLockMinutes}
            onChange={(e) => setSettings({ ...settings, autoLockMinutes: Number(e.target.value) })}
          >
            <option value={1}>1 minute</option>
            <option value={5}>5 minutes</option>
            <option value={15}>15 minutes</option>
            <option value={0}>Never</option>
          </select>
        </Field>

        <Button variant="primary" onClick={() => void save()}>
          {saved ? 'Saved' : 'Save settings'}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-edge bg-panel p-4">
        <h2 className="text-sm font-medium">Backup</h2>
        <p className="text-xs text-slate-500">
          Your vault exists only in this browser. If you clear site data or lose the device without a
          backup, it is gone — there is no copy anywhere else, by design.
        </p>
        <Field label="Backup passphrase" hint="Used to encrypt the file. It can differ from your vault passphrase.">
          <input
            className={inputClass}
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void doExport()}>Export encrypted backup</Button>
          <Button onClick={() => fileInput.current?.click()}>Restore from backup</Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void doImport(file);
              e.target.value = '';
            }}
          />
        </div>
        {message && <p className="text-sm text-emerald-300">{message}</p>}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </section>

      <section className="space-y-3 rounded-xl border border-edge bg-panel p-4">
        <h2 className="text-sm font-medium">This device</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={lock}>Lock now</Button>
          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Delete the vault and everything in it on this device?')) void wipe();
            }}
          >
            Erase vault
          </Button>
        </div>
      </section>
    </div>
  );
}
