import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Script } from 'node:vm';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-login-test-'));
const recordPath = path.join(directory, 'web-login.json');
const preload = new URL('./files/usr/lib/deepseek-harness/capture-login.mjs', import.meta.url).pathname;
const helper = fs.readFileSync(new URL('./luci/usr/libexec/deepseek-harness-login.mjs', import.meta.url), 'utf8')
  .split('\n').filter(line => !line.startsWith('import ')).join('\n');
const fixtureToken = 'A'.repeat(43);
const env = { ...process.env, DSH_HOME: directory, DSH_WEB_PORT: '28000' };
function announce() {
  const result = spawnSync(process.execPath, ['--import', preload, '--input-type=module', '-e', `
    import fs from 'node:fs';
    import assert from 'node:assert/strict';
    const file = process.env.DSH_HOME + '/web-login.json';
    assert.equal(fs.existsSync(file), false, 'stale record must be removed before ready');
    console.log('unrelated ?token=ignored');
    console.log('dsh web: http://127.0.0.1:28001/?token=${fixtureToken}');
    assert.equal(fs.existsSync(file), false, 'wrong port must not be captured');
    console.log('dsh web: http://127.0.0.1:28000/?token=${fixtureToken} (LAN: http://192.168.1.1:28000/?token=${fixtureToken})');
    const record = JSON.parse(fs.readFileSync(file));
    assert.equal(record.pid, process.pid);
  `], { env, encoding: 'utf8' });
  assert.equal(result.status, 0, 'startup capture failed');
  return JSON.parse(fs.readFileSync(recordPath));
}
async function invoke(record, running = true) {
  const replies = [];
  let exchanges = 0;
  await new Script('(async () => {' + helper + '\n})()').runInNewContext({
    fs,
    path: { ...path, join: () => recordPath },
    execFileSync(file, args) {
      assert.notEqual(file, '/sbin/logread', 'login must work without system logs');
      if (file === '/bin/ubus') return JSON.stringify({ 'deepseek-harness': { instances: {
        main: { running, pid: record.pid },
      } } });
      assert.equal(file, '/sbin/uci');
      return { 'deepseek-harness.main.listen': '0.0.0.0',
        'deepseek-harness.main.port': '28000', 'deepseek-harness.main.data_dir': '/srv/deepseek-harness' }[args[2]];
    },
    fetch: async (url) => {
      exchanges++;
      assert.equal(new URL(url).searchParams.get('token'), fixtureToken);
      return { status: 302, headers: { has: key => key === 'set-cookie' }, body: { cancel() {} } };
    },
    AbortSignal, console: { log: value => replies.push(JSON.parse(value)) },
  });
  assert.equal(replies.length, 1);
  return { reply: replies[0], exchanges };
}
try {
  fs.writeFileSync(recordPath, '{"pid":1}', { mode: 0o600 });
  const first = announce();
  assert.equal(fs.statSync(recordPath).mode & 0o777, 0o600);
  const second = announce();
  assert.notEqual(first.pid, second.pid);
  const valid = await invoke(second);
  assert.equal(valid.reply.token, fixtureToken);
  assert.equal(valid.exchanges, 1);
  for (const invalid of [
    { ...second, pid: first.pid }, { ...second, port: 28001 },
    { ...second, token: 'invalid' }, { ...second, version: 0 },
  ]) {
    fs.writeFileSync(recordPath, JSON.stringify(invalid));
    const result = await invoke(second);
    assert.ok(result.reply.error);
    assert.equal(result.exchanges, 0, 'stale or malformed records must never be exchanged');
  }
  fs.writeFileSync(recordPath, JSON.stringify(second));
  fs.chmodSync(recordPath, 0o644);
  assert.ok((await invoke(second)).reply.error, 'public file must be rejected');
  fs.chmodSync(recordPath, 0o600);
  assert.ok((await invoke(second, false)).reply.error, 'stopped process must be rejected');
  const savedPath = path.join(directory, 'saved.json');
  fs.renameSync(recordPath, savedPath);
  fs.symlinkSync(savedPath, recordPath);
  assert.ok((await invoke(second)).reply.error, 'symlink must be rejected');
  fs.unlinkSync(recordPath);
  assert.ok((await invoke(second)).reply.error, 'missing file must be rejected');
  fs.chmodSync(directory, 0o755);
  const insecure = spawnSync(process.execPath, ['--import', preload, '-e', ''], { env });
  assert.notEqual(insecure.status, 0, 'public directory must prevent startup');
  console.log('PASS startup capture/replacement, private permissions, no-log login, stale PID/port/token/version and symlink rejection');
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
