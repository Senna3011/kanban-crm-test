module.exports = {
  apps: [
    {
      name: 'web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { PORT: 3099, NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
    {
      name: 'worker',
      script: 'node_modules/.bin/tsx',
      args: 'worker/index.ts',
      env: { NODE_ENV: 'production' },
      instances: 1,
      exec_mode: 'fork',
    },
  ],
};
