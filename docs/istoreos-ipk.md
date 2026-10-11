# DeepSeekHarness-iStoreOS：原生 IPK 适配

本适配基于 [EIGHTfs/DeepSeekHarness-NAS](https://github.com/EIGHTfs/DeepSeekHarness-NAS) 的平台适配思路，源码入口为 `build/IPK/`。先构建 musl 应用体，再封装 IPK；核心使用官方 `@deepseek-ai/dsh` npm 包。

## 当前目标和状态

- 当前验证架构为 `x86_64`，需要支持 opkg 和 JS LuCI 的 iStoreOS/OpenWrt 系统。
- 数据目录必须位于持久化存储；请按实际挂载情况选择目录，勿使用 tmpfs 保存会话和凭据。
- 已通过原生模块、procd 非 root 运行、HTTP 401/200、WebSocket 101、服务重启数据保留和默认工作区验证。
- 固定 DSH 0.2.0-rc.2、pnpm 10.32.1，Docker 基础镜像按 digest 固定，Node 为 v24.16.0。完整 npm 锁文件随构建源码保存。
- x86_64 是当前验证目标。构建器还接受 aarch64_generic，但 ARM 产物没有完成验证，不应作为正式支持承诺。

## 产物

| 包 | 内容 |
|---|---|
| `deepseek-harness_<版本>_x86_64.ipk` | DSH、私有 Node/musl 运行库、UCI 配置和 procd 服务 |
| `luci-app-deepseek-harness_<版本>_all.ipk` | LuCI 的服务配置和状态页面 |
| `SHA256SUMS` | 两个 IPK 的 SHA-256 校验值 |

安装包默认输出到 `build/staging/ipk/`，不自动发布 Release。

## 构建

需要 Python 3 和已启动的 Docker Desktop/Engine。构建器通过 Docker 的目标平台环境构建应用体。

```sh
python3 build/IPK/build-ipk.py --arch x86_64
python3 build/IPK/check-ipk.py build/staging/ipk/deepseek-harness_0.2.0-rc.2-2_x86_64.ipk build/staging/ipk/luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk
```

`build-ipk.py` 构建镜像并在目标容器中调用 `build-payload.sh`；后者执行锁定的 `npm ci`、重新编译 node-pty、验证原生模块，再复制应用体和私有运行库。`DSH_REUSE_APP=1` 是容器内部的缓存开关，由 `--reuse-app` 设置；仅在锁文件完全一致时复用已有 npm 目录。

应用体位于 `build/master-build/ipk-x86_64/payload/`。Node 的 ELF interpreter 和 RPATH 指向 `/usr/lib/deepseek-harness/runtime/`；musl 可执行辅助程序也采用这个私有 loader，不替换路由器的 libc 或 Node。npm 包保留其各自许可证，另保存 Node 的发行版 LICENSE。

打包修订 2 将应用体封装成 `payload.tar.gz`，由核心包 postinst 解开；opkg 只管理少量适配文件，避免升级时针对两万多项 npm 文件反复读取旧清单。独立打包器的 Installed-Size 包含压缩档和解包后的运行文件。核心包 postrm 在卸载时清理固定的 `/usr/lib/deepseek-harness` 应用目录，保留外部数据目录与用户账号。SDK 构建路径尚未实测。

构建器遇到已存在的 payload 会停止，避免旧文件混入新包。重新构建前先将旧 payload 移到备份位置，或使用新的工作副本。修改版本时需同时更新 `config.json`、`package.json`、`package-lock.json`；SDK `Makefile` 的版本也必须对应更新。

仅重新封装已经验证过的应用体：

```sh
python3 build/IPK/pack-ipk.py --payload build/master-build/ipk-x86_64/payload --arch x86_64
```

## 安装与初次配置

确认 `opkg print-architecture` 包含 `x86_64`，系统为支持 JS LuCI 的 iStoreOS/OpenWrt。x86_64 核心 IPK 约 157 MiB，Installed-Size 为 741,863,044 字节（约 708 MiB，包含保留的压缩档）。升级会先解压到临时目录，再替换旧应用体；建议预留至少 2 GiB 安装/升级空间，另留会话和工作空间需要的数据空间。将两个 IPK 放到路由器上空间足够的目录，再执行：

```sh
opkg update
opkg install /实际存放路径/deepseek-harness_0.2.0-rc.2-2_x86_64.ipk
opkg install /实际存放路径/luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk
```

包依赖 `bash`、`ca-bundle`、`git-http`（含 git 和 HTTPS 支持）、`libubox`、`procd`；LuCI 包依赖 `luci-base` 和 `rpcd`。软件源必须与固件匹配。LuCI 安装钩子会重载 rpcd 权限并保留当前登录会话；安装后刷新 LuCI，进入“服务 → DeepSeek Harness”。若旧包安装后菜单不显示，执行 `/etc/init.d/rpcd reload` 再刷新。只刷新浏览器不会更新已有登录会话的权限组。

1. 数据目录填写已挂载磁盘上的独立子目录，例如 `/mnt/sda1/deepseek-harness`。必须替换成设备实际路径；数据目录父目录要先存在。
2. 监听地址选择 `0.0.0.0`，信任主机列表加入浏览器访问时使用的地址或域名，例如 `router.lan`。DSH 只支持 `127.0.0.1` 和 `0.0.0.0`，不能绑定具体 IP 或 IPv6。端口默认为 28000。
3. 勾选启用服务，保存并应用。
4. 点击“打开工作空间”，LuCI 会通过受权限保护的 RPC 获取当前进程的登录链接，自动交换登录 cookie，无需手动复制 SSH 日志中的 token。
5. 在 Harness 的模型设置中配置 API Key；凭据不写入 UCI 或 LuCI 表单。

启动时适配器把官方进程 token 写入数据目录下的 `.dsh/web-login.json`（目录权限 700，文件权限 600，专属服务用户所有）。RPC 校验当前 procd PID、端口、文件权限和实际 token 换 cookie 结果后才返回链接，不再依赖会轮转的系统日志。每次启动清除旧记录并写入新凭据；此文件不含模型 API Key。升级到打包修订 2 会重启 Harness 一次以生成记录。

首次安装默认不启动 DSH，监听默认为 127.0.0.1。安装钩子仍注册 UCI 配置变更触发器，LuCI 首次启用后会自动启动服务；这条流程已通过真实 procd 事件验证。升级保留 UCI 配置和外部数据目录，已有 enabled=1 时安装钩子会重新启动服务。

该 Agent 能执行所配置工作区中的命令。使用专属非 root 账号运行；监听范围、信任主机和官方 token/cookie 鉴权共同构成访问入口。此适配保留官方 token/cookie 鉴权，不添加 WAN 防火墙放行规则。所有 IPv4 接口监听需搭配实际设备的防火墙设置；不能把信任主机误认为用户身份认证。

使用局域网兼容桥接，在已认证的 HTML 入口注入 `ownsHost`（让局域网浏览器使用服务端设置）和 `crypto.randomUUID` 的普通 HTTP 补齐。不会修改后端鉴权函数，也不会更改用户已有的 `profiles/web/cordis.patch.yml`；监听设置使用独立的 web.patch.json overlay。工作区控制器的 documentsDirectory 指向数据目录下的 documents，避免 OpenWrt 缺少 xdg-user-dir 时默认工作区创建失败。

## 日常管理

```sh
/etc/init.d/deepseek-harness start
/etc/init.d/deepseek-harness stop
/etc/init.d/deepseek-harness restart
ubus call service list '{"name":"deepseek-harness"}'
logread -e serve
```

Node 堆上限默认 512 MB；它不是进程总内存上限。工作区、会话、API Key 和插件保存在配置的数据目录中；运行临时文件、缓存也放在那里。procd 负责进程跟踪、重启和日志，没有单独的后台调度器。

卸载先停服务，删除软件包，保留数据目录和专属用户。不要将路由器系统目录作为 Agent 工作区或数据目录。

## SDK 集成

`build/IPK/Makefile` 提供 OpenWrt SDK 的两个包定义。复制整个 `build/IPK/` 目录到 SDK 的 `package/deepseek-harness/`，传入已经验证、架构匹配的应用体路径：

```sh
make package/deepseek-harness/compile V=s DSH_PAYLOAD_DIR=/绝对路径/payload
```

SDK 路线尚未在目标固件 SDK 上实测；当前交付采用本项目独立封装器产生 opkg 格式 IPK。SDK 不会在交叉编译过程中运行目标 Node，只检查应用体的架构、版本和 libc 元数据。

## 验证范围

- `test-native.mjs` 执行 PNG 编解码、SQLite 查询、flock 成功/争用检测、Node 内部模块加载和 PTY bash 子进程测试。
- `check-ipk.py` 检查 IPK 外层结构、嵌套运行档、控制元数据、安装钩子、Installed-Size、配置保留声明、文件属主、权限和 LuCI 文件位置。
- 打包修订 `0.2.0-rc.2-2` 的核心 opkg 文件清单为 8 项；已通过安装与升级测试，临时容器通过重装清理过期模块和卸载保留数据测试。
- 服务测试需验证未认证入口 401、token 换 cookie 后入口 200、`/api/remote.mux` WebSocket 升级 101。
- 已通过 procd 账号、停止/启动数据保留、401/200/101、默认工作区和 LuCI 菜单/管理入口验证。完整 LuCI 保存交互、系统重启、实际模型请求、Agent 命令及全部插件未验收。
- 语音等额外插件可能携带与固件不兼容的独立二进制；首版未逐个验证，不保证全部插件可用。

## 设备测试

设备测试使用 SSH BatchMode，需提前配置密钥认证。`test-device.py` 可对已配置的设备执行只读测试，验证 procd 专属用户、HTTP 鉴权、LAN 桥接、WebSocket 和 LuCI 静态入口；登录 token 只在内存中使用，不输出。

```sh
python3 build/IPK/test-device.py --ssh root@router.lan --host router.lan
```

## 发布记录

见 [0.2.0-rc.2-2 发布说明](releases/istoreos-0.2.0-rc.2-2.md)。
