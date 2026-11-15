/** @type {import('next').NextConfig} */
const nextConfig = {
  // 允许用独立目录做隔离构建（例如本地已有 dev server 占用 .next 时）：
  // RG_DIST_DIR=.next-verify npm run build
  ...(process.env.RG_DIST_DIR ? { distDir: process.env.RG_DIST_DIR } : {}),
  output: 'standalone',
  // 关闭左下角 Next.js 内置 dev 指示器（那个 N 气泡），避免遮挡侧边栏底部的开关
  devIndicators: false,
  reactStrictMode: true,
  serverExternalPackages: [
    'imapflow',
    'mammoth',
    'mailparser',
    'tesseract.js',
    'sharp',
    'pdfjs-dist',
    'canvas',
    'tsx'
  ],
  turbopack: {},
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // 客户端构建时禁止 canvas
      config.resolve.alias = config.resolve.alias || {}
      config.resolve.alias.canvas = false
    } else {
      // 服务器端移除 canvas 别名，使用原生包
      if (config.resolve.alias?.canvas) {
        delete config.resolve.alias.canvas
      }
    }
    return config
  },
}

export default nextConfig
