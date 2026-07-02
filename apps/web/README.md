# Sable landing site

Static site for `sable.sarikanwar.com.np`: landing page plus the privacy policy
and terms of use that Google OAuth verification requires (M5b).

Zero dependencies — three HTML files and one stylesheet, deployable anywhere.
(The Phase 2 web companion dashboard will be a separate Next.js app.)

## Pages

- `index.html` — landing / download page
- `privacy.html` — privacy policy (required for Google OAuth consent screen)
- `terms.html` — terms of use

## Preview locally

```bash
npx serve apps/web        # or: python3 -m http.server -d apps/web 8080
```

## Deploy (pick one)

**Vercel** — `cd apps/web && npx vercel deploy --prod`, then add the domain
`sable.sarikanwar.com.np` in the Vercel dashboard.

**Netlify** — drag the `apps/web` folder onto app.netlify.com, then add the
custom domain.

**GitHub Pages** — push this folder to a `gh-pages` branch (or configure Pages
to serve `apps/web`), then set the custom domain.

## DNS

At your registrar for `sarikanwar.com.np`, add:

```
sable    CNAME    <host-provided target>   # e.g. cname.vercel-dns.com
```

## After deploy — Google OAuth (M5b)

In Google Cloud Console → OAuth consent screen, set:
- Homepage: `https://sable.sarikanwar.com.np/`
- Privacy policy: `https://sable.sarikanwar.com.np/privacy.html`
- Terms of service: `https://sable.sarikanwar.com.np/terms.html`
