/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set PINATA_BASE_PATH=/app for the single-domain deployment
  // (pinata.scholtz.work/ is the landing page, pinata.scholtz.work/app is the app).
  // Unset everywhere else, including tests: circle URLs stay /c/<slug> at the root.
  ...(process.env.PINATA_BASE_PATH ? { basePath: process.env.PINATA_BASE_PATH } : {}),
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
