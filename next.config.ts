import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The staff console has one address per section (src/components/admin/sections.ts); /admin opens the first.
  async redirects() {
    return [{ source: "/admin", destination: "/admin/rooms", permanent: false }];
  },
};

export default nextConfig;
