/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Never publish browser source maps (tests/security/dist.test.js checks this).
  productionBrowserSourceMaps: false,
};

export default nextConfig;
