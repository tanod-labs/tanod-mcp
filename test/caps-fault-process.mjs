// Fault injection in an independent process. Builtin patches are test-only, before importing caps.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const paths = new Map();
const originals = { ...fs };
const target = process.env.CAPS_FILE;
const phase = process.env.CAPS_PHASE;
function boundary(name) {
  if (phase !== name) return;
  process.send({ boundary: name });
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); // parent SIGKILLs, not a simulated throw
}
fs.openSync = (...args) => { const fd = originals.openSync(...args); paths.set(fd, String(args[0])); return fd; };
fs.mkdirSync = (...args) => { const v = originals.mkdirSync(...args); if (args[0] === `${target}.lock`) boundary('acquired'); return v; };
fs.readFileSync = (...args) => { const v = originals.readFileSync(...args); if (paths.get(args[0]) === target) boundary('read'); return v; };
fs.writeFileSync = (...args) => { const v = originals.writeFileSync(...args); if (paths.get(args[0])?.endsWith('.tmp')) boundary('write'); return v; };
fs.renameSync = (...args) => { if (args[1] === target) boundary('before-rename'); const v = originals.renameSync(...args); if (args[1] === target) boundary('after-rename'); return v; };
syncBuiltinESMExports();
const { SpendCaps } = await import('../dist/caps.js');
new SpendCaps({ stateFile: target, maxPerCallUsd: 1, maxPerDayUsd: 1,
  now: () => new Date('2026-10-18T12:00:00Z') }).reserve(800000n);
process.send({ unexpected: 'reservation returned' });
process.disconnect();
