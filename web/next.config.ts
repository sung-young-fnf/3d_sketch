import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Thumbnails fall back to the remote Archisketch CDN when the local file has
  // not been downloaded yet. Plain <img> is used (no next/image optimizer), so
  // no remotePatterns config is required.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
