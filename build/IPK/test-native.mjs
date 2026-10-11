import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';

const root = process.argv[2];
const require = createRequire(path.join(root, 'package.json'));
const sharp = require('sharp');
const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#123456' } }).png().toBuffer();
assert.equal((await sharp(png).metadata()).width, 2);
console.log('PASS sharp PNG encode/decode');

const db = new DatabaseSync(':memory:');
assert.equal(db.prepare('SELECT 42 AS n').get().n, 42);
db.close();
console.log('PASS built-in SQLite query');

const flock = await import(pathToFileURL(require.resolve('@deepseek-ai/node-addon-system/flock')));
const scratch = mkdtempSync(path.join(tmpdir(), 'dsh-ipk-native-'));
try {
  const fd = openSync(path.join(scratch, 'lock'), 'w');
  try {
    await flock.tryLockExclusive(fd);
    const contender = openSync(path.join(scratch, 'lock'), 'w');
    try { await assert.rejects(flock.tryLockExclusive(contender), error => ['EAGAIN', 'EWOULDBLOCK'].includes(error.code)); }
    finally { closeSync(contender); }
  }
  finally { closeSync(fd); }
} finally { rmSync(scratch, { recursive: true }); }
console.log('PASS musl flock native binding');

require('node-addon-require-builtin');
console.log('PASS Node internal-module loader');

const pty = require('node-pty');
await new Promise((resolve, reject) => {
  const terminal = pty.spawn('/bin/bash', ['-c', 'printf pty-ready'], { name: 'xterm', cols: 80, rows: 24 });
  let output = '';
  const timer = setTimeout(() => { terminal.kill(); reject(new Error('PTY timeout')); }, 10000);
  terminal.onData(text => { output += text; });
  terminal.onExit(({ exitCode }) => {
    clearTimeout(timer);
    try { assert.equal(exitCode, 0); assert.match(output, /pty-ready/); resolve(); }
    catch (error) { reject(error); }
  });
});
console.log('PASS node-pty bash execution');
