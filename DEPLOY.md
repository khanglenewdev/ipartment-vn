# Deploying ipartment-vn

The site is built by Eleventy. The thing that actually gets published is the
`_site/` folder, which the build generates and which is NOT saved to Git (it is
in `.gitignore`). So whichever host you use has to run the build for you. Two
options are wired up. You only need one. We are using GitHub Pages.

## Option A: GitHub Pages (current, matches the class submission)

A GitHub Actions workflow at `.github/workflows/deploy.yml` builds the site and
publishes it to GitHub Pages on every push. One-time setup:

1. Push this repo so the workflow file is on GitHub.
2. On GitHub, open the repo, then Settings, then Pages.
3. Under "Build and deployment", set Source to "GitHub Actions".
4. Push anything (or open the Actions tab and run the workflow once). It builds
   and publishes automatically. Watch it go green in the Actions tab.

The live URL is `https://khanglenewdev.github.io/ipartment-vn/`. Every push after
that rebuilds and republishes on its own. The site uses only relative links, so
it works correctly under that `/ipartment-vn/` subpath.

Note: the SEO canonical and sitemap URLs still use the placeholder domain
`ipartment.vn`. That does not break anything; it is just a tidy-up for when a
real custom domain is attached. Not needed for the class.

## Option B: Vercel (alternative, not currently used)

`vercel.json` is in the repo (build `npm run build`, output `_site`). To use
Vercel instead: sign in to vercel.com with GitHub, Add New then Project, import
`khanglenewdev/ipartment-vn`, leave the auto-filled settings, click Deploy. It
serves at the project's root domain (no subpath). Use one host, not both.

## Every deploy after setup (either host)

Just push to GitHub. Nothing else.

```
git add -A
git commit -m "your message"
git push
```

To preview locally before pushing:

```
npm install     # once
npm start       # live preview at http://localhost:8080, auto-reloads
```

## Do NOT

- Do not commit `_site/` or `node_modules/`. Both are gitignored on purpose.
- Do not publish the source files raw without the build. The homepage only
  exists after the build runs, so serving the repo as-is would 404 the homepage.
- Do not run the old "wipe ipartment-vn and copy the flat site in" sync. It
  would delete this whole Eleventy system (src/, config, this guide).
