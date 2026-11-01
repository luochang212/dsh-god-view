<div align="right">
  <a href="README.md"><img src="https://img.shields.io/badge/-%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87-545759?style=for-the-badge" alt="简体中文" /></a>
  <a href="README.en.md"><img src="https://img.shields.io/badge/-English-A31F34?style=for-the-badge" alt="English" /></a>
</div>

# 上帝视角

**dsh-god-view** · 多 Agent 协作看板 / DSH plugin

<p>
  <img src="https://img.shields.io/badge/version-0.3.0-0e7490?style=flat-square" alt="version" />
  <img src="https://img.shields.io/badge/DSH-plugin-0e7490?style=flat-square" alt="DSH plugin" />
  <img src="https://img.shields.io/badge/node-%3E%3D20-0e7490?style=flat-square" alt="node" />
  <img src="https://img.shields.io/badge/license-MIT-0e7490?style=flat-square" alt="license" />
  <a href="https://github.com/luochang212/dsh-god-view/actions/workflows/ci.yml"><img src="https://github.com/luochang212/dsh-god-view/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://luochang212.github.io/dsh-god-view/"><img src="https://img.shields.io/badge/ADR-archive-8a4b2a?style=flat-square" alt="ADR archive" /></a>
</p>

**让同一仓库里的多个 Agent 看得见彼此，不抢同一个文件，并且留下可回看的占用时间轴。**

它不是一个聊天工具，也不是一个人工指挥台。它是一个只读的协作看板：

- 谁在做什么（当前会话的一句话 focus）；
- 哪个文件正被谁占用（file lease）；
- 什么时候占用、什么时候释放、被谁占用（claim/release timeline）。

## 🔌 默认开启，随时可以关掉

协作的价值是让并行的 Agent 不互相踩踏，所以它**默认是开的**：写入会自动登记占用，别人占着同一个文件时会被拒绝。

不需要的时候，点面板右上角的协作开关关掉即可。关闭后插件不打扰 Agent：不建看板目录、不写 presence、不占用文件、不拦截写入、不往 prompt 里塞上下文，三个 `team_*` 工具也会从模型的工具表里撤掉，单 Agent 会话看不到它们。面板入口、开关接口和全局项目索引仍保留（开关总得有个地方）；除此之外，关闭状态对单 Agent 编辑没有可感知的影响。

- 中途打开或关闭都可以：打开之前已在改的文件不会被补登记，保护从下一次写入开始。
- 关闭会释放本机持有的自动占用，历史记录保留但不再更新。
- 开关不会自己翻转，只有人能改。

## ✨ 它解决什么问题

多个 Agent 同时改一个仓库时，最容易出问题的不是“不会写代码”，而是：

- 不知道彼此正在做什么；
- 同时改同一个文件，后写覆盖先写；
- 做完之后，说不清谁在什么时候动过哪个文件。

上帝视角只做三件事：

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
- status：active / idle / blocked / done（面板/CLI 把 done 显示为「已结束」）；
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
- 当前状态（claimed / done / expired；CLI 把 done 显示为 released，只表示租约释放，不表示已提交）；
- 每次 claim / release / expire 的绝对时间和执行者。

前端把这些事件画成按文件分行的甘特图。条形从 claim 到 release；还活着的 lease 会延伸到当前时间，并用斜纹标出。

## 🖥️ 界面

一个只读界面，整页式应用外壳（全出血，不留页面内边距）：

