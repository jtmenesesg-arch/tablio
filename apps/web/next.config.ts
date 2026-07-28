import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tablio/application", "@tablio/payments-simulated"],
};

export default nextConfig;
