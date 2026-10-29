<div align="right">
  <a href="README.md"><img src="https://img.shields.io/badge/-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-545759?style=for-the-badge" alt="简体中文" /></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/-English-A31F34?style=for-the-badge" alt="English" /></a>
</div>

# Agent 协作台

**dsh-parallel** · 多 Agent 协作看板 / DSH plugin

<p>
  <img src="https://img.shields.io/badge/version-0.3.0-0e7490?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/protocol-3-0e7490?style=flat-square" alt="protocol" />
  <img src="https://img.shields.io/badge/DSH-plugin-0e7490?style=flat-square" alt="DSH plugin" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-0e7490?style=flat-square" alt="node" />
  <img src="https://img.shields.io/badge/license-MIT-0e7490?style=flat-square" alt="license" />
  <a href="https://github.com/luochang212/dsh-parallel/actions/workflows/ci.yml"><img src="https://github.com/luochang212/dsh-parallel/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

**让同一仓库里的多个 Agent 看得见彼此，不抢同一个文件，并且留下可回看的占用时间轴。**

它不是一个聊天工具，也不是一个人工指挥台。它是一个只读的协作看板：

- 谁在做什么（当前会话的一句话 focus）；
- 哪个文件正被谁占用（file lease）；
- 什么时候占用、什么时候释放、被谁占用（claim/release timeline）。

<p align="center">
  <img src="screenshots/01-panel.png" alt="Agent 协作台：项目侧边栏与占用甘特图" width="100%" />
</p>

_界面示意（演示数据）。_

## ✨ 它解决什么问题

多个 Agent 同时改一个仓库时，最容易出问题的不是“不会写代码”，而是：

- 不知道彼此正在做什么；
- 同时改同一个文件，后写覆盖先写；
- 做完之后，说不清谁在什么时候动过哪个文件。

Agent 协作台只做三件事：

| 能力              | 说明                                        |
| ----------------- | ------------------------------------------- |
| **Presence**      | 每个会话一行 focus，显示它现在在干嘛        |
| **Claim / Lease** | 写入前先占用文件；有冲突直接拒绝            |
| **Timeline**      | 记录每次 claim、release、expire，形成甘特图 |

没有消息队列，没有收件箱，没有“待回复”。focus 就是当前会话的属性，不需要回复，也没有生命周期。

## 🧠 三个概念

### Presence：一句话表示“我在干嘛”

每个 DSH 会话在所在仓库里有一条 presence：

- focus：当前工作的一句话；
- status：active / idle / blocked / done；
- heartbeat：证明它还活着；
- sessionTitle：人类可读的对话标题。

focus 会自动从首条用户/子 Agent prompt 推断，也可以用 team_status 主动更新。

### Claim：一个文件一段租约

Agent 写文件前先拿 lease：

- 默认 **auto**：第一次 write/edit 自动 claim；
- 其他 Agent 的 live claim 会直接阻止写入；
- 同一个 Agent 的 claim 可以续租；
- idle 时 auto claim 自动释放；
- explicit claim 需要显式 release，或等 TTL 过期。

claim 是精确到文件路径的，不支持目录或 glob。

### Change：把占用和释放串成时间轴

每次 claim 都属于一条 change：

- 哪个会话（sessionId + sessionTitle）；
- 要改什么（intent）；
- 改了哪些文件（paths）；
- 当前状态（claimed / done / expired）；
- 每次 claim / release / expire 的绝对时间和执行者。

前端把这些事件画成按文件分行的甘特图。条形从 claim 到 release；还活着的 lease 会延伸到当前时间，并用斜纹标出。

## 🖥️ 界面

一个只读界面，两栏 master-detail：

- **左侧项目栏**：全高、sticky；显示最近活跃项目、状态点、活跃会话数、占用数、进行中 change 数、最后活动时间；底部固定显示当前项目的活跃会话 / 文件占用统计。
- **右侧详情区**：当前项目路径、会话列表、占用甘特图、可展开的精确事件明细。
- **没有输入框**：没有 composer，没有消息框，没有“回复/释放”按钮。项目行是导航按钮，刷新是唯一的 action button。

窄屏时，左侧项目栏会自动变成横向可滚动列表。

## 🚀 快速开始

### 1. 安装到 DSH profile

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$PROFILE/node_modules"
ln -sfn /absolute/path/to/dsh-parallel "$PROFILE/node_modules/dsh-parallel-team"
```

### 2. 添加插件配置

在 $PROFILE/cordis.patch.yml 中加入：

```yaml
- insert:
    - id: parallel-team
      name: dsh-parallel-team
      config:
        heartbeatMs: 15000
        ttlMs: 60000
        claimPolicy: auto
        autoClaimTtlMs: 600000
        releaseAutoOnIdle: true
