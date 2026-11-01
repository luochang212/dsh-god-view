# pi-god-view

给并行 agent 一个上帝视角：谁在做什么、谁占着哪个文件、什么时候释放。Pi coding agent 适配器，原生 TUI，不依赖 DSH 或浏览器。

这是 Pi 适配层；通用的 board store、协议和 CLI 在 [`godview`](https://www.npmjs.com/package/godview)。board 文件在仓库内的 `.dsh/parallel/`，因此 Pi 和 DSH 可以共享同一块看板。

## 安装

```sh
pi install npm:pi-god-view
```

首次 0.1.0 发布前，请使用下面的本地路径；发布后上面的 npm 命令才可用。

重启 Pi 或重新加载扩展后生效。本地开发可以直接指向包目录：

```sh
pi -e /absolute/path/to/dsh-god-view/packages/pi-god-view
```

## 它做什么

- **Presence**：每个 Pi 会话一行 focus，说明它现在在做什么。
- **Claim**：write/edit 前自动拿租约；另一个会话持有同一路径时写入被拒绝。
- **Change**：记录谁在哪个会话、为什么、占了哪些文件，以及 claim/release 时间轴。

每个仓库一个 board，互不阻塞；claim 是精确文件路径，不是目录或 glob。

## 三个工具

| 工具          | 作用                                                             |
| ------------- | ---------------------------------------------------------------- |
| `team_status` | 发布 status / focus / plan / files；`done` 会释放该会话全部租约  |
| `team_roster` | 读取当前仓库的 agents、focus、live claims、active/recent changes |
| `team_claim`  | claim / release / list 精确路径                                  |

模型在写文件前会自动 claim；显式 `team_claim` 适合计划性工作、review 租约或提前释放。会话空闲时会释放自动租约，显式租约保留到 release 或 TTL 到期。

## TUI 面板

```text
/godview # 切换当前仓库看板的 TUI widget
/godview on
/godview off
/godview status
```

面板每 2.5 秒刷新，只读：显示当前仓库的活跃会话、focus、live claims 和最近 changes。v1 没有 DSH 浏览器面板里的项目 rail、甘特图或协作开关。

> Pi 适配器在扩展启用期间始终开启协作。`/godview off` 只隐藏面板，不释放租约、不撤下工具；不需要协作时请移除扩展。

## 边界

- 只拦截 Pi 的 `write` / `edit`；bash 或 `run_code` 里的文件修改不在 guard 范围内。
- 只写 `.dsh/parallel/`，不引入数据库、daemon、全局锁或第二套协议。
- 没有 messages / inbox / composer；focus 是会话属性，不是消息。
- Pi v1 是 TUI-only，没有浏览器面板；需要浏览器看板时用 DSH 适配器。
- 运行时需要 Node >= 22.19（Pi 自身的要求），无 build step。

## 开发

```sh
npm install
npm run test -w pi-god-view
node --check packages/pi-god-view/extensions/pi-god-view.js
```

## License

MIT
