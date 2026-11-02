import type { NextConfig } from "next";

// Static export for GitHub Pages, served under /<repo>.
const nextConfig: NextConfig = {
  output: "export",
  basePath: process.env.PAGES_BASE_PATH ?? "",
  images: { unoptimized: true },
};

export default nextConfig;
