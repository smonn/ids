// @ts-check
import preact from "@astrojs/preact";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// The published library's public entry points. Keep this list in sync with the
// post-ADR-0018 slice layout — TypeDoc will error on missing paths.
const entryPoints = [
  "../src/index.ts",
  "../src/codecs/digest/index.ts",
  "../src/codecs/opaque/index.ts",
  "../src/codecs/reverse/index.ts",
  "../src/codecs/signed/index.ts",
  "../src/codecs/timestamp/index.ts",
  "../src/codecs/wrapped/index.ts",
  "../src/adapters/drizzle.ts",
  "../src/adapters/express.ts",
  "../src/adapters/fastify.ts",
  "../src/adapters/hono.ts",
  "../src/adapters/kysely.ts",
  "../src/adapters/mikro-orm.ts",
  "../src/adapters/prisma.ts",
  "../src/adapters/typeorm.ts",
  "../src/adapters/graphql.ts",
  "../src/adapters/nestjs.ts",
];

export default defineConfig({
  site: "https://ids.smonn.se",
  redirects: {
    "/api/": "/api/readme/",
  },
  integrations: [
    starlight({
      title: "@smonn/ids",
      description:
        "Public-facing branded IDs for TypeScript apps — type-safe, sortable, and codec-pluggable.",
      logo: { src: "./src/assets/logo.svg", alt: "@smonn/ids" },
      favicon: "/favicon.svg",
      customCss: ["./src/styles/custom.css"],
      // Force the sidebar on for the splash homepage so the mobile hamburger
      // renders there (see src/starlightRouteData.ts). custom.css hides the
      // sidebar column on desktop to keep the hero full-width.
      routeMiddleware: "./src/starlightRouteData.ts",
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/smonn/ids" }],
      editLink: {
        baseUrl: "https://github.com/smonn/ids/edit/main/website/",
      },
      // Social-card metadata. Starlight emits og:title/og:description per page;
      // a single shared og:image (1200x630) covers link previews everywhere.
      head: [
        { tag: "meta", attrs: { property: "og:image", content: "https://ids.smonn.se/og.png" } },
        { tag: "meta", attrs: { property: "og:image:width", content: "1200" } },
        { tag: "meta", attrs: { property: "og:image:height", content: "630" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: "https://ids.smonn.se/og.png" } },
      ],
      plugins: [
        starlightTypeDoc({
          entryPoints,
          tsconfig: "../tsconfig.json",
          output: "api",
          sidebar: { label: "API reference", collapsed: true },
          typeDoc: {
            excludeInternal: true,
            githubPages: false,
          },
        }),
      ],
      sidebar: [
        {
          label: "Getting started",
          items: [
            { label: "Overview", link: "/" },
            { label: "Quickstart", link: "/quickstart/" },
            { label: "Choosing a codec", link: "/codecs/choosing/" },
          ],
        },
        {
          label: "Codecs",
          items: [
            { label: "Timestamp", link: "/codecs/timestamp/" },
            { label: "Reverse Timestamp", link: "/codecs/reverse/" },
            { label: "Signed Timestamp", link: "/codecs/signed/" },
            { label: "Opaque Timestamp", link: "/codecs/opaque/" },
            { label: "Wrapped key", link: "/codecs/wrapped/" },
            { label: "Digest", link: "/codecs/digest/" },
          ],
        },
        {
          // "Validation" holds two pages: the reference for the universal
          // surfaces, and the framework-integration recipes that ride on them
          // (tRPC, oRPC, TanStack, Zod, Next, …) — libraries trivial enough to
          // need no dedicated adapter slice.
          label: "Validation & integrations",
          items: [
            { label: "Standard Schema & JSON Schema", link: "/validation/" },
            { label: "Framework integrations", link: "/validation/integrations/" },
          ],
        },
        { label: "Playground", link: "/playground/" },
        {
          // Split into nested groups so the sidebar shows a divider (group
          // header) between the request/API-layer adapters and the
          // persistence-layer ones. Items within each group are alphabetical.
          label: "Adapters",
          items: [
            {
              label: "Web & API",
              items: [
                { label: "Express", link: "/adapters/express/" },
                { label: "Fastify", link: "/adapters/fastify/" },
                { label: "GraphQL", link: "/adapters/graphql/" },
                { label: "Hono", link: "/adapters/hono/" },
                { label: "NestJS", link: "/adapters/nestjs/" },
              ],
            },
            {
              label: "ORMs & query builders",
              items: [
                { label: "Drizzle", link: "/adapters/drizzle/" },
                { label: "Kysely", link: "/adapters/kysely/" },
                { label: "MikroORM", link: "/adapters/mikro-orm/" },
                { label: "Prisma", link: "/adapters/prisma/" },
                { label: "TypeORM", link: "/adapters/typeorm/" },
              ],
            },
          ],
        },
        { label: "CLI", link: "/cli/" },
        { label: "Error handling", link: "/errors/" },
        { label: "Wire format & porting", link: "/porting/" },
        typeDocSidebarGroup,
      ],
    }),
    preact(),
  ],
});
