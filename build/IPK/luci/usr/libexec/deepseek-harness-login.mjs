import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Only an authenticated LuCI operator with the app ACL can invoke this RPC.
// The private record must belong to the current procd process and configured port.
try {
  const run = (file, args) => execFileSync(file, args, {
    encoding: 'utf8', timeout: 3000, maxBuffer: 2 * 1024 * 1024,
  }).trim();
  const service = JSON.parse(run('/bin/ubus', ['call', 'service', 'list',
    '{"name":"deepseek-harness"}']));
  const instance = service['deepseek-harness']?.instances?.main;
  if (!instance?.running || !Number.isSafeInteger(instance.pid))
    throw new Error('服务未运行，请先启用服务并保存。');
  const listen = run('/sbin/uci', ['-q', 'get', 'deepseek-harness.main.listen']);
  if (listen !== '0.0.0.0') throw new Error('请将监听地址设为所有 IPv4 接口并保存。');
  const port = Number(run('/sbin/uci', ['-q', 'get', 'deepseek-harness.main.port']));
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Web 端口配置无效。');
  const dataDir = run('/sbin/uci', ['-q', 'get', 'deepseek-harness.main.data_dir']);
  if (!path.isAbsolute(dataDir) || path.resolve(dataDir) !== dataDir)
    throw new Error('数据目录配置无效。');
  const recordPath = path.join(dataDir, '.dsh', 'web-login.json');
  const fd = fs.openSync(recordPath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  let record;
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || stat.size > 1024)
      throw new Error('登录凭据文件权限无效。');
    record = JSON.parse(fs.readFileSync(fd, 'utf8'));
  } finally {
    fs.closeSync(fd);
  }
  if (record.version !== 1 || record.pid !== instance.pid || record.port !== port
      || typeof record.token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(record.token))
    throw new Error('登录凭据正在更新，请稍后重试。');
  const token = record.token;
  const response = await fetch(`http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}`, {
    redirect: 'manual', signal: AbortSignal.timeout(3000),
  });
  if (![302, 303].includes(response.status) || !response.headers.has('set-cookie'))
    throw new Error('当前登录凭据暂不可用，请稍后重试。');
  await response.body?.cancel();
  console.log(JSON.stringify({ token, port }));
} catch (error) {
  const message = error instanceof Error && /^[\u4e00-\u9fff]/.test(error.message)
    ? error.message : '暂时无法获取登录链接，请稍后重试。';
  console.log(JSON.stringify({ error: message }));
}
