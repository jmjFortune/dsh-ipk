# DeepSeekHarness-iStoreOS 0.2.0-rc.2-2

基于 EIGHTfs/DeepSeekHarness-NAS 的原生 iStoreOS 适配。官方 DSH 核心为 `0.2.0-rc.2`，末尾 `-2` 是本适配的打包修订。

## Release 附件

- `deepseek-harness_0.2.0-rc.2-2_x86_64.ipk`：核心服务与私有 Node/musl 运行时。
- `luci-app-deepseek-harness_0.2.0-rc.2-2_all.ipk`：LuCI 配置页面。
- `SHA256SUMS`：两个安装包的校验值。

下载后执行 `sha256sum -c SHA256SUMS`。安装和配置步骤见 [安装指南](../istoreos-ipk.md)。API Key 在 Harness 内设置。

## 本次变更

- musl 应用体与私有 Node v24.16.0，不替换固件运行库。
- UCI 配置、专属非 root 用户、procd 服务和 LuCI RPC 权限控制。
- 官方启动公告中的登录凭据写入私有文件，校验当前进程后交换 cookie，解决日志轮转导致无法打开工作空间的问题。
- LuCI 表单与动态主机列表对齐，提供直接打开工作空间的入口。
- 压缩档安装运行体，核心 opkg 文件清单缩为 8 项；重装清理旧模块，卸载保留外部数据。

## 已验证

- x86_64 架构的安装和升级。
- 配置、默认工作区保留和 procd 非 root 运行。
- 未认证 HTTP 401、认证页面 HTTP 200、WebSocket 101；匿名登录 RPC 拒绝，授权 RPC 成功。
- PNG、SQLite、flock、Node 内部加载器和 PTY 原生操作。
- OpenWrt 临时容器旧版升级、同版本重装清理和卸载保留数据。
- 安装包结构、权限、Installed-Size、登录边界测试。

实际模型请求、全部插件、完整 LuCI 保存交互、系统重启和 SDK 编译未验证。ARM 构建入口存在，尚无已验证的 ARM 安装包。
