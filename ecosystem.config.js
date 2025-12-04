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

      // === FIX INTEGRATION START ===
      // Even though watch is false below, we define what to ignore
      // in case you ever enable it or run with --watch CLI flag.
      ignore_watch: [
        "node_modules",
        "sessions",           // Ignores session file changes (Prevent restart loop)
        "*.log",              // Ignores log file updates
        "/var/log/keysocket"  // Ignores your specific log directory
      ],
      // === FIX INTEGRATION END ===

      watch: false, // Set to true if you want auto-restart on code changes
      error_file: '/var/log/keysocket/err.log',
      out_file: '/var/log/keysocket/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm Z'
    }
  ]
};
