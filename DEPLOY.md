# Deploying ipartment-vn (Vercel)

The site is built by Eleventy. The thing that actually gets published is the
`_site/` folder, which the build generates and which is NOT saved to Git (it is
in `.gitignore`). So the host has to run the build. We use Vercel, which does
that automatically on every push. There is no manual build step for you.

## One-time setup (owner does this once)

1. Go to vercel.com and sign in with GitHub.
2. "Add New..." then "Project", and import the `khanglenewdev/ipartment-vn` repo.
3. Vercel reads `vercel.json` and pre-fills the settings:
   - Framework Preset: Other
   - Build Command: `npm run build`
   - Output Directory: `_site`
   - Install Command: `npm install` (automatic)
   Leave them as they are and click Deploy.
4. (Later) Add the real domain under the project's Settings then Domains. Email
   sender authentication (SPF, DKIM, DMARC) is a separate job on the Make/Brevo
   side and has nothing to do with Vercel.

That is it. Vercel now rebuilds and republishes the site every time you push.

## Every deploy after that

Just push to GitHub. Nothing else.

```
git add -A
git commit -m "your message"
git push
```

Vercel runs `npm install`, then `npm run build`, then serves `_site/`. You never
run the build by hand to deploy.

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
