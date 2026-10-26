# 醉龙酒馆：龙誓

一款仿《博德之门 3》的单人文字跑团游戏。你在 AI 说书人的主持下自由行动：说服、欺骗、战斗、招募同伴，也可以和同伴恋爱。规则是简化的 D&D 5e，关键时刻掷 d20。

> 一条垂死的银龙在暴风雨夜坠入港口，她的“龙誓”碎成七片，烙在了七个人的掌心。你是其中之一。

## 当前进度

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 第一阶段 | 角色创建、AI 说书人、d20 检定、存档、序幕《暴风之夜》 | ✅ 完成 |
| 第二阶段 | 第一幕《灰帆港》、区域制回合战斗、营地夜谈、立绘对话框 | 进行中 |
| 第三阶段 | 第二、三幕、恋爱线、龙化系统、七种结局 | 计划中 |

## 文件

- `index.html`：游戏本体，单文件，无需构建。
- `docs/剧本设定集.md`：完整的世界观、系统规则、角色卡（含立绘提示词）、分幕剧本、结局条件和 AI 说书人提示词。
- `HANDOFF.md`：交接文档，接手时先看这个。
- `portraits/`：角色立绘，命名为 `角色id_表情.webp`，例如 `selene_neutral.webp`（768×1152，由 GPT 生成的 1024×1536 原图压缩而来）。缺图时游戏会显示占位剪影。

## 怎么玩

说书人有两种接法，在游戏的 **设置 → 说书人接口** 里切换：

1. **Claude（claude.ai 内）**：在 claude.ai 以 Artifact 打开时，游戏通过 `sample` 能力调用 Claude，消耗你自己的 Claude 额度，不需要密钥。
2. **OpenAI 兼容 API**：用浏览器直接打开 `index.html`，或部署到 GitHub Pages 后，填入接口地址、模型名和 API 密钥即可。GPT、DeepSeek、Kimi 等兼容 `/chat/completions` 的服务都可以用。密钥只保存在你自己的浏览器里。

开启 GitHub Pages：仓库 Settings → Pages → Source 选 `main` 分支根目录，保存后就能通过 `https://<用户名>.github.io/dragon-oath/` 访问。

## 给后续开发者

整个游戏是 `index.html` 一个文件，原生 JS，不用构建，也没有依赖。开发前先读 `docs/剧本设定集.md`，所有剧情和数值都以它为准。

核心原则：**代码管数字，AI 管故事**。AI 每轮返回“叙述正文 + `@@@` + JSON 变更请求”，由 `applyGM()` 校验后才生效（赞同度单轮 ±15、金币 ±50、标记只接受 `FLAG_KEYS` 里的键等）。

| 代码位置 | 作用 |
| --- | --- |
| `RACES` `CLASSES` `BACKGROUNDS` `SKILLS` | 角色创建数据 |
| `COMPANIONS` `PEOPLE` | 同伴角色卡与立绘 id |
| `SCENES` `SCENE_ORDER` | 场景锚点：每场必然发生什么、何时推进到下一场 |
| `FLAG_KEYS` | 允许写入的世界状态标记及取值 |
| `SYSTEM` `buildPrompt()` | 说书人提示词与每轮上下文 |
| `narrate()` | 说书人接口：换模型只改这里 |
| `applyGM()` | 校验并执行 AI 的 JSON |
| `openDice()` `finishRoll()` | d20 检定 |
| `newGame()` `save()` | 存档结构（localStorage） |

加新的一幕：在 `SCENES` 里追加场景、在 `FLAG_KEYS` 里登记新标记、在 `COMPANIONS` 里加新同伴，然后把上一幕最后一场的 `next` 指向新场景。

角色 id：`selene` `vex` `kassian` `borin` `lyra` `naia` `martha` `tom` `hooded` `cultist` `hestia`  
表情：`neutral` `smile` `angry` `sad` `tender`
