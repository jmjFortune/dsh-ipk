import fs from 'node:fs';
import path from 'node:path';

const [dataDir, host, portText, heapText, proxy] = process.argv.slice(2);
try {
  if (!dataDir || !path.isAbsolute(dataDir) || path.resolve(dataDir) !== dataDir)
    throw new Error('数据目录必须是规范的绝对路径，请先在 LuCI 配置持久化存储目录。');
  if (/^\/(?:$|etc(?:\/|$)|usr(?:\/|$)|bin(?:\/|$)|sbin(?:\/|$)|lib(?:\/|$)|dev(?:\/|$)|proc(?:\/|$)|sys(?:\/|$)|tmp(?:\/|$)|root(?:\/|$))/.test(dataDir))
    throw new Error('请选择独立的数据目录，例如 /mnt/sda1/deepseek-harness。');
  if (!fs.existsSync(path.dirname(dataDir)))
    throw new Error('数据目录的父目录不存在，请检查磁盘是否已挂载。');
  if (fs.realpathSync(path.dirname(dataDir)) !== path.dirname(dataDir))
    throw new Error('数据目录的父目录不能是软链接，请使用实际挂载路径。');
  if (fs.existsSync(dataDir) && fs.realpathSync(dataDir) !== dataDir)
    throw new Error('数据目录及其父目录不能是软链接，请使用实际挂载路径。');
  const port = Number(portText), heap = Number(heapText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('端口必须在 1024–65535 之间。');
  if (!/^\d+$/.test(heapText) || !Number.isInteger(heap) || heap < 128 || heap > 32768)
    throw new Error('Node 堆上限必须在 128–32768 MB 之间。');
  if (!['127.0.0.1', '0.0.0.0'].includes(host))
    throw new Error('DSH 监听地址仅支持 127.0.0.1 或 0.0.0.0。');
  if (proxy && !['http:', 'https:'].includes(new URL(proxy).protocol))
    throw new Error('代理必须使用 http:// 或 https://。');
  fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  for (const name of ['.dsh', 'tmp', '.cache', 'documents']) {
    const dir = path.join(dataDir, name);
    if (fs.existsSync(dir) && fs.realpathSync(dir) !== dir)
      throw new Error(`${name} 不能是软链接。`);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const patch = [
    { id: 'webserver', config: { host, port } },
    { id: 'workspace-controller', config: { documentsDirectory: path.join(dataDir, 'documents') } },
  ];
  const patchPath = path.join(dataDir, 'web.patch.json');
  if (fs.existsSync(patchPath) && fs.lstatSync(patchPath).isSymbolicLink())
    throw new Error('web.patch.json 不能是软链接。');
  fs.writeFileSync(patchPath, JSON.stringify(patch, null, 2) + '\n', { mode: 0o600 });
  fs.chmodSync(patchPath, 0o600);
} catch (error) {
  console.error(`deepseek-harness: ${error.message}`);
  process.exitCode = 1;
}
