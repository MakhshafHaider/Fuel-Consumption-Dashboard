import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // xlsx is a CommonJS package whose non-standard exports crash Turbopack.
  // Listing it here forces Next.js to transpile it before bundling.
  transpilePackages: ["xlsx"],
};

export default nextConfig;
