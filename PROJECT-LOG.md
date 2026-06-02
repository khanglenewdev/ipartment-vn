# The ipartment Story: How We Built It

*A plain-English diary of how a simple student website grew into a real, working product. No technical background needed to read this. If you can read a recipe, you can read this.*

---

## What this project even is

ipartment is a made-up serviced-apartment brand for Thao Dien, a leafy expat neighbourhood in Ho Chi Minh City. The idea: take the look and feel of a polished European apartment company and imagine it landing in Saigon. It is a school and portfolio project ("for educational purposes only" is stamped right under the logo on every page), but we decided early on that "student project" was not going to be an excuse for it to feel like one. We wanted it to behave like the real thing.

This log walks through the whole journey, from the clunky first version to where it stands today: a fast website with a real booking flow, automatic emails, a customer database, and genuine user accounts that people can sign up for.

---

## Chapter 1: The website we started with

The first version worked, but it was held together with tape.

Every page was its own island. There were ten pages (home, about, accommodation, booking, results, magazine, careers, FAQ, my account, legal), and each one carried its own copy of all the styling and all the behaviour stuffed directly inside the file. Imagine ten employees who each keep their own private copy of the company handbook, and every time a rule changes you have to go edit all ten copies by hand. That was the site.

The practical pain: the home page and booking page were over 800 lines and around 46 kilobytes each. They were so big that working on them kept getting cut off halfway. Fixing one small thing risked breaking three others, because nothing was shared.

It also had small rough edges: the heading font (Playfair Display) looked thin and a little broken at large sizes, the page even had a stray dash in its title, and there was no real "brain" behind it. The booking form looked like a booking form but did not actually calculate anything. Nothing was being saved anywhere.

So we made a call: rather than keep patching it, rebuild it properly.

---

## Chapter 2: The plan for the rebuild

The brief was simple to say and big to do. Make it feel professional and modern. Keep all the real information. Then add the things a real apartment brand would actually have:

- A welcome popup that offers first-time visitors a discount voucher.
- A booking tool that genuinely works: pick dates on a calendar, see live prices, choose add-ons, get a confirmation.
- A customer database so none of those leads and bookings vanish into thin air.
- An interactive map with a pin on the neighbourhood.
- The "for educational purposes only" line moved up top under the brand name, honest and visible.
- The "Penguin and Mun" credit kept at the bottom of every page.

And one rule that became law: **no fancy dashes anywhere, only plain hyphens.** Small thing, but it mattered for consistency, so it got written into the project's permanent memory.

---

## Chapter 3: How we actually built it

**We stopped repeating ourselves.** The single most important change was boring and invisible: we pulled all the shared styling and behaviour out of the individual pages and into a small set of shared files. Now there is one handbook the whole company reads from. Change the colour once, every page updates. This is why the site stopped getting truncated and became pleasant to work on.

**The welcome popup.** First-time visitors get a tasteful popup offering 15 percent off (code WELCOME15) in exchange for an email, with an optional first name so we can greet them properly. It shows once, it is easy to close, and it never nags you on the admin page.

**The booking simulator.** This is the centrepiece. You pick an apartment size, choose your check-in and check-out on a real calendar, and the price updates live, including automatic discounts for weekly and monthly stays. You can add extras (airport pickup, welcome pack, early check-in), and at the end you get a proper confirmation with a reference number. It feels like booking a real stay.

**The map.** A clean interactive map drops a glowing red pin on Thao Dien, with a "recenter" button that smoothly flies you back if you wander off. The exact spot is deliberately approximate, since this is a fictional brand.

**The magazine.** Instead of fake filler articles, we linked out to genuine, published stories about Thao Dien and Ho Chi Minh City, with the brand's own Facebook post pinned as the featured highlight. We also built a little behind-the-scenes editor so new articles can be added, edited, or hidden without touching code.

**The polish passes.** We made it work nicely on phones (the old one did not), removed a few gimmicky bits that were more distracting than impressive (a scrolling ticker, fake "someone just booked" popups, a team section that added nothing), and gently shrank every section by about ten percent because everything felt slightly oversized on a normal screen.

---

## Chapter 4: Making the website talk to the outside world

A pretty form is useless if nobody ever sees what people type into it. So we wired the site up to send its data somewhere real.

Think of it as a relay race. When someone fills in the popup, books a stay, or signs up for the newsletter, the website hands that information to a service called Make, which acts as the middleman. Make then does two things: it files the details neatly into an Airtable spreadsheet (our customer database, with separate tabs for leads, bookings, users, and job applications), and it triggers an email through a service called Brevo.

The emails are not plain grey text. We designed proper branded emails: a welcome voucher email, a booking confirmation email, and a newsletter welcome email, all styled to match the site, all personalised with the customer's name.

