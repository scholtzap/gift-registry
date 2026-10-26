/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // RLS is per-connection GUC state; a pooled connection must never be reused
  // across roles, so the app asserts the role it set on every transaction.
  serverExternalPackages: ["pg", "pg-boss"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
