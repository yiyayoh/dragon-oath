# 交接文档

更新于 2026-10-26。给接手这个项目的人或 AI 看。

## 本机 ChatGPT 接入（本次已验证，请后续保留）

- 用户授权 Codex 实测免 API Key 游玩，已在此本地仓库接好第三种说书人模式 `ChatGPT（本机）`，读取的是本机 Codex 已登录的 ChatGPT 账号；不向网页提供 OAuth 凭据。
- 启动：双击仓库根目录的 `开始游玩.cmd`，或 `node local-server.mjs`，打开 `http://127.0.0.1:8787/`。首次打开会检查账号；有既有接口偏好时，在设置里选择 `ChatGPT（本机）`。使用账号套餐额度，需要联网。
- 新增文件：`local-codex.mjs`（账号探测、无工具的临时叙述会话）、`local-server.mjs`（仅绑定127.0.0.1，静态游戏与同源SSE接口）、`start-local.ps1`、`开始游玩.cmd`、`tests/local-server.test.mjs`、`.gitignore`（忽略本机运行目录）。
- `index.html` 仅新增说书人接口、连接状态和设置项；Claude/API模式、存档键和结构、规则、战斗逻辑保持原样。新接口：`GET /__gpt/status`；`POST /__gpt/narrate`，JSON `{prompt}`，SSE事件 `text` / `done` / `error`，收到 `done` 才应用游戏JSON。停止或断线不应用部分状态。
- 已用隔离 Edge 浏览器真实点击创建角色、完成开场和一次自由行动：两次真实模型分别约30.0秒和34.6秒，每轮正文和JSON有效并得到4条建议；刷新后完整存档状态一致，立绘正常，390px浏览器布局无横向溢出。测试没有接触用户自己的浏览器存档。
- 实测授权类型为ChatGPT、Plus套餐，两轮UI测试时模型为 `gpt-6-astra`；最终重启后的状态检查就绪，目录默认模型为 `gpt-5.6-sol`。游戏按账号目录选择可用默认模型，没有固定模型名。加固后的运行时另外完成一次真实短叙述，事件仅有 `userMessage` 和 `agentMessage`。进程禁用hooks/浏览器/电脑/代码工具等，逐个关闭继承的MCP；线程禁用环境访问、动态工具并使用临时内存会话。仅该游戏进程覆盖配置，不改全局Codex配置。
- `node --test tests/local-server.test.mjs`：9项全部通过（假模型HTTP行为测试，与上述真实模型测试区分）。覆盖同源访问、静态文件限制、账号字段过滤、请求校验、SSE、并发、错误和断开取消。
- 覆盖范围仅开场、一次行动和刷新续玩；完整序幕与真实模型战斗仍待测。Google字体有TLS失败，回退字体可用；缺失NPC立绘仍按原设计回退占位。
- 本次改动仅在本地，未提交、未推送、未发布。用户接下来让Claude继续开发；请保留本机接口和这些启动文件，避免用旧Artifact版本覆盖整个 `index.html`。


## 现在的状态

- **可玩的部分**：序幕《暴风之夜》，包括角色创建、AI 说书人、d20 检定、同伴赞同度、存档，以及区域制回合战斗（序幕的教团袭击、地窖鼠王两场）。
- **游戏页面**（claude.ai Artifact）：https://claude.ai/artifact/UvdmR6RYWyiHmS19LVgiKm
- **剧本设定文档**（claude.ai Docs，可在线编辑）：https://claude.ai/artifact/PRdvso62krfap8UBW8ELzH
  - 仓库里的 `docs/剧本设定集.md` 是 2026-10-26 导出的副本，两边改动不会自动同步。
- **代码**：`index.html` 单文件，原生 JS，无构建、无依赖。代码结构见 `README.md` 的“给后续开发者”一节。

## 立绘（已接入）

原图在本地桌面的 `dragon-oath-portraits-v2` 文件夹（GPT 生成，1024×1536 PNG，每张 2–3 MB）。仓库里放的是压缩版：

