import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The "/" route handler reads the prototype hub HTML at runtime; make sure
  // the file is bundled into the serverless function on deploy.
  outputFileTracingIncludes: {
    "/": ["./krideus-prototype/prototype/index.html"],
  },
  images: {
    // Remote logos / avatars rendered via next/image.
    remotePatterns: [
      { protocol: "https", hostname: "www.groundk.co.kr" },
      { protocol: "https", hostname: "admin.rideus.net" },
    ],
  },
};

export default nextConfig;
