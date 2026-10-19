import type { NextConfig } from "next";

// GitHub Pages serves the site under /<repo-name>. The deploy workflow sets
// NEXT_PUBLIC_BASE_PATH=/cyberpunk-lore; locally it is empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const config: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default config;
