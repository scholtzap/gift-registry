/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // RLS is per-connection GUC state; a pooled connection must never be reused
  // across roles, so the app asserts the role it set on every transaction.
  serverExternalPackages: ["pg", "pg-boss", "@resvg/resvg-js", "sharp"],
  outputFileTracingIncludes: {
    '/c/**': ['./node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf'],
  },
  typedRoutes: true,
};

export default nextConfig;
