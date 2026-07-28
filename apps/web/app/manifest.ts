import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tablio",
    short_name: "Tablio",
    description: "Pide y paga desde tu mesa.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8F7F3",
    theme_color: "#111110",
    lang: "es-CL",
    icons: [
      {
        src: "/icons/tablio-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
      },
      {
        src: "/icons/tablio-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
      },
    ],
  };
}
