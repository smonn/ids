import { defineRouteMiddleware } from "@astrojs/starlight/route-data";

// The homepage uses Starlight's `splash` template, which sets `hasSidebar:
// false`. That also drops the mobile menu toggle, because the hamburger lives
// inside the sidebar `<nav>` (see Starlight's PageFrame.astro) — so on a phone
// the splash page has no way to open the docs navigation.
//
// Force the sidebar back on for the homepage. On mobile this restores the
// hamburger (the sidebar pane stays hidden until tapped); on desktop, custom.css
// hides the sidebar column so the splash hero stays full-width.
export const onRequest = defineRouteMiddleware((context) => {
  if (context.url.pathname === "/") {
    context.locals.starlightRoute.hasSidebar = true;
  }
});