- `portraits/角色id_表情.webp`，768×1152，`cwebp -q 84 -resize 768 1152` 生成，每张约 100–190 KB。`portrait()` 只找 `.webp`。
- 已有：`selene` `vex` `kassian` `borin` `lyra` 的 `neutral`，以及奈雅的 `naia_disguise.webp`（伪装）、`naia_true.webp`（真身）。
- 还缺：`martha` `tom` `hooded` `cultist` `hestia` 的立绘，以及所有角色的 `smile` `angry` `sad` `tender` 差分。缺图显示占位剪影，缺表情退回 `neutral`。
- 奈雅的两张形态图代码还没用到。序幕的“兜帽客”戴着兜帽，和伪装立绘（人类吟游诗人）不一样，所以没有套用；接入第一幕时要处理形态切换。
- 补新图：同样转成 768×1152 的 webp，按 `角色id_表情.webp` 命名放进 `portraits/`。表情差分以该角色的 v2 图为唯一人物参考。

### 更新 claude.ai 上的游戏页面

在 Claude Code 里用 Artifact 工具发布，要带上 `url` 参数，这样会更新原来的页面而不是新建一个；立绘用 `files` 一起发布：

- `file_path`：`index.html`
- `url`：`https://claude.ai/artifact/UvdmR6RYWyiHmS19LVgiKm`
- `files`：每张图一项，例如 `{"portraits/selene_neutral.webp": "portraits/selene_neutral.webp"}`
- 不要传 `capabilities`，保留现有的 `sample` 声明

注意：Artifact 单次发布最多 255 个文件、总计 64 MB。

## 下一步：第二阶段（第一幕《灰帆港》）

按 `docs/剧本设定集.md` 的“开发优先级”：

- [x] 区域制回合战斗（先攻、动作、伤害、倒地）——做法见 `README.md` 的“战斗怎么运作”
  - 第一幕要用的敌人（黑潮会打手、无面刺客）已在 `ENEMIES` 里，写遭遇时直接用；千面母等 Boss 的特殊机制还没做
  - 同伴由代码自动行动，玩家只操作自己；以后可以加“手动指挥同伴”
  - 职业特技次数按每场战斗恢复，做了休息系统后改成按短休/长休恢复
- [ ] 营地界面与夜谈队列
- [ ] 第一幕全部地点与灯塔之夜：在 `SCENES` 里追加场景，把 `prologue_5` 的 `next` 指向新场景，`FLAG_KEYS` 登记新标记
- [ ] 新同伴莉拉、奈雅：加进 `COMPANIONS` 和 `PEOPLE`
- [x] 记忆：前情提要与角色记忆（用户要求“让 NPC 尽可能记住更多内容”）
- [ ] 日志与世界状态完善
- [ ] 序幕结束卡片（`openEnd()`）改成“进入第一幕”

## 用户已经做出的决定

- 战斗用**区域制**，不做网格地图。
- 允许**多人恋爱**（规则见剧本“赞同度、羁绊与恋爱”一节）。
- 亲密描写**更直白**：可以具体写亲吻、身体接触和情欲张力；露骨的性行为过程用转场带过。已写进 `SYSTEM` 提示词。
- 用户目前只是自己玩，暂时不需要部署 GitHub Pages。

## 已知限制

- 存档只在当前浏览器的 localStorage 里。
- 战斗的机制部分已在浏览器里完整打通（含读档续战、手机布局）；说书人部分只用模拟回复测过开战、战况描写、即兴行动和结算，还没有用真实模型打过一场。
- 敌人的行动由代码选择（设定集原本写的是让 AI 选），这样每回合不用等模型。
- 记忆系统（最近剧情 + 前情提要 + 角色记忆，见 `README.md` 的“记忆怎么运作”）只用模拟回复测过触发、合并和战斗隔离；真实模型写出的提要质量、`remember` 的使用频率还要实际玩一局观察。
- 用真实的 Claude 说书人完整打通一局序幕，还没有验证过。
