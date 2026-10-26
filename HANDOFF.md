# 交接文档

更新于 2026-10-26。给接手这个项目的人或 AI 看。

## 现在的状态

- **可玩的部分**：序幕《暴风之夜》，包括角色创建、AI 说书人、d20 检定、同伴赞同度、存档。
- **游戏页面**（claude.ai Artifact）：https://claude.ai/artifact/UvdmR6RYWyiHmS19LVgiKm
- **剧本设定文档**（claude.ai Docs，可在线编辑）：https://claude.ai/artifact/PRdvso62krfap8UBW8ELzH
  - 仓库里的 `docs/剧本设定集.md` 是 2026-10-26 导出的副本，两边改动不会自动同步。
- **代码**：`index.html` 单文件，原生 JS，无构建、无依赖。代码结构见 `README.md` 的“给后续开发者”一节。

## 第一件事：放入立绘

立绘在本地桌面的 `dragon-oath-portraits-v2` 文件夹（GPT 生成）。

1. 把图片复制到仓库的 `portraits/` 目录。
2. 按 `角色id_表情.png` 重命名，例如 `selene_neutral.png`。
   - 角色 id：`selene` `vex` `kassian` `borin` `lyra` `naia` `martha` `tom` `hooded` `cultist` `hestia`
   - 表情：`neutral` `smile` `angry` `sad` `tender`
   - 奈雅的两种形态：`naia_disguise.png`（伪装）、`naia_true.png`（真身）。游戏代码目前还没用到这两张，接入第一幕时要处理。
   - 每个角色至少要有 `neutral`。缺图时游戏会显示占位剪影；缺某个表情时会退回 `neutral`。
3. 如果单张超过 1 MB，建议压缩或转成 `.webp`（转格式的话要同步修改 `portrait()` 函数里的扩展名）。
4. 检查：用浏览器直接打开 `index.html`，在设置里填 OpenAI 兼容 API，或者直接看角色卡和对话框里的立绘。
5. 提交并推送。

### 更新 claude.ai 上的游戏页面

在 Claude Code 里用 Artifact 工具发布，要带上 `url` 参数，这样会更新原来的页面而不是新建一个；立绘用 `files` 一起发布：

- `file_path`：`index.html`
- `url`：`https://claude.ai/artifact/UvdmR6RYWyiHmS19LVgiKm`
- `files`：每张图一项，例如 `{"portraits/selene_neutral.png": "portraits/selene_neutral.png"}`
- 不要传 `capabilities`，保留现有的 `sample` 声明

注意：Artifact 单次发布最多 255 个文件、总计 64 MB。

## 下一步：第二阶段（第一幕《灰帆港》）

按 `docs/剧本设定集.md` 的“开发优先级”：

- [ ] 区域制回合战斗（先攻、动作、伤害、倒地）——用户已确认保留区域制，不做网格
- [ ] 营地界面与夜谈队列
- [ ] 第一幕全部地点与灯塔之夜：在 `SCENES` 里追加场景，把 `prologue_5` 的 `next` 指向新场景，`FLAG_KEYS` 登记新标记
- [ ] 新同伴莉拉、奈雅：加进 `COMPANIONS` 和 `PEOPLE`
- [ ] 日志与世界状态完善
- [ ] 序幕结束卡片（`openEnd()`）改成“进入第一幕”

## 用户已经做出的决定

- 战斗用**区域制**，不做网格地图。
- 允许**多人恋爱**（规则见剧本“赞同度、羁绊与恋爱”一节）。
- 亲密描写**更直白**：可以具体写亲吻、身体接触和情欲张力；露骨的性行为过程用转场带过。已写进 `SYSTEM` 提示词。
- 用户目前只是自己玩，暂时不需要部署 GitHub Pages。

## 已知限制

- 存档只在当前浏览器的 localStorage 里。
- 序幕的战斗靠检定和叙述解决，还没有正式的战斗系统。
- 对话历史只发送最近 24 条，还没有自动压缩成“前情提要”。序幕够用，第一幕之前需要补上。
- 用真实的 Claude 说书人完整打通一局序幕，还没有验证过。
