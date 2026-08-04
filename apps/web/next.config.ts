import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tablio/application", "@tablio/payments-simulated"],
  // Bottom-left is the default, but the diner PWA has a fixed bottom nav
  // there ("Carta") and a sticky topbar with a heavily-used cart button at
  // top-right ("Mi pedido, N productos") — the dev-only badge was capturing
  // clicks meant for those in e2e runs. Top-left is the only corner nothing
  // in the app relies on clicking (its "Volver a la carta" back button is
  // never asserted against in tests).
  devIndicators: {
    position: "top-left",
  },
};

export default nextConfig;
