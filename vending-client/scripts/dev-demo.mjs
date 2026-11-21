import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clientDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(clientDir, '..');
const simulatorPath = path.join(repoRoot, 'iot-simulator', 'simulator.py');
const backendUrl = process.env.FRESHVEND_BACKEND_URL || 'http://localhost:3000';

function readRootEnv(name) {
  const envPath = path.join(repoRoot, '.env');
  if (!existsSync(envPath)) return '';
  const line = readFileSync(envPath, 'utf8').split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return '';
  return line.slice(line.indexOf('=') + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
}

let simulator;
let vite;
let shuttingDown = false;

function stopChildren() {
  if (shuttingDown) return;
  shuttingDown = true;
  simulator?.kill();
  vite?.kill();
}

function launchVite() {
  const viteBin = path.join(clientDir, 'node_modules', 'vite', 'bin', 'vite.js');
  vite = spawn(process.execPath, [viteBin], { cwd: clientDir, stdio: 'inherit' });
  vite.on('error', (error) => {
    console.error(`[Vending Client] Không khởi động được Vite: ${error.message}`);
    stopChildren();
    process.exitCode = 1;
  });
  vite.on('exit', (code) => {
    stopChildren();
    process.exitCode = code ?? 0;
  });
}

function launchSimulator(command, args, allowFallback = false) {
  const secret = process.env.IOT_DEVICE_SECRET || readRootEnv('IOT_DEVICE_SECRET');
  const simEnv = { ...process.env };
  if (secret) simEnv.IOT_DEVICE_SECRET = secret;
  simulator = spawn(command, args, { cwd: repoRoot, env: simEnv, stdio: 'inherit' });
  simulator.on('error', (error) => {
    if (allowFallback && error.code === 'ENOENT') {
      launchSimulator('py', ['-3', simulatorPath, '--machine', 'VM001', '--url', backendUrl, '--loop']);
      return;
    }
    console.warn(`[Vending Client] Không tự chạy được IoT Simulator: ${error.message}`);
    console.warn('[Vending Client] Cài Python hoặc tự chạy iot-simulator/simulator.py; giao diện vẫn khởi động.');
  });
  simulator.on('exit', (code) => {
    if (!shuttingDown && code && code !== 0) {
      console.warn(`[Vending Client] Simulator đã dừng (mã ${code}).`);
    }
  });
}

process.on('SIGINT', stopChildren);
process.on('SIGTERM', stopChildren);

console.log('[Vending Client] Tự khởi động simulator VM001; Backend cần chạy tại', backendUrl);
launchSimulator('python', [simulatorPath, '--machine', 'VM001', '--url', backendUrl, '--loop'], true);
launchVite();