- **右侧项目栏**：264px 全高，只有一列活跃项目。这一列没有标题、没有计数、没有底部统计；折叠状态记在 localStorage，重载后保持。只列出最近 30 分钟有活动、有进行中/受阻会话，或有文件占用的项目；只有宿主心跳、30 分钟没活动的会话不再算活跃。每行显示状态灯、进行中会话数、受阻数、占用数、变更数和最后活动时间。状态灯：进行中呼吸、受阻红色、仅占用琥珀、仅最近活跃灰色；reduced-motion 下关闭。
- **顶部 bar**：56px，左侧是当前项目名和仓库路径，右侧是宿主规格的协作开关（36×20、打开为品牌色、2px 焦点环）。折叠按钮固定在整个面板的右上角（28×28、面板图标）：展开时压在侧栏右上方，收起时落在顶栏右端，位置完全不变，所以同一个点可以连续开关。
- **内容区**：独立滚动，两张分区卡片（会话、占用甘特图）直接放在宿主的 bg-base 上；卡片用宿主的 elevation token（0.5px 发丝描边 + 极轻投影）、12px 圆角，表头在卡内、行间用发丝线分隔。甘特条支持 hover / 键盘 focus 的定位 tooltip，直接显示文件、持有者、起止时间、持续时长和 intent/summary；完整事件记录留在 CLI（`dsh-god-view changes`）里。
- **没有活跃项目时**：整页是一个安静的空状态，由一个淡图标和一句说明组成（最近还没有活动；有会话工作或占用文件后项目会出现在右侧；协作关闭时提示打开顶栏开关）。不出现空的 section、空甘特图或虚线占位框，方便一眼看清后直接切走。
- **没有输入框**：没有 composer，没有消息框，没有“回复/释放”按钮。项目行是导航按钮；面板只有协作开关和折叠按钮两个控件。前者管模式，后者管界面。

界面规则：字号和间距使用统一刻度；名称、路径、focus 等可能超长的内容单行省略，完整值放在 title / tooltip；操作按钮 30px 高，优先图标 + 文字；状态灯、分组和 section 标题全站共用同一套样式。

面板宽度 ≤700px 时，外壳改为纵向堆叠：项目栏变成内容上方的横向可滚动项目条。

## 🚀 快速开始

**兼容性**：DSH `>=0.2.0 <0.3.0`，Node `>=20`；peer 依赖 `@deepseek-ai/cordis ~4.0.5`。已在 DSH 0.2.1 上通过 host smoke 和 UI 测试。

### 1. 安装到 DSH profile

```sh
PROFILE="$HOME/.dsh/profiles/desktop"
mkdir -p "$PROFILE/node_modules"
ln -sfn /absolute/path/to/dsh-god-view "$PROFILE/node_modules/dsh-god-view"
```

### 2. 添加插件配置

在 $PROFILE/cordis.patch.yml 中加入：

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

root 留空即可。每个 Agent 会按自己的 session cwd 找到对应仓库；设置 root 会强制所有会话使用同一个 board，只建议在单仓库调试时使用。

### 3. 重启并打开

重启 DSH host，刷新页面，点击左侧边栏的 **上帝视角 / God's Eye**。

被插件跟踪过的项目会进入全局项目索引，其中活跃的才出现在右侧项目栏；没有用插件打开过的项目不会自动出现。

## 🧰 工具与 CLI

协作开启时，模型的工具表里只有这三个工具（关闭后整张撤下）：

| 工具            | 用途                                                               |
| --------------- | ------------------------------------------------------------------ |
| **team_status** | 更新 focus、status、plan、files                                    |
| **team_roster** | 读取当前仓库的活跃 Agent、claim、进行中/最近 change                |
| **team_claim**  | claim / release / list；reason 是 change intent 或 release summary |

CLI 与插件共用同一套文件：

