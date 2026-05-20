import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Remote logos / avatars rendered via next/image.
    remotePatterns: [
      { protocol: "https", hostname: "www.groundk.co.kr" },
      { protocol: "https", hostname: "admin.rideus.net" },
    ],
  },
};

export default nextConfig;
