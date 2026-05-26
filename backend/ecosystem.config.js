'use strict';

module.exports = {
  apps: [
    {
      name: 'lhb-mms-backend',

      // Entry point is the compiled JS.
      // PM2 runs this relative to cwd below: node backend/dist/index.js
      script: 'backend/dist/index.js',

      // MUST be the project root — dotenv resolves .env from here,
      // and Prisma resolves @prisma/client from root node_modules/.
      cwd: 'E:/Apps/lhb-mms',

      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Production/test environment variables.
      // Start with: pm2 start backend/ecosystem.config.js --env production
      env_production: {
        NODE_ENV:       'production',
        PORT:           '3001',
        // Replace CHANGE_ME with the actual lhb_app password set in PostgreSQL
        DATABASE_URL:   'postgresql://lhb_app:Lhb@8899@127.0.0.1:5432/lhb_mms',
        // Generate with: -join ((1..64)|%{'{0:X2}'-f(Get-Random -Max 256)})
        JWT_SECRET:     'CHANGE_ME_64_CHAR_RANDOM_STRING',
        JWT_EXPIRES_IN: '8h',
        BCRYPT_ROUNDS:  '12',
        // Must exactly match the URL users open in their browser (no trailing slash)
        FRONTEND_URL:   'http://199.1.1.32',
        // Required for HTTP-only test servers — prevents Secure cookie flag blocking auth
        COOKIE_SECURE:  'false',
        // Uncomment if corporate proxy intercepts HTTPS (causes npm/Prisma SSL errors):
        // NODE_TLS_REJECT_UNAUTHORIZED: '0',
      },

      out_file:        'E:/Apps/lhb-mms/logs/backend-out.log',
      error_file:      'E:/Apps/lhb-mms/logs/backend-err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      watch: false,
    },
  ],
};
