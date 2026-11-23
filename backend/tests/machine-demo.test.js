const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const Machine = require('../src/modules/machines/machine.model');
const service = require('../src/modules/machines/machine.service');
const demo = require('../src/modules/machines/machine.demo');

const machineId = '8fd61456-cef0-497a-8a4a-b88aa3aee00c';
const machine = {
  id: machineId,
  machineCode: 'VM001',
  lifecycleStatus: 'ACTIVE',
  connectionStatus: 'OFFLINE',
  operationStatus: 'OFFLINE',
  healthStatus: 'NORMAL',
  minTemperature: 2,
  maxTemperature: 8,
};

test('demo control starts and stops simulated machine connectivity', async () => {
  const original = {
    findById: Machine.findById,
    findSlotsByMachineId: Machine.findSlotsByMachineId,
    recordSimulatorStatus: Machine.recordSimulatorStatus,
    recordSimulatorConnection: Machine.recordSimulatorConnection,
  };
  const previousNodeEnv = process.env.NODE_ENV;
  const previousStateFile = process.env.MACHINE_DEMO_STATE_FILE;
  const stateFile = path.join(os.tmpdir(), `freshvend-demo-${process.pid}.json`);
  const writes = [];
  let connectionStatus = 'OFFLINE';
  Machine.findById = async () => ({ ...machine, connectionStatus, lastSeenAt: new Date() });
  Machine.findSlotsByMachineId = async () => [];
  Machine.recordSimulatorStatus = async (_id, payload) => {
    writes.push(payload);
    connectionStatus = payload.connectionStatus;
  };
  Machine.recordSimulatorConnection = async (_id, payload) => {
    writes.push(payload);
    connectionStatus = payload.connectionStatus;
  };
  process.env.NODE_ENV = 'development';
  process.env.MACHINE_DEMO_STATE_FILE = stateFile;

  try {
    const [started] = await Promise.all([
      service.setDemoMachineRunning(machineId, true),
      service.setDemoMachineRunning(machineId, true),
    ]);
    assert.equal(started.connectionStatus, 'ONLINE');
    assert.equal(started.demoActive, true);
    assert.equal(writes[0].temperature, 5);
    assert.equal(writes.length, 1);
    assert.equal(demo.isActive(machineId), true);
    assert.deepEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')), [machineId]);

    const stopped = await service.setDemoMachineRunning(machineId, false);
    assert.equal(stopped.connectionStatus, 'OFFLINE');
    assert.equal(stopped.demoActive, false);
    assert.equal(writes.at(-1).connectionStatus, 'OFFLINE');
    assert.deepEqual(JSON.parse(await fs.readFile(stateFile, 'utf8')), []);

    await fs.writeFile(stateFile, JSON.stringify([machineId]));
    delete require.cache[require.resolve('../src/modules/machines/machine.demo')];
    const restartedDemo = require('../src/modules/machines/machine.demo');
    await restartedDemo.restore();
    assert.equal(restartedDemo.isActive(machineId), true);
    await restartedDemo.stop(machineId);

    process.env.NODE_ENV = 'production';
    await assert.rejects(
      service.setDemoMachineRunning(machineId, true),
      { errorCode: 'MACHINE_DEMO_DISABLED' },
    );
  } finally {
    if (demo.isActive(machineId)) await demo.stop(machineId);
    Object.assign(Machine, original);
    await fs.rm(stateFile, { force: true });
    await fs.rm(`${stateFile}.tmp`, { force: true });
    if (previousStateFile === undefined) delete process.env.MACHINE_DEMO_STATE_FILE;
    else process.env.MACHINE_DEMO_STATE_FILE = previousStateFile;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});
