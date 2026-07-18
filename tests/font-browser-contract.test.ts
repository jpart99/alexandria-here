import assert from "node:assert/strict";
import test from "node:test";

import { auditBrowserFontReferences } from "../scripts/font-browser-contract.mjs";

const baseUrl = new URL("https://alexandria.example/");
const allowedPublicPaths = [
  "/witness-fonts/geist-latin.woff2",
  "/witness-fonts/cormorant-garamond-latin.woff2",
];
const validLanding = `
  <link rel="preload" href="/witness-fonts/geist-latin.woff2" as="font" type="font/woff2" crossorigin="anonymous">
  <link rel="preload" href="/witness-fonts/cormorant-garamond-latin.woff2" as="font" type="font/woff2" crossorigin>
`;
const validCss = `
  /* url("/fonts/comment-only.woff2") */
  @font-face { src: url("../witness-fonts/geist-latin.woff2") format("woff2"); }
  @font-face { src: url('/witness-fonts/cormorant-garamond-latin.woff2') format('woff2'); }
`;

function audit({ landingHtml = validLanding, linkHeader = "", css = validCss } = {}) {
  return auditBrowserFontReferences({
    baseUrl,
    landingHtml,
    linkHeader,
    allowedPublicPaths,
    stylesheets: [{ url: new URL("/assets/index.css", baseUrl), css }],
  });
}

test("browser font audit accepts only the two exact aliases across CSS and preloads", () => {
  const result = audit();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.cssAliases, [...allowedPublicPaths].sort());
  assert.deepEqual(result.preloadAliases, [...allowedPublicPaths].sort());
});

test("comments cannot satisfy CSS aliases and extra font preloads fail closed", () => {
  const commentsOnly = audit({
    css: `/* url("${allowedPublicPaths[0]}") */\n/* url("${allowedPublicPaths[1]}") */`,
    landingHtml: `${validLanding}<link rel="preload" href="/witness-fonts/extra.woff2" as="font" type="font/woff2" crossorigin>`,
  });
  assert.equal(commentsOnly.errors.some((error) => error.includes("extra.woff2")), true);
  assert.equal(commentsOnly.errors.filter((error) => error.includes("Served CSS omits font alias")).length, 2);

  const commentedPreloads = audit({
    landingHtml: `<!-- ${validLanding} -->`,
  });
  assert.equal(commentedPreloads.errors.filter((error) => error.includes("Browser preloads omit font alias")).length, 2);
});

test("encoded, escaped, queried, cross-origin, data, and physical font URLs are rejected", () => {
  const cases = [
    `url("/f%6Fnts/geist-latin.woff2")`,
    String.raw`url("\2f fonts/geist-latin.woff2")`,
    `url("${allowedPublicPaths[0]}?v=1")`,
    `url("https://fonts.example/geist.woff2")`,
    `url("data:font/woff2;base64,d09GMg==")`,
    `url("/other/font.ttf")`,
    `url("/f%6Fnts/broken.woff2%ZZ")`,
    `url("/witness-fonts/geist%2dlatin.woff2")`,
  ];
  for (const candidate of cases) {
    const result = audit({ css: `${validCss}\n.selector { background: ${candidate}; }` });
    assert.notDeepEqual(result.errors, [], candidate);
  }

  const encodedHtml = audit({
    landingHtml: `${validLanding}<a href="/f%6Fnts/geist-latin.woff2">raw</a>`,
  });
  assert.equal(encodedHtml.errors.some((error) => error.includes("physical font path")), true);
});

test("Link-header font preloads are validated with the same exact contract", () => {
  const result = audit({
    linkHeader: [
      "</witness-fonts/geist-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
      "</fonts/cormorant-garamond-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
    ].join(", "),
  });
  assert.equal(result.errors.some((error) => error.includes("/fonts/cormorant")), true);

  const quotedComma = audit({
    linkHeader: [
      "</witness-fonts/geist-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin; title=\"one,two\"",
      "</fonts/cormorant-garamond-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
    ].join(", "),
  });
  assert.equal(quotedComma.errors.some((error) => error.includes("/fonts/cormorant")), true);
});

test("duplicate preloads fail closed within either browser surface", () => {
  const duplicateHtml = audit({ landingHtml: `${validLanding}${validLanding}` });
  assert.equal(duplicateHtml.errors.some((error) => error.includes("Browser duplicates font preload")), true);

  const duplicateHeader = audit({
    linkHeader: [
      "</witness-fonts/geist-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
      "</witness-fonts/geist-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
    ].join(", "),
  });
  assert.equal(duplicateHeader.errors.some((error) => error.includes("Browser duplicates font preload")), true);

  const duplicateAcrossSurfaces = audit({
    linkHeader: "</witness-fonts/geist-latin.woff2>; rel=preload; as=font; type=font/woff2; crossorigin",
  });
  assert.equal(duplicateAcrossSurfaces.errors.some((error) => error.includes("Browser duplicates font preload")), true);
});

test("inline, style-attribute, and extensionless font-face URLs fail closed", () => {
  const inline = audit({
    landingHtml: `${validLanding}<style>.x { background: url('/fonts/raw'); }</style>`,
  });
  assert.equal(inline.errors.some((error) => error.includes("unexpected font URL")), true);

  const attribute = audit({
    landingHtml: `${validLanding}<div style="background:url(&#47;fonts&#47;raw)"></div>`,
  });
  assert.equal(attribute.errors.some((error) => error.includes("unexpected font URL")), true);

  const extensionless = audit({
    css: `${validCss}\n@font-face { font-family: unsafe; src: url('/asset?id=font'); }`,
  });
  assert.equal(extensionless.errors.some((error) => error.includes("/asset?id=font")), true);

  const opaqueData = audit({
    css: `${validCss}\n@font-face { font-family: unsafe; src: url('data:application/octet-stream;base64,d09GMg=='); }`,
  });
  assert.equal(opaqueData.errors.some((error) => error.includes("data font")), true);

  const indirect = audit({
    css: `${validCss}\n:root { --unsafe-font: url('/asset?id=font'); }\n@font-face { font-family: unsafe; src: var(--unsafe-font); }`,
  });
  assert.equal(indirect.errors.some((error) => error.includes("variable indirection")), true);
});

test("active script URL attributes cannot hide the physical font namespace", () => {
  const result = audit({
    landingHtml: `${validLanding}<script src="/fonts/geist-latin.woff2">window.example = true;</script>`,
  });
  assert.equal(result.errors.some((error) => error.includes("physical font path")), true);
});
