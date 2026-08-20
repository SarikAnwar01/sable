# Latch

> Your home's Wi-Fi vault — and a much better way to hand it to a guest than
> reading a 20-character password off the back of the router.

Latch holds **every** network in your house: the main LAN, the guest SSID, the
IoT VLAN, the one in the garage. Each is marked with how far it is allowed to
travel, and only the ones you allow can ever reach a guest.

It is a local-first web app. Your networks are encrypted on your device and
never sent anywhere. There is no account, no server, no telemetry, and it works
with **any router** — nothing to configure, nothing to install on the network.

## The honest bit, up front

A Wi-Fi password is a shared secret. Once a guest has it, **no app can take it
back** — not an expiry date, not a deleted link, not a revoked pass. Products
that sell "expiring Wi-Fi access" without talking to your router are glossing
over this.

Latch doesn't. Expiry here is advisory: it marks the pass expired and *tells you
to rotate the password*, which is the only thing that actually removes access.
So the app makes rotating cheap — one screen, a generated password, and a
re-send list of exactly which guests were cut off and which you meant to keep.

## What it does

**A vault of every network.** SSID, password, security, band, coverage, notes.
Each gets a sharing policy:

| Policy | Meaning |
|---|---|
| `private` | Reference only. Can never be added to a pass, card, tag or kiosk screen. |
| `qr-only` | In person only — QR, printed card, NFC tag. Never sent as a link. |
| `shareable` | May also be sent as a link. |

The policy is enforced where the payload is built, not merely hidden in the UI:
a private network cannot leave the vault, and an in-person-only network is
dropped from share links even if it is on the pass.

**Guest passes, four ways to hand over.** A pass bundles a name, the networks a
guest may use, a validity window, house rules, and the printer/TV details people
always ask for. From it you get:

- **QR codes** — the standard `WIFI:` payload every phone camera reads natively.
  No app on the guest's side.
- **Zero-knowledge links** — the payload is AES-GCM encrypted into the URL
  *fragment*, which browsers never send to a server. Whoever hosts Latch serves
  identical bytes to everyone and cannot see what you shared. Optionally locked
  with a PIN you pass along separately.
- **Printed cards** — A6 bedside card, fridge card, or a sheet of eight
  stickers. "Save as PDF" in the print dialog if you want a file.
- **NFC tap-to-join** — writes a real Wi-Fi Simple Config credential tag, so a
  guest taps a sticker and joins. Chrome on Android only; falls back to a link
  tag and says which it wrote.

**A door kiosk.** Park an old phone or tablet by the entrance: fullscreen QR,
join steps, house rules, screen wake-lock, anti-burn-in drift, PIN to exit.

**A share log and rotation nudges.** Every code shown, link sent, card printed
and tag written is recorded locally, so six months on you can still answer "who
did we give the Wi-Fi to?" — and Latch flags networks whose passwords are overdue
or whose guests have gone.

## Security model

- The vault is encrypted at rest (AES-GCM, key derived by PBKDF2-SHA256 with
  600,000 iterations) in IndexedDB, behind a passphrase, with idle auto-lock.
- **There is no recovery.** Forget the passphrase and the vault is gone — so
  export an encrypted backup from Settings once you have added your networks.
- Nothing leaves the device. No accounts, no sync, no analytics, no network
  requests at all once loaded.
- Share links: the ciphertext and key live after the `#`, so the host never
  receives them. In key mode, anyone with the whole link can open it — treat it
  like the password. In PIN mode the key is derived from the PIN instead; a
  6-digit PIN is meaningfully harder to brute-force against a captured link
  than a 4-digit one, and neither is a substitute for rotating the password.

## Known limits

- Expiry and revocation are advisory, per the section above. Rotation is real.
- Web NFC is Chrome-on-Android only, and the WSC format has no WPA3 code point,
  so WPA3 networks are written as WPA2 — fine on a mixed-mode router, possibly
  not on a WPA3-only one. The UI says so at the point of writing.
- The vault lives in one browser profile on one device. Backups are the way to
  move it; there is no sync.

## Develop

```bash
pnpm install
pnpm dev         # http://localhost:5173
pnpm test        # QR escaping, WSC bytes, crypto round-trips, rotation logic
pnpm typecheck
pnpm build
```

Requires Node ≥ 20 and pnpm ≥ 9. Latch is standalone — it has its own pnpm root
and shares no code with anything around it.

## Deploy (Vercel)

```bash
npx vercel deploy --prod    # from this directory
```

`vercel.json` is committed with the build config and cache headers. Afterwards,
paste the deployed address into **Settings → Site address** so share links point
somewhere a guest can open. Everything else — QR codes, NFC tags, printed cards,
kiosk mode — works with no address configured and no internet at all.

The deployed page is a static shell. It has no database, no API routes, and no
server-side code, so its access logs can only ever show that someone opened the
page, never for which network.
