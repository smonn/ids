// @ts-check
import preact from "@astrojs/preact";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// The published library's public entry points. The API reference is generated
// straight from these source files' types, so it can never drift from the code.
const entryPoints = [
  "../src/index.ts",
  "../src/opaque.ts",
  "../src/reverse.ts",
  "../src/signed.ts",
  "../src/wrapped.ts",
  "../src/drizzle.ts",
  "../src/kysely.ts",
  "../src/prisma.ts",
  "../src/hono.ts",
  "../src/express.ts",
  "../src/fastify.ts",
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
            skipErrorChecking: true,
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
          ],
        },
        { label: "Validation", link: "/validation/" },
        { label: "Playground", link: "/playground/" },
        {
          label: "Adapters",
          items: [
            { label: "Hono", link: "/adapters/hono/" },
            { label: "Express", link: "/adapters/express/" },
            { label: "Fastify", link: "/adapters/fastify/" },
            { label: "Drizzle", link: "/adapters/drizzle/" },
            { label: "Kysely", link: "/adapters/kysely/" },
            { label: "Prisma", link: "/adapters/prisma/" },
          ],
        },
        { label: "CLI", link: "/cli/" },
        typeDocSidebarGroup,
      ],
    }),
    preact(),
  ],
});
