// Child-process fixture: synthetic accounting only. No wallet, signature or network.
import { SpendCaps } from '../dist/caps.js';
const caps = new SpendCaps({ maxPerCallUsd: 1, maxPerDayUsd: 1, stateFile: process.env.CAPS_FILE,
  now: () => new Date(process.env.CAPS_NOW || '2026-10-18T12:00:00Z') });
process.send({ ready: true });
process.on('message', (msg) => {
  if (msg !== 'reserve') return;
  try { process.send({ decision: caps.reserve(800000n) }); }
  catch (e) { process.send({ error: e.message }); }
  process.disconnect();
});