The upshot: a stranger can land on the site, grab a voucher, and seconds later a designed email arrives in their inbox while their details sit safely in our database. No human lifted a finger.

---

## Chapter 5: Giving people real accounts

This was the most ambitious chapter, and the most satisfying.

Up to this point the "log in" and "sign up" buttons were a polite illusion. They pretended to remember you, but everything lived only in that one browser on that one computer. Open the site on your phone and your account simply did not exist. Fine for a demo, embarrassing for a showcase.

We wanted the genuine article: accounts that work everywhere, that survive clearing your history, where each person's bookings and vouchers are saved to their own account. That needs a real backend, so we used Supabase (think of it as a secure, professional filing cabinet in the cloud, with a proper lock on every drawer).

Here is what now happens for real:

- You sign up once and you are logged in instantly, on any device.
- The moment you create an account, a 15 percent welcome voucher is automatically dropped into it.
- Your bookings save to your account, and your My Account page shows your stays and your vouchers.
- There is a security rule baked into the database itself: you can only ever see your own data. Even someone clever poking around behind the scenes cannot read anyone else's. This is not a curtain hiding things in the browser; it is a locked door enforced by the database.

And the part built specifically to show off: the **Admin** dashboard now sits right in the top menu for everyone to see, because it is part of the flex. But seeing it is not the same as using it. The dashboard only unlocks for an account marked as an admin. Anyone can sign up as a normal user; only an admin can open the control room and view the live list of accounts, bookings, and vouchers. Visible to all, usable by few, and that gate is enforced by the locked-door rule, not just hidden buttons.

---

## Chapter 6: The troubles we hit (and how we got past them)

No honest build diary skips the messy bits. Here are the real ones.

**The dashes that would not die.** Those fancy long dashes kept sneaking into text. We swept them out of every file and wrote a permanent rule so they can never come back. Plain hyphens only, forever.

**The disappearing files.** As mentioned, the original giant pages kept getting cut off mid-edit. Splitting everything into shared files was the cure, and it is why the rest of the build went smoothly.

**The silent webhook.** When we first connected the site to Make, the data was technically arriving but in a scrambled, unreadable shape, so it looked like nothing was happening. The fix was a single setting that had been quietly mangling the message in transit. Once removed, everything flowed cleanly.

**The stubborn automation import.** We tried to set up the Make automation by importing a pre-built blueprint, and it kept rejecting it as "invalid" or claiming a piece was missing. After a few rounds we gave up fighting the importer and built that one email step by hand inside Make, which worked first try. Lesson: sometimes the shortcut costs more than the long way.

**The email that refused free Gmail.** We wanted emails sent from a personal Gmail, and the system flatly refused, for security reasons on Google's side that no amount of cleverness gets around. So we switched to Brevo, a service built for exactly this.

**The Promotions tab.** Once emails were sending, they landed in Gmail's "Promotions" tab rather than the main inbox. That is normal for anything that looks like a discount offer and comes from a generic sender. The real fix (a proper custom domain with verified sending) is a job for when the site goes live, not a flaw in the build.

**The font saga.** The original Playfair font looked thin and broken at big sizes. We switched to Marcellus, which was elegant but only comes in one weight, so bold headings looked artificially thickened. We are now trying Cormorant Garamond. Fonts turned out to be the fussiest, most opinion-driven part of the whole project, and the cheapest to change, so we kept experimenting.

**The instant-signup snag.** When we switched on real accounts, new sign-ups were being forced to click a confirmation email before they could log in, which kills the smooth "sign up and you are in" experience we wanted for a live demo. We added a rule on the database so new accounts are trusted immediately, so people are logged in the moment they join.

---

## Chapter 7: What we learnt

**Boring foundations beat clever features.** The least glamorous decision (splitting the files so nothing repeats) unlocked everything else. Get the plumbing right and the pretty stuff becomes easy.

**Real beats fake, and people can tell.** A fake login looks identical to a real one until someone opens it on their phone. The jump from "looks like it works" to "actually works" was where the project earned the right to be shown off.

**Security is a place, not a curtain.** Hiding a button is not protection. Putting the rule in the database, where it cannot be bypassed, is. That distinction is the difference between a demo and a product.

**Shortcuts are a gamble.** Pre-built blueprints and one-click imports saved zero time twice over. Doing the small thing by hand was faster than debugging the magic.

**Done is a moving line.** Every "final" pass turned up one more thing to tighten. That is not failure, that is the work. We kept the quality bar high and kept going.

---

## Chapter 8: The booking page goes cinematic

We had six different design directions mocked up for the site, and Mun picked the "Cinematic" one for the booking page. So we rebuilt the booking experience around it.

