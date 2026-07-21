module.exports = {
  apps: [
    {
      name: "control-clinico",
      script: "dist/server.cjs",
      cwd: __dirname,
      env: {
        NODE_ENV: "production"
      },
      error_file: "logs/pm2-error.log",
      out_file: "logs/pm2-out.log"
    }
  ]
};
