# 任务书（第二轮）：最后一夜的告别、结局尾声、NPC 说明、情报站消息

写于 2026-10-28，Claude 写，交给 DS 执行。上一轮（`docs/任务书-内容扩充-DS.md`，提交 `00a30b9`）已经审核合并进 `main`（`d74db7d`），做得很好。这一轮同样只加数据、不改代码；要用到的两个代码接口（告别按钮、尾声素材）Claude 已经做好了。

开始前先读：`AGENTS.md`、`HANDOFF.md`、`README.md` 的“营地与恋爱怎么运作”，以及 `docs/剧本设定集.md` 的同伴角色卡（恋爱线、个人任务）、“分幕剧本”第三幕、“结局与触发条件”。**剧情和人物以设定集为准。**

## 在哪里做（重要）

还是在 `D:\Codex\dragon-oath-ds`，分支 `ds-content`。**开工前先把分支更新到最新的 `main`**（上一轮合并后 `main` 多了 Claude 的阶段 5 代码和这次的接口，不更新的话你会在旧代码上写）：

```bash
git -C D:\Codex\dragon-oath-ds merge --ff-only main
```

如果提示不能快进，停下来告诉用户，不要强行合并。

- 只改 `index.html` 里下面说的四个数据块（`CAMP_EVENTS`、`EPILOGUES`、`NPC_NOTES`、`INTEL`），以及在 `tests/game-logic.test.mjs` 末尾加测试。不改函数、不改其他数据。
- 做完**只在本地提交**到 `ds-content`，不要推送。由 Claude 审核合并。
- 不要碰用户的存档：`.dragon-oath-local/`、浏览器存档、8787 端口。

## 写作要求

和上一轮一样：简体中文，具体、有画面、有人物性格；`seed` 和素材只写**处境和可用的素材**，不写台词、不规定必须发生什么；不提前揭开设定集里“只对 GM 可见”的秘密；代码管数字，不在文字里许诺数值奖励。

上一轮写得好的地方继续保持：每段都给玩家留了选择（“你可以……也可以……”、“不要替他回答”）。

## 任务 D4：最后一夜的告别（最重要）

设定集第三幕：“最后一夜：最后一次营地。每位同伴都有一段告别对话；恋爱线在这里迎来最终场景（誓约、或者分手）。”现在这一夜（场景 `act3_whisper`）还没有专属的营地事件。

Claude 加了一种新的事件 `kind: "farewell"`：**不占每晚“一个重要事件”的名额**，像同伴对手戏一样列成按钮，所以最后一夜可以同时有好几段告别。按钮文字默认是“告别 · 同伴名”，写了 `title` 就用 `title`。

写在 `const CAMP_EVENTS = [` 里（放在 DS 上一轮的对手戏后面），格式：

```js
  { id: "selene_farewell", who: "selene", kind: "farewell",
    when: c => state.scene === "act3_whisper" && !isLover("selene"),
    seed: "处境和素材" },
  { id: "selene_final", who: "selene", kind: "farewell", title: "最后的夜 · 赛勒涅",
    when: c => state.scene === "act3_whisper" && isLover("selene"),
    seed: "恋人的最终场景：处境和素材" },
```

要写的：

1. **每位同伴一段告别**（6 段：selene、vex、kassian、borin、lyra、naia），条件 `state.scene === "act3_whisper" && !isLover(id)`。
   - 按个人任务的结果写不同的素材：在 `seed` 里分情况写，比如“若 quest.selene 是 reforged：……；hidden：……；oathbreaker：……；还没了结：……”。抉择的取值见 `QUESTS` 里每人的 `choice.options`。
   - 也可以按赞同度高低写不同的态度（例如“赞同 ≥ 60 时……，低于 20 时……”）。
   - 素材方向：他们对明天的想法、想托付给你的东西、战后想做什么、对你说的最后一句真心话。赞同低于 0 又没了结任务的人已经在这一夜离队了（代码处理），不用写。
2. **每位同伴一段恋人的最终场景**（6 段），条件 `state.scene === "act3_whisper" && isLover(id)`，`title` 写成“最后的夜 · 名字”。
   - 这是恋爱线的终点：可以立誓约（`romance` 推进到 `vowed`，要先通过个人任务的“考验”，代码会检查），也可以分手。两种走向都要给素材，不要替玩家选。
   - 每个人的方式按性格来，参考设定集每人的“恋爱线”和现有的 `*_lovers`、`*_lovers2` 事件，别重复已经用过的素材。
   - 亲密的尺度照 `SYSTEM` 里的规定：可以写亲吻、身体接触和情欲张力，最亲密的那一步用转场带过。

## 任务 D5：结局尾声的素材

结局选定后，说书人写终章：先写结局那一刻，再给每位同伴写尾声。现在全靠说书人现编。Claude 加了 `const EPILOGUES = {};`（在 `chooseEnding` 上面），说书人会在每位同伴的情况后面看到“（尾声素材：……）”。