Instead of the old wizard where five steps stacked down a single page, booking is now a sequence of full-screen scenes. Each step (the room, the dates, the extras, your details, and the welcome) gets its own moment with a big headline and a soft background, and you move between them with a "Continue" button at the bottom. A slim progress bar shows where you are.

The star of the new design is the "live receipt", a frosted glass card that floats on the right side of the screen the whole time. As you change anything (pick a bigger apartment, choose dates, add airport pickup), the receipt updates instantly and the total gives a little pulse so you can see it react. It is a calm, trustworthy way to always know the price without hunting for it.

The important part, and the part that took the care: none of the actual booking brain was rebuilt. The price calculations, the calendar, the discount tiers, the promo codes, the saving to our database, the preferences form at the end, all of that is the same proven machinery underneath. We just dressed it in the new look and rewired the buttons. We even kept the old layout hidden in the background so nothing the code expects ever goes missing.

A couple of touches we added while we were in there. The calendar used to show three months at once, which was too wide for the new glass panel, so it now shows one month with little arrows to flip forward. The "Continue" button politely refuses to advance until you have actually chosen your dates. If you try to confirm without dates, it gently sends you back to the calendar. Empty required fields give a small shake. And on a phone, the whole thing folds down into a clean top-to-bottom scroll instead of fighting the small screen.

We tested every button, every step, both on a laptop and a phone screen, and watched the price update correctly through weekly and monthly discount tiers. The original booking styling is kept on the shelf as a fallback, just in case.

Then we made the calendar honest. Until now it showed every future date as bookable, which is fine for a demo but not the real thing. Now the calendar reads actual bookings from our database and greys out the dates that are genuinely taken, per apartment. It even gets the hotel detail right: the day someone checks out is open again for the next guest to check in. We did this carefully so a stranger browsing the booking page can see which dates are free without ever seeing who booked them. The guest's name and contact still get saved with every booking for our own records; the public calendar only ever sees the dates. We tested the whole loop: make a booking, and those nights immediately show as taken the next time someone opens the page. Then we cleared out the test bookings so the data is clean.

---

## Chapter 9: The whole site goes Liquid Glass

After the booking page, Mun wanted the same level of polish everywhere, in a single, coherent look. The direction was "Liquid Glass", the design language Apple introduced for 2026: a deep, near-black canvas with translucent frosted-glass panels that float above it and catch the light. Glass only where glass earns it, the floating nav, the cards, the pop-ups, the booking widget, never smeared over everything.

So we flipped the entire site from its old light theme to dark, page by page. The yellow stayed as the sharp accent, and the brand's terracotta became the warm one. Two places deliberately break the dark to give the eye a rest: the homepage Magazine band and the whole Legal page sit on warm paper, because nobody should have to read long text on dark glass.

The smart part was the plumbing. We built one shared stylesheet that holds the entire look, the colours, the glass recipe, the buttons, the forms, the nav, every pop-up, and a page simply opts in by adding one word to its tag. The navigation bar is the same on every page: a single floating glass pill, centred at the top, that on a phone tidies into a logo and a menu button that opens a glass drawer. We did this without touching the navigation code on any page, so nothing broke.

The homepage was rebuilt from the top down: a cinematic hero with a glass booking card that actually works (pick an apartment and the price and guest limit update, then it carries your dates straight into the search), glass feature tiles, glass room cards, a glass stats bar, glass guest quotes, then the warm Magazine break, and a bold yellow closing call to action. Every other page, the apartments, about, magazine, FAQ, careers, search results, the account area, the admin control room, and the legal pages, was brought into the same language.

The promise to Mun was simple: expensive and thorough beats half-finished. So nothing is held together with tape. We stripped out every old light-theme colour baked into the pages so the dark theme is real, not a patch on top. We checked every page in the browser: every button, the apartment filters and photo galleries, the FAQ accordion, the article filter, the application form, the search and sort, the account gate, the admin dashboard, and the full booking flow, all working with zero errors. We confirmed real data still lands in the database (page visits, the offer test, and booking steps all recorded correctly while we tested). We checked it on a laptop, a tablet width, and a phone, with no sideways scrolling. And we kept the no-dashes house rule across the whole project.

---

## Where things stand now

The site is fast, mobile-friendly, and consistent. The booking flow works. Leads, bookings, signups, and applications flow into a real database and trigger designed, personalised emails. People can create genuine accounts, collect vouchers, and see their own bookings on any device. There is a real admin control room, visible to all and unlockable only by an admin.

A few finishing touches remain for when it goes live: wiring up the last couple of automatic emails, settling on the final heading font, and, when the site gets its own web address, the email-sender setup that lands messages straight in the inbox.

Not bad for a project that started as ten oversized files that kept getting cut in half.

*Built by Penguin and Mun. For educational purposes only.*
