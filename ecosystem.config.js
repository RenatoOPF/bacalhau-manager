// Configuração do PM2 — mantém o backend sempre de pé no notebook-servidor.
// Uso: pm2 start ecosystem.config.js
//
// O frontend roda na Vercel; o Cloudflare Tunnel expõe este backend na internet.
module.exports = {
  apps: [
    {
      name: 'bacalhau-backend',
      cwd: './backend',
      // Roda o build de produção (gere antes com: npm run build --workspace backend)
      script: 'dist/main.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
