# ipartment - Reference Build One (Eleventy)

This is the ipartment site rebuilt as a **layered system**. It is the first
proof that "the machine" (built once, reused) is separate from "the filling"
(swapped per client) and "the meaning" (written fresh per client).

The old hand-built pages still work. They are copied through untouched while we
migrate the site one page at a time. Only the **homepage** is fully migrated to
the layered system so far. It is the reference.

---

## How to run it

You need Node installed once. Then, in this folder:

```
npm install      # one time. Downloads the build tool into node_modules/
npm start        # builds the site and opens a live preview that auto-reloads
```

`npm start` prints a local address (usually http://localhost:8080). Open it.
To just build without the preview:

```
npm run build    # writes the finished site into _site/
```

### Where things go

- **`_site/`** is the finished website. This is the only thing you deploy.
  It is plain fast HTML/CSS/JS. It is regenerated every build, so never edit it
  by hand.
- **`node_modules/`** is the toolbox. Big, disposable, never deployed, never
  saved to Git. If it ever breaks, delete it and run `npm install` again.
- Both are in `.gitignore`, so the saved project stays small.

---

## The two demos (proof of concept)

### Demo 1: the brand knob (brand identity is separate from design)

Open **`src/_data/brand.json`**. Change `colors.accent` from `#FFED00` to
something else, e.g. `#16a34a` (green). Save. The preview reloads and the
**whole site re-themes** to the new colour. One value, everywhere. That is
Layer 0 (brand identity) sitting on top of an unchanged design system.

You can also change the fonts in the same file.

### Demo 2: the section variant (design is separate from content)

Open **`src/index.njk`**. Find the `usp` line in the `sections:` list:

```
  - { key: usp, template: "sections/usp.njk" }
```

Change the template to the variant:

```
  - { key: usp, template: "sections/usp-rows.njk" }
```

Save. The "Why ipartment" section switches from a 4-tile grid to an editorial
numbered list. **The words never change** (they live in `home.json`); only the
design did. That is a section-level style variant from the library.

---

## How a page is built (the layers)

A page is an **ordered list of sections**. See the `sections:` block at the top
of `src/index.njk`. Each line says which content (`key`) and which design
(`template`) to use. Reorder the lines to reorder the page. Delete a line to
remove a section. Add a line to add one.

```
LAYER                     WHERE IT LIVES                         BUCKET
---------------------------------------------------------------------------
0  Brand identity (knobs)  src/_data/brand.json                  swap per client
   Site nav + footer       src/_data/site.json                   swap per client
   SEO property values     src/_data/property.json               swap per client
6  Content / the words     src/_data/home.json                   write fresh
---------------------------------------------------------------------------
   The page shell          src/_includes/layouts/base.njk        build once
   Head / SEO scaffolding  src/_includes/partials/head.njk       build once
   Schema (shape)          src/_includes/partials/schema.njk     build once
   Nav / footer / scripts  src/_includes/partials/*.njk          build once
1+2 Section library         src/_includes/sections/*.njk          build once
4  Page skeleton           src/index.njk (the sections: list)    per client
```

To re-theme for a different client, the bulk of the work is the four data files
plus choosing section templates. The machine in `_includes/` does not change.

---

## Folder map

```
.eleventy.js            The machine config. Lists assets + legacy pages to copy.
package.json            Declares the build tool (Eleventy).
assets/                 Existing CSS / JS / chatbot data / images. Untouched, shipped as-is.
src/
  _data/                The swappable + fresh layers (brand, site, property, home).
  _includes/
    layouts/base.njk    The page shell every page is poured into.
    partials/           Site-level machine: head, header (nav), footer, scripts, schema.
    sections/           The section library. Each file is one reusable block.
      hero/a.njk        Hero, variant A. Add b.njk for a second design.
      usp.njk           USP, grid variant.
      usp-rows.njk      USP, rows variant (the demo).
      ...               finder, rooms, reviews, corporate, location, magazine, cta.
  index.njk             The homepage skeleton (the sections: list).
_site/                  BUILT OUTPUT. Deploy this. Do not edit by hand.
```

---

## What is NOT migrated yet (next steps)

The other pages (about, accommodation, booking, faq, etc.) are still the old
hand-built HTML files at the project root, copied through by `.eleventy.js` so
the site keeps working. Migrating each one means the same move we did for the
homepage: pull its content into a data file, build its sections (reusing the
library where possible, adding new section templates where needed), and give it
a skeleton page in `src/`. Each migration grows the section library, so later
pages get cheaper. Harvest, do not speculate.
