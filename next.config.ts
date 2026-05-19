import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // This project has its own lockfile; pin the workspace root so Turbopack
  // doesn't pick up an unrelated lockfile in a parent directory.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
