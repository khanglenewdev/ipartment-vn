# How to build a client site from the library

This is the operating manual. It tells you (or an AI) how to assemble a new
client site by configuring the library instead of building from scratch. The
library lives in `src/_data/library/` and is browsable at `/showcase.html`.

The principle: **niche + goals decide the WHAT. Style decides the LOOK.
Content decides the MEANING.** You only ever write fresh the meaning.

---

## The library, as files

| File | What it holds |
|---|---|
| `src/_data/library/goals.json` | The 5 goals. Each goal lists the section types and functions it pulls in. |
| `src/_data/library/niches.json` | The niche packages. Each lists default pages, specialized sections, typical functions. |
| `src/_data/library/sections.json` | Every section TYPE and its design VARIANTS (with the principle + source behind each). |
| `src/_data/library/functions.json` | The function library (chatbot, capture, booking, analytics, etc.). |

`built: true` means a production template already exists in
`src/_includes/sections/`. `built: false` ("spec") means the variant is
designed and specified but its template still needs to be built (and then
promoted into the library, so the next client gets it for free).

---

## The build, step by step

### Step 1 - Pick the niche. Get the pages.
Look up the client's niche in `niches.json`. Its `pages` array is the starting
page list. Its `sectionsSpecial` are the section types this niche usually needs.

### Step 2 - Pick the goals. Get the sections and functions.
The client chooses 2-3 goals from `goals.json`. Union the `sections` and
`functions` from the chosen goals with the niche's specials. That is the plan.
(The `/showcase.html` "Your build" panel does this union for you live: pick the
niche and goals and read off the result.)

### Step 3 - Choose a variant for each section.
For each section type in the plan, open `sections.json` and pick the variant
whose `whenToUse` and `goals` fit this client. Prefer `built: true` variants
(no new template needed). For a `built: false` variant, you will build its
template in Step 6.

### Step 4 - Fill the data (the swap + the fresh writing).
Create the client's data files. This is most of the job:
- `src/_data/brand.json` - Layer 0 knobs: name, colors, fonts, logo, contact, NAP.
- `src/_data/site.json` - nav, footer, domain, social, SEO defaults.
- `src/_data/property.json` (or the niche equivalent) - the structured-data values.
- One content file per page, e.g. `src/_data/home.json` - the actual copy, written
  fresh with the frameworks (interview, H-S-B-S copy formula, proof-point checklist).

### Step 5 - Write each page skeleton.
For each page, create a file in `src/` (like `src/index.njk`) with front matter
listing its sections in order, each pointing at a section template:

```yaml
sections:
  - { key: hero,  template: "sections/hero/a.njk" }
  - { key: usp,   template: "sections/usp.njk" }
  - { key: cta,   template: "sections/cta.njk" }
```

The body loops the list:
```njk
{% for s in sections %}{% set sec = home[s.key] %}{% include s.template %}{% endfor %}
```

### Step 6 - Build any "spec" variants you chose.
If a chosen variant has no template yet, build it in `src/_includes/sections/`,
reading its content from `sec` (the data) exactly like the existing ones do.
Then update `sections.json` to mark it `built: true`. It is now in the library.

### Step 7 - Wire the functions.
Attach the functions from the plan. Site-level functions (chatbot, analytics,
nav) load in `base.njk` / `scripts.njk`. Section-level functions (booking,
finder, capture) mount inside their section. Configure them with the client's
data (e.g. the chatbot's FAQ file).

### Step 8 - Refine the library.
Anything genuinely new you had to build becomes a reusable section variant or
function, not a one-off. Promote it. The next client starts from a higher floor.

---

## Data contract for a section template

A section template receives `sec` (its slice of the page content data) plus the
globals `brand`, `site`, and any niche data. It must contain no client-specific
text in the markup: every word comes from `sec`. Rich fields (with `<em>` or
entities) are output with the `| safe` filter. See `src/_includes/sections/`
for working examples (hero, usp, rooms, reviews, etc.).

---

## What exists today (honest inventory)

- **Machine:** built and proven (page shell, head, nav, footer, scripts, schema).
- **Section templates built:** hero (split), usp (grid + rows variant), rooms,
  reviews, corporate, location, magazine, cta, finder. The rest of the catalog's
  variants are specified (`built: false`) and render as preview mock-ups in the
  showcase until their templates are built on the next client that needs them.
- **Functions built:** chatbot, booking, finder quiz, exit survey, A/B offer,
  confirmation capture, funnel analytics, accounts, technical SEO/schema.
  Specified but not yet built: one-step/conversational capture, popups,
  preference center, GBP/local pipeline, reviews/referral pipeline.
- **Library data:** 5 goals, 6 niches, 10 section types, 25 variants, 14
  functions, all researched and sourced.

The showcase previews are representative mock-ups of composition, not the
production renders. The production look comes from the design system in
`assets/css/`.
