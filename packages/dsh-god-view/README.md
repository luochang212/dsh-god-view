# dsh-god-view

给并行 agent 一个上帝视角：谁在做什么、谁占着哪个文件、什么时候释放。DSH 插件，默认开启，面板上一个开关可以关掉。

这是 DSH 适配层；通用的 board store、协议和 CLI 在 [`godview`](https://www.npmjs.com/package/godview)。

## 安装

```sh
dsh plugin --profile desktop add dsh-god-view
```

重启 DSH，侧边栏会出现「上帝视角 / God's Eye」。

## 它做什么

- **Presence**：每个会话一行 focus，说明它现在在做什么。
- **Claim**：写文件前自动拿一段租约；另一个会话持有同一路径时写入被拒绝。
- **Change**：记录谁在哪个会话、为什么、占了哪些文件，以及 claim/release 时间轴。

每个仓库一个 board，互不阻塞；全局项目索引只做导航，不合并租约。

## 配置

```yaml
- insert:
    - id: dsh-god-view
      name: dsh-god-view
      config:
        heartbeatMs: 15000
        ttlMs: 60000
        autoClaimTtlMs: 600000
        releaseAutoOnIdle: true
```

`root` 默认留空，用于监控多个项目；只有默认的 `~/.dsh/parallel` 不合适时才设置 `registryDir`。

## CLI

CLI 由核心包提供，不随适配层直接暴露为可执行文件。需要时单独安装：

```sh
npm install -g godview
godview claims
godview changes
```

也可以从本仓库直接运行：

```sh
node packages/godview/bin/godview.mjs claims
```

## 关闭协作

面板头部的开关关闭后，插件完全 dormant：不创建 board、不写 presence、不拿租约、不注册 `team_*` 工具、不拦截写入。重新打开后恢复。

## 文档

- [README（完整）](https://github.com/luochang212/dsh-god-view/blob/main/README.md)
- [协议](https://github.com/luochang212/dsh-god-view/blob/main/docs/protocol.md)
- [决策档案](https://github.com/luochang212/dsh-god-view/tree/main/adr)

## License

MIT
