# DeepSeekHarness-iStoreOS

DeepSeek Harness 的 iStoreOS 原生 IPK 适配，提供 LuCI 管理页面，无需 Docker 运行服务。

基于 [EIGHTfs/DeepSeekHarness-NAS](https://github.com/EIGHTfs/DeepSeekHarness-NAS) 的适配思路，使用官方 `@deepseek-ai/dsh`。本仓库专注 iStoreOS，保留原项目来源；依赖包的许可证随运行体保留。

## 当前版本

- 安装包：`0.2.0-rc.2-2`（DSH 核心 `0.2.0-rc.2`，打包修订 `2`）。
- 私有 Node：`v24.16.0`，musl 运行库；不替换固件的 libc 或 Node。
- 当前验证架构：`x86_64`；需要支持 opkg 和 JS LuCI 的 iStoreOS/OpenWrt 系统。
- 服务通过专属非 root 用户和 procd 运行；配置使用 UCI，管理入口在 LuCI。

## 安装

从 [GitHub Release](https://github.com/jmjFortune/dsh-ipk/releases) 下载以下附件，上传到路由器有足够空间的目录：

| 文件 | 用途 |
|---|---|
| `deepseek-harness_0.2.0-rc.2-2_x86_64.ipk` | 核心服务、私有 Node 和运行库 |
| `luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk` | LuCI 配置页面 |
| `SHA256SUMS` | 安装包校验值 |

在附件所在目录执行：

```sh
sha256sum -c SHA256SUMS
opkg update
opkg install ./deepseek-harness_0.2.0-rc.2-2_x86_64.ipk ./luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk
```

在“服务 → DeepSeek Harness”选择持久化数据目录，设置监听地址和信任主机，启用服务并保存应用，再点击“打开工作空间”。API Key 在 Harness 内配置。默认不启用服务，默认监听 localhost。

核心包约 157 MiB，安装后约 708 MiB。升级会先解压临时运行体，建议预留至少 2 GiB 安装/升级空间，另留工作区和会话数据空间。

[完整安装与配置指南](docs/istoreos-ipk.md) · [发布说明与验证范围](docs/releases/istoreos-0.2.0-rc.2-2.md)

## 构建

需要 Python 3 和 Docker Desktop/Engine。Docker 仅用于构建 musl 应用体，路由器运行不需要 Docker。

```sh
python3 build/IPK/build-ipk.py --arch x86_64
python3 build/IPK/check-ipk.py build/staging/ipk/deepseek-harness_0.2.0-rc.2-2_x86_64.ipk build/staging/ipk/luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk
```

构建锁文件和镜像版本固定。生成的应用体位于 `build/master-build/ipk-x86_64/payload/`，安装包位于 `build/staging/ipk/`；这些目录不进入 Git。

仅重新封装已有应用体：

```sh
python3 build/IPK/pack-ipk.py --payload build/master-build/ipk-x86_64/payload --arch x86_64
```

构建器拒绝覆盖非空 payload。完整重建前先归档已有 payload，避免旧文件混入。`--reuse-app` 仅在 npm 锁文件一致时复用缓存。

## 验证

```sh
node build/IPK/test-login-record.mjs
node build/IPK/test-luci-login.mjs
python3 -m py_compile build/IPK/*.py
```

已配置设备可运行以下测试；将 `router.lan` 替换为设备的地址或域名：

```sh
python3 build/IPK/test-device.py --ssh root@router.lan --host router.lan
python3 build/IPK/test-login-rpc.py --ssh root@router.lan --host router.lan
```

已通过原生模块、非 root 服务、HTTP 401/200、WebSocket 101，以及升级保留配置和工作区测试。登录入口使用私有当前进程凭据，不依赖会轮转的系统日志；保留官方 token/cookie 鉴权。卸载保留外部数据目录。

实际模型请求、全部插件、完整 LuCI 保存交互、系统重启和 SDK 编译未验证。`aarch64_generic` 构建入口存在，尚未完成 ARM 安装包验证。

## 目录

```text
build/IPK/                  构建器、运行适配、LuCI 页面和测试
  control/                  安装、升级及卸载钩子
  files/                    UCI、procd 和运行入口
  luci/                     LuCI 页面、菜单及 RPC 权限
  package-lock.json         锁定的 npm 依赖
  Makefile                  OpenWrt SDK 包定义（未实测）
docs/istoreos-ipk.md         详细指南
docs/releases/              发布记录
```

发布时源码通过 Git 上传，两个 IPK 和 SHA256SUMS 作为 Release 附件分发。构建缓存和安装包不加入源码仓库。
