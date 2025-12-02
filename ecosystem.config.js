module.exports = {
  apps: [
    {
      name: 'keysocket',
      script: 'server.js',
      cwd: '/var/www/keysocket.eu',
      // Preload dotenv so the app picks up `.env` from the cwd automatically
      node_args: ['-r', 'dotenv/config'],
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      autorestart: true,
      max_restarts: 10,
      // Restart the app automatically when it exceeds this memory threshold
      max_memory_restart: '300M',
      watch: false,
      error_file: '/var/log/keysocket/err.log',
      out_file: '/var/log/keysocket/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
