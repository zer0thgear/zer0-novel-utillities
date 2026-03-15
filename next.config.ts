import type { NextConfig } from "next";

// When deploying to GitHub Pages the site lives at /repo-name/.
// Set NEXT_PUBLIC_BASE_PATH=/your-repo-name in the build environment.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const nextConfig: NextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath,
  trailingSlash: true,
  images: {
    unoptimized: true, // required for static export
  },
};

export default nextConfig;
