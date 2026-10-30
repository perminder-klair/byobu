import createMDX from "@next/mdx";

const withMDX = createMDX({ options: { remarkPlugins: ["remark-gfm"] } });

export default withMDX({
  pageExtensions: ["ts", "tsx", "mdx"],
  // /manual/getting-started/, with the slash, so it can be served from plain files too.
  trailingSlash: true,
  images: { qualities: [75, 85] },
});
