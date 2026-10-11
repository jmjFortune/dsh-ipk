import fs from 'node:fs';
import path from 'node:path';

// Upstream announces its process-local BrowserAuth token once via console.log.
// Keep that announcement available to the authenticated LuCI RPC after syslog rotates.
const directory = process.env.DSH_HOME;
const port = Number(process.env.DSH_WEB_PORT);
if (!directory || !path.isAbsolute(directory) || !Number.isInteger(port)
    || port < 1024 || port > 65535)
  throw new Error('deepseek-harness: invalid login capture configuration');
const directoryStat = fs.lstatSync(directory);
if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()
    || (directoryStat.mode & 0o077))
  throw new Error('deepseek-harness: login directory must be private');
const target = path.join(directory, 'web-login.json');
fs.rmSync(target, { force: true });
const originalLog = console.log;
console.log = function (...args) {
  const match = typeof args[0] === 'string'
    && /^dsh web: (http:\/\/[^\s]+)/.exec(args[0]);
  if (match) {
    const url = new URL(match[1]);
    const token = url.searchParams.get('token');
    if (['127.0.0.1', 'localhost'].includes(url.hostname)
        && Number(url.port) === port && /^[A-Za-z0-9_-]{43}$/.test(token || '')) {
      const temporary = `${target}.${process.pid}.tmp`;
      try {
        fs.writeFileSync(temporary, JSON.stringify({ version: 1, pid: process.pid, port, token }) + '\n',
          { flag: 'wx', mode: 0o600 });
        fs.renameSync(temporary, target);
        console.log = originalLog;
      } catch {
        fs.rmSync(temporary, { force: true });
        console.error('deepseek-harness: unable to save private login record');
        process.exit(1);
      }
    }
  }
  return originalLog.apply(this, args);
};