格式（每个同伴一项，所有字段都可以省略）：

```js
const EPILOGUES = {
  selene: {
    ending: { egg: "要点", seven: "要点", hestia: "要点", mortal: "要点", dragon: "要点", crown: "要点", fall: "要点" },
    lover: { egg: "恋人另写的要点", seven: "……" },
    choice: { reforged: "按个人任务抉择补的一句", hidden: "……", oathbreaker: "……" },
    gone: { dead: "已经死了时的一句", betrayed: "投向烬王时的一句", taken: "仍被主教困着时的一句" },
  },
  // vex、kassian、borin、lyra、naia 同样
};
```

- 七种结局的 id 和含义看 `ENDINGS`（新生之卵 egg、七人之誓 seven、银龙重生 hestia、凡人之世 mortal、新龙王 dragon、烬冠加冕 crown、港口陷落 fall）。
- 代码怎么拼：同伴活着、在队时，给 `ending[结局]`，是恋人再加 `lover[结局]`，再加 `choice[个人任务抉择]`；死了、背叛了或者还被困着，只给 `gone` 里对应的那句。
- 每条一两句，写**战后他/她在做什么、和你的关系落在哪里**，是“要点”不是成稿（说书人会展开）。不要写成和结局矛盾的内容：例如“银龙重生”里如果容器就是这个同伴，代码不知道是谁当了容器，所以 `hestia` 那条要写得两种都能用，或者写成“若是他当了容器……；若不是……”。
- 恋人那条要比普通的更具体、更私人（设定集表格里的“同伴影响”一栏是基调，例如新生之卵是“恋人和你一起抚养幼龙”）。
- 六个人 × 七种结局都要写；`lover` 至少写 egg、seven、hestia、mortal 四种；`choice` 和 `gone` 每人写全。

## 任务 D6：NPC 说明

`const NPC_NOTES = [` 里每条是 `["人物 id", 从第几幕开始, "说明", 到第几幕为止（可省略）]`，说书人按幕看到。

- 你上一轮的支线里出现了几个有名字的新人物：采珠人奈芮和弟弟阿凯、走私客皮特、前哨的厨子格里姆，Claude 的海上事件里还有潮裔少年汐。他们现在只在支线文字里，说书人在别处记不住。
- `NPC_NOTES` 的第一项必须是 `PEOPLE` 里已有的 id，**不要新加 `PEOPLE`**（那要改代码和立绘）。所以这一项改成：把这些人物的一句话说明，**补进相关的已有条目**，例如把奈芮、阿凯、汐写进瑟拉长老（`sera`）那条的末尾（“潮裔里还有……”），格里姆写进达林（`darin`）那条（烬火岛前哨的人）。皮特写进老鳗（`eel`）那条：他是黑潮会的人，那条只对第一幕起作用，要把它的“到第几幕为止”看清楚，必要时写进第二幕能看到的条目。
- 只追加句子，不要改原有的说明。

## 任务 D7：情报站的消息

`const INTEL = {` 里第一幕和第三幕各 6 条，是酒馆开了地下情报站之后说书人每天拿到的一条消息（按天数轮换）。**每幕加到 12 条。**

- 每条一句话，是**港口里正在发生、玩家可以去查的事**，最好指向已有的地点、支线或 NPC（这样消息有用），但不要直接替玩家完成支线，也不要透露秘密。
- 第一幕的消息不能提到第一幕还没发生的事（例如灯塔之夜）；第三幕的消息围绕被围的港口、各方盟友、攻山。

## 验收

在你的 worktree 里：

```bash
node --test tests/game-logic.test.mjs
node --test tests/local-server.test.mjs
```

全部通过（沙箱里如果 spawn 报错，照上次用 `--test-isolation=none`，并在报告里说明）。

在 `tests/game-logic.test.mjs` 末尾加一项测试，检查：

- 12 段告别事件都在：每位同伴一段 `*_farewell`、一段 `*_final`，`kind` 是 `farewell`，`who` 是已有的同伴。
- 在 `act3_whisper` 场景里，同一个同伴的告别和恋人最终场景**只会出现一个**（是恋人时只出现 final，不是时只出现 farewell）；在别的场景两个都不出现。可以用 `planNight()` 的 `banter` 列表来检查。
- `EPILOGUES` 六个人都有，`ending` 七种结局都有；`choice` 的键都是该同伴 `QUESTS[id].choice.options` 里的值；`gone` 的键只有 dead / betrayed / taken。
- 用 `epilogueNote(id, 结局)` 检查一个活着的恋人能拿到 ending + lover + choice 三段，一个死了的同伴只拿到 gone.dead。
- `INTEL[1]`、`INTEL[3]` 各至少 12 条、没有重复。

做完后：在 `HANDOFF.md` 开发记录补一行（写“DS”，分支 `ds-content`），然后告诉用户，由 Claude 审核合并。路线图不用改（这几项 Claude 合并时再记）。
