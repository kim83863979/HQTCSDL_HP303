const Machine = require('./machine.model');
const fs = require('node:fs/promises');
const path = require('node:path');

const HEARTBEAT_INTERVAL_MS = 15_000;
const activeMachines = new Map();
const startingMachines = new Map();
let desiredMachines;
let fileWrite = Promise.resolve();

function stateFile() {
  return process.env.MACHINE_DEMO_STATE_FILE || path.join(__dirname, '../../../.demo-machines.json');
}

async function loadDesiredMachines() {
  if (desiredMachines) return desiredMachines;
  try {
    const saved = JSON.parse(await fs.readFile(stateFile(), 'utf8'));
    if (!Array.isArray(saved)) throw new Error('Danh sách máy demo không hợp lệ.');
    desiredMachines = new Set(saved);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    desiredMachines = new Set();
  }
  return desiredMachines;
}

async function remember(machineId, enabled) {
  fileWrite = fileWrite.catch(() => {}).then(async () => {
    const desired = await loadDesiredMachines();
    const next = new Set(desired);
    if (enabled) next.add(machineId);
    else next.delete(machineId);
    const filename = stateFile();
    await fs.writeFile(`${filename}.tmp`, JSON.stringify([...next]), 'utf8');
    await fs.rename(`${filename}.tmp`, filename);
    desiredMachines = next;
  });
  await fileWrite;
}

function isActive(machineId) {
  return activeMachines.has(machineId);
}

async function start(machine, { persist = true } = {}) {
  if (isActive(machine.id)) return;
  if (startingMachines.has(machine.id)) return startingMachines.get(machine.id);

  const task = (async () => {
    const temperature = (Number(machine.minTemperature) + Number(machine.maxTemperature)) / 2;
    await Machine.recordSimulatorStatus(machine.id, {
      connectionStatus: 'ONLINE',
      operationStatus: 'IDLE',
      healthStatus: 'NORMAL',
      doorStatus: 'CLOSED',
      temperature,
      humidity: 60,
    });
    if (persist) await remember(machine.id, true);

    const timer = setInterval(() => {
      Machine.recordSimulatorConnection(machine.id, {
        connectionStatus: 'ONLINE',
        operationStatus: 'IDLE',
      }).catch((error) => {
        console.error(`[MACHINE_DEMO] Heartbeat failed for ${machine.machineCode}:`, error);
      });
    }, HEARTBEAT_INTERVAL_MS);
    timer.unref();
    activeMachines.set(machine.id, timer);
  })();
  startingMachines.set(machine.id, task);
  try {
    await task;
  } finally {
    startingMachines.delete(machine.id);
  }
}

async function stop(machineId) {
  const timer = activeMachines.get(machineId);
  if (!timer) return false;
  await remember(machineId, false);
  clearInterval(timer);
  activeMachines.delete(machineId);
  await Machine.recordSimulatorConnection(machineId, {
    connectionStatus: 'OFFLINE',
    operationStatus: 'OFFLINE',
  });
  return true;
}

async function restore() {
  if (process.env.NODE_ENV === 'production') return;
  const desired = await loadDesiredMachines();
  for (const machineId of desired) {
    try {
      const machine = await Machine.findById(machineId);
      if (machine?.lifecycleStatus === 'ACTIVE') await start(machine, { persist: false });
    } catch (error) {
      console.error(`[MACHINE_DEMO] Could not restore ${machineId}:`, error);
    }
  }
}

module.exports = { isActive, start, stop, restore };