```sh
node bin/dsh-god-view.mjs join    --name reviewer --focus "reviewing the guard"
node bin/dsh-god-view.mjs status  --id <id> --focus "reading the claim timeline"
node bin/dsh-god-view.mjs claim   --id <id> --paths lib/store.js --intent "timeline fix"
node bin/dsh-god-view.mjs release --id <id> --paths lib/store.js --summary "done"
node bin/dsh-god-view.mjs claims
node bin/dsh-god-view.mjs changes
node bin/dsh-god-view.mjs list
node bin/dsh-god-view.mjs leave --id <id>
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

关键取舍用 [adr-kit](https://github.com/luochang212/adr-kit) 记录在 [adr/](adr/README.md)。记录会继续增加，所以这里只留决定产品形状的几条；完整清单和每条的理由用 `adrkit list` 查看。

- 每个仓库一块 board，全局索引只做发现和汇总，不合并 claim，也不加跨项目锁（ADR 1）。
- 没有消息、收件箱或待回复；focus 是会话属性，面板除了协作开关只读（ADR 2、5）。
- 占用是 claim/release 时间轴，按文件渲染成甘特图；甘特图是唯一的时间轴界面（ADR 3、14）。
- 协作默认开启，由人从顶栏关掉；关闭时不写任何 board 状态（ADR 20，取代 ADR 9 的默认值）。
- 侧栏只列活跃项目：最近 30 分钟有真实活动、有进行中/受阻会话，或有文件占用；一个都没有时是一整页安静的空状态（ADR 11、16、19）。

开始任务前运行 **adrkit list**，读取相关的 implemented 记录；改动特定文件时运行 **adrkit relevant <path>**。新增/变更决策用 **adrkit record** 或 **adrkit propose**，完成前运行 **adrkit validate --all**。

## 📚 决策档案

完整档案发布在 GitHub Pages：https://luochang212.github.io/dsh-god-view/

它由 `adr/` 里的记录生成，提供 Folio 和 Signal 两种排版，各有中英文版本。每次推送后由 [site.yml](.github/workflows/site.yml) 重新构建，生成的 HTML 和索引不提交。

本地预览：

```sh
cd site
npm ci
npm run dev
```

## ⚙️ 配置

| Key               | 默认值          | 说明                                    |
| ----------------- | --------------- | --------------------------------------- |
| root              | 空              | 可选；空表示每个会话按 cwd 找自己的仓库 |
| registryDir       | ~/.dsh/parallel | 全局项目索引目录                        |
| heartbeatMs       | 20000           | presence 续租间隔                       |
| ttlMs             | 90000           | presence TTL                            |
| autoClaimTtlMs    | 600000          | auto claim 的 TTL                       |
| releaseAutoOnIdle | true            | 回合结束后释放 auto claim               |

write/edit 自动 claim，与他人的活跃 claim 冲突时拒绝写入；面板与 agent 上下文始终展示当前租约。write guard 只覆盖 write/edit；bash 或 run_code 里的 shell 重定向不在保护范围内。

## 🧪 开发与测试

无需构建，浏览器端由 DSH 的 module loader 直接加载。

```sh
npm test                          # store + client-locale suites
node test/host-smoke.mjs          # tools / write guard / /projects / /state / /coordination
node test/ui-flow.cjs             # read-only UI + the coordination switch
```

UI 测试需要先启动桌面 DSH、Playwright，以及本机登录 cookie。测试断言：没有输入控件、恰好一个协作开关、右侧项目栏至少一行、选中的项目有甘特图、没有 console error；HAS_SESSION 之类的字段只是打印出来的探针。

改动 UI 后刷新页面即可；改动 host 后需要重启 host。开发约定见 [AGENTS.md](AGENTS.md)，文件格式见 [docs/protocol.md](docs/protocol.md)。

## ⚠️ 边界

- 只跟踪 DSH 内部的会话和 write/edit。
- 不做跨项目锁；不同仓库的并行工作互不阻塞。
- 项目列表来自 host 跟踪过的 root + 全局注册表；从未打开过的项目不会出现。
- claim 是精确路径，不覆盖目录和 glob。
- auto claim idle 时释放；explicit claim 必须 release 或等 TTL。
- CLI 是独立的写入方，直接操作同一套 board 文件，不受协作开关约束。
- 一个 Agent 同一时间只有一条 active change；开新任务前先 release 旧的。
- Gantt 展示的是 claim/release 时间，不是 git diff / commit 级证明。
- 不同 git worktree 是不同 board。
- 历史 timeline 默认保留 7 天。

## 📜 License

[MIT](LICENSE)