```

root 留空即可。每个 Agent 会按自己的 session cwd 找到对应仓库；设置 root 会强制所有会话使用同一个 board，只建议在单仓库调试时使用。

### 3. 重启并打开

重启 DSH host，刷新页面，点击左侧边栏的 **协作台 / Agents**。

同一台 DSH 上所有被插件跟踪过的项目会出现在左侧项目栏；没有用插件打开过的项目不会自动出现。

## 🧰 工具与 CLI

运行时只有三个工具：

| 工具            | 用途                                                               |
| --------------- | ------------------------------------------------------------------ |
| **team_status** | 更新 focus、status、plan、files                                    |
| **team_roster** | 读取当前仓库的活跃 Agent、claim、进行中/最近 change                |
| **team_claim**  | claim / release / list；reason 是 change intent 或 release summary |

CLI 与插件共用同一套文件：

```sh
node bin/team.mjs join    --name reviewer --focus "reviewing the guard"
node bin/team.mjs status  --id <id> --focus "reading the claim timeline"
node bin/team.mjs claim   --id <id> --paths lib/store.js --intent "timeline fix"
node bin/team.mjs release --id <id> --paths lib/store.js --summary "done"
node bin/team.mjs claims
node bin/team.mjs changes
node bin/team.mjs list
node bin/team.mjs leave --id <id>
```

## 📦 数据布局

每个仓库独立一块 board：

```text
<repo>/.dsh/parallel/
  config.json
  agents/<agent-id>.json
  claims/<sha1(repo-relative-path)>.json
  changes/<change-id>.json
```

全局只维护一个“最近项目”索引：

```text
~/.dsh/parallel/projects.json
```

项目索引只存 root / name / lastSeenAt。真正的 presence、claim、timeline 永远在各仓库自己的 .dsh/parallel 里。跨项目不会合并 claim，也不会互相加锁。

## 🧭 关键决策

关键取舍用 [adr-kit](https://github.com/luochang212/adr-kit) 记录在 [adr/](adr/README.md)。当前有 7 条已实现决策：

- **ADR 1**：每个仓库独立 board，全局项目索引只做发现和汇总，不做跨项目锁。
- **ADR 2**：移除消息/收件箱/待回复；focus 是会话属性，面板只读。
- **ADR 3**：用 claim/release timeline 记录占用历史，并渲染为按文件的甘特图。
- **ADR 4**：项目列表是导航，不是内容；使用全高项目栏，而不是顶部卡片。
- **ADR 5**：只保留一个只读界面和三个概念；不做 tabs、统计卡片、活动流、设置页或 composer。
- **ADR 6**：每条 change 记录对话身份、intent、paths 和释放状态。
- **ADR 7**：写入使用短生命周期 auto lease；计划工作使用 explicit lease，idle 释放或 TTL 过期。

开始任务前运行 **adrkit list**，读取相关的 implemented 记录；改动特定文件时运行 **adrkit relevant <path>**。新增/变更决策用 **adrkit record** 或 **adrkit propose**，完成前运行 **adrkit validate --all**。

## ⚙️ 配置

| Key               | 默认值          | 说明                                    |
| ----------------- | --------------- | --------------------------------------- |
| root              | 空              | 可选；空表示每个会话按 cwd 找自己的仓库 |
| registryDir       | ~/.dsh/parallel | 全局项目索引目录                        |
| heartbeatMs       | 20000           | presence 续租间隔                       |
| ttlMs             | 90000           | presence TTL                            |
| claimPolicy       | auto            | off / advisory / require / auto         |
| autoClaimTtlMs    | 600000          | auto claim 的 TTL                       |
| releaseAutoOnIdle | true            | 回合结束后释放 auto claim               |

claimPolicy 的差异：

- **auto**：write/edit 自动 claim，冲突拒绝；
- **require**：没有 claim 就拒绝写入；
- **advisory**：只提示，不阻止；
- **off**：关闭 write guard。

write guard 只覆盖 write/edit；bash 或 run_code 里的 shell 重定向不在保护范围内。

## 🧪 开发与测试

无需构建，浏览器端由 DSH 的 module loader 直接加载。

```sh
node --test test/store.test.mjs   # store / timeline / registry / concurrency / CLI
node test/host-smoke.mjs          # tools / write guard / /projects / /claim / /release
node test/ui-flow.cjs             # read-only UI + screenshots
```

UI 测试需要先启动桌面 DSH、Playwright，以及本机登录 cookie。测试会断言：

- CONTROLS 0
- HAS_PROJECTS true
- HAS_TIMELINE true
- HAS_SESSION true
- 无 console error

改动 UI 后刷新页面即可；改动 host 后需要重启 host。开发约定见 [AGENTS.md](AGENTS.md)，文件格式见 [docs/protocol.md](docs/protocol.md)。

## ⚠️ 边界

- 不做跨项目锁；不同仓库的并行工作互不阻塞。
- 项目列表来自 host 跟踪过的 root + 全局注册表；从未打开过的项目不会出现。
- claim 是精确路径，不覆盖目录和 glob。
- auto claim idle 时释放；explicit claim 必须 release 或等 TTL。
- 一个 Agent 同一时间只有一条 active change；开新任务前先 release 旧的。
- Gantt 展示的是 claim/release 时间，不是 git diff / commit 级证明。
- 不同 git worktree 是不同 board。
- 历史 timeline 默认保留 7 天。

## 📜 License

[MIT](LICENSE)
