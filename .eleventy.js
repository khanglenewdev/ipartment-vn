/* ============================================================
   ipartment Vietnam - Reference Build One (Eleventy config)

   This is "the machine". It assembles pages out of the libraries
   in src/_includes and the data in src/_data. It ships nothing of
   its own to the visitor: the output in _site/ is plain fast HTML,
   CSS and JS, exactly like the old hand-built site.

   Source of truth lives under src/. The existing assets/ folder
   (CSS, JS, chatbot data, images) is copied through untouched, so
   every existing style and function keeps working.

   Pages NOT yet migrated to the layered system are listed in
   LEGACY_PAGES below and copied through as-is, so the whole site
   keeps working while we migrate it one page at a time.
   ============================================================ */

const LEGACY_PAGES = [
  "about.html",
  "accommodation.html",
  "booking.html",
  "career.html",
  "faq.html",
  "legal.html",
  "magazine.html",
  "my-account.html",
  "admin.html",
  "results.html"
];

module.exports = function (eleventyConfig) {
  // All real assets ship as-is (relative to project root).
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("robots.txt");
  eleventyConfig.addPassthroughCopy("sitemap.xml");

  // Legacy pages: copied through untouched until each is migrated to src/.
  LEGACY_PAGES.forEach(function (file) {
    eleventyConfig.addPassthroughCopy(file);
  });

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "html", "md"]
  };
};
