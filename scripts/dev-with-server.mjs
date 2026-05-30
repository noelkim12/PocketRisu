import { spawn } from 'node:child_process';

const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const serverPort = process.env.PORT ?? '6001';
const devServerTarget = process.env.POCKETRISU_DEV_SERVER_TARGET ?? `http://localhost:${serverPort}`;

const children = new Set();
let shuttingDown = false;

function start(name, args, env = {}) {
  const child = spawn(pnpm, args, {
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
      ...env,
    },
  });

  children.add(child);

  child.on('exit', (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;

    shuttingDown = true;
    const reason = signal ? `${name} exited with signal ${signal}` : `${name} exited with code ${code ?? 0}`;
    console.log(`[dev] ${reason}. Stopping remaining processes...`);
    stopChildren();
    process.exitCode = code ?? (signal ? 1 : 0);
  });

  child.on('error', (error) => {
    if (shuttingDown) return;

    shuttingDown = true;
    console.error(`[dev] Failed to start ${name}:`, error.message);
    stopChildren();
    process.exitCode = 1;
  });

  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }
}

function shutdown(signal) {
  if (shuttingDown) return;

  shuttingDown = true;
  console.log(`[dev] Received ${signal}. Stopping dev server and backend...`);
  stopChildren();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log(`[dev] Starting PocketRisu backend on port ${serverPort}`);
console.log(`[dev] Starting Vite with backend proxy target ${devServerTarget}`);

start('backend', ['run', 'runserver']);
start('vite', ['run', 'dev'], {
  POCKETRISU_DEV_SERVER_TARGET: devServerTarget,
});
