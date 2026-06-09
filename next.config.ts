import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Exclude Remotion's bundler/renderer from webpack - they use native modules
  // (esbuild, chromium) that can't be bundled by webpack.
  // These packages are dynamically imported at runtime only during video rendering.
  serverExternalPackages: [
    '@remotion/bundler',
    '@remotion/renderer',
    '@remotion/cli',
    'remotion',
    'esbuild',
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Mark Remotion packages as external on the server side
      // They'll be loaded via dynamic import() at render time
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(
          '@remotion/bundler',
          '@remotion/renderer',
          '@remotion/cli',
          'remotion',
        );
      }
    }
    return config;
  },
  // Empty turbopack config to silence the warning in dev mode
  turbopack: {},
};

export default nextConfig;
