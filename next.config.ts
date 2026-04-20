import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Projekt-Ordner explizit als Root setzen — sonst pickt Next.js die leere
    // package-lock.json in /Users/joana/ als Workspace-Root.
    root: import.meta.dirname,
  },
};

export default nextConfig;
