/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.68.82'], // Your phone IP
  experimental: {
    turbo: false, // Disables Turbopack for builds to fix prerender errors in Next.js 16
  },
};

export default nextConfig;
