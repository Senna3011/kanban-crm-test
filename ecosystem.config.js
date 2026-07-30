module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { PORT: 3000, NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'worker',
      script: 'worker/index.js',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
