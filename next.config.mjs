/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // ffmpeg-static resolves its binary relative to its own package dir; keep it
  // out of the server bundle so that path survives the build.
  serverExternalPackages: ["ffmpeg-static"],
  images: { unoptimized: true },
};

export default nextConfig;
