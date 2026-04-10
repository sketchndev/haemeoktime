module.exports = {
    apps: [
      {
        name: 'haemeoktime-backend',
        cwd: './backend',
        script: 'python3.11',
        args: '-m uvicorn main:app --host 0.0.0.0 --port 8000',
        interpreter: 'none',
      },
      {
        name: 'haemeoktime-frontend',
        cwd: './frontend',
        script: 'npx',
        args: 'serve -s dist -l 5173',
        interpreter: 'none',
      },
    ],
 };
  