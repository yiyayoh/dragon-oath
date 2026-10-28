# 校对报告（DS）

写于 2026-10-28，对应分支 `ds-content`。只读数据、只写报告，没有改 `index.html`、测试或设定集。

## 总结

读过的数据块：

- `SCENES`：66 个场景的 `anchor`、`next`、`gate`、`recruit/meet`、`split`
- `SIDE`：39 条支线的 `hook`、`goal`、`need`、`reward`、`at`
- `CAMP_EVENTS`：93 条（另有 6 条运行时加入的共鸣事件）
- `QUESTS`、`NPC_NOTES`、`EPILOGUES`、`TRIALS`、`INTEL`、`ENDINGS`、`COMPANIONS`、`FLAG_KEYS`
- 对照 `docs/剧本设定集.md` 的世界观、同伴角色卡、NPC、分幕剧本、结局表

先写了一个临时脚本，把锚点、`hook`/`goal`/`seed`、`need`/`when`/`gate` 里出现的所有标记和场景 id 与 `FLAG_KEYS`、`SCENES`、`SIDE` 对了一遍：**没有发现指向不存在的标记或场景的硬错误**（`act1.xxx`、`quest.xxx`、`side.xxx` 的拼写都合法）。剩下的问题主要是语义和条件。

一共 **46 条**，其中 5 条建议优先修；另有 6 条“拿不准的”单列在最后。

最严重的 5 条：

1. **人物-1**：`act1.martha_alive` 实际记的是“人质是否活着”，却被当成“玛莎是否活着”用；如果人质是小汤姆并且死了，玛莎会被当成死的，小汤姆却还在第三幕跑前跑后。
2. **时间线-1**：`SIDE.martha_relic` 没有前置条件，玩家还没打开地窖暗格就能在酒馆接到“遗物”任务。
3. **规则-1**：`SIDE.eel_deal` 没有挡“老鳗已死”；卡西安杀死老鳗后，第三幕仍会出现让老鳗来谈判的支线，奖励写着“黑潮会船队成为盟友”，但 `ALLIES.tide` 又排除了这条路线。
4. **泄露-1**：`SIDE.watch_mole.goal` 直接写了“内鬼是文书官霍布”，而 `renderJournal()` 会把 `goal` 原样显示给玩家。
5. **泄露-2**：`SIDE.cult_eye.goal` 直接写了眼线是“灰须”和他的孙子；同样会显示在任务日志里。

---

## 1. 引用了不存在的东西

**这一节没有发现硬错误。** 脚本核对结果：锚点、seed、hook、goal、need、gate 里出现的 `act1.*` / `act2.*` / `act3.*` / `prologue.*` / `quest.*` / `side.*` 都在 `FLAG_KEYS` 或对应数据块里；场景 id 都在 `SCENES` 里；`TRIALS.fears` 的 8 个键和 `BACKGROUNDS` 一致，`TRIALS.secrets` 的 6 个键和 `COMPANIONS` 一致。

只有一个“物品不在表里、又像装备”的边界问题，放在“规则-6”。

---

## 2. 时间线

**时间线-1 · `SIDE.martha_relic` 没有前置条件**
- 位置：`SIDE.martha_relic.hook` / `SIDE.martha_relic.at`
- 问题：`hook` 写“打开地窖暗格之后”，但 `at` 从第一幕开始就是 `act1_hub`，没有 `need`。玩家还没拿到钥匙、没打开暗格时，就能在酒馆接到这个任务。
- 依据：`SCENES.act1_hub.anchor` 说航海图要先拿钥匙再下地窖；`SIDE.martha_letters` 又要求 `martha_relic === "done"`，于是整条玛莎链可能提前启动。
- 建议：加 `need: () => !!state.flags["act1.chart"]`（或 `=== "opened"`，并兼容旧档的拿法值）。

**时间线-2 · `SIDE.cult_eye` 在执事被拷问/放走之前就能出现**
- 位置：`SIDE.cult_eye.at` / `hook`
- 问题：`at` 包含 `act1_hub`，没有 `need`；`hook` 说“拷问或放走的执事都提到……”，但这只有在 `act1.deacon` 已经有值之后才成立。玩家一进第一幕的港口就能接到这个任务。
- 依据：`SCENES.act1_sewers_shrine.anchor` 里，执事是在祭室战斗后才被拷问或放走。
- 建议：加 `need: () => ["tortured", "informant"].includes(state.flags["act1.deacon"])`；如果执事被 `killed`，这条支线不出现（见泄露-2）。

**时间线-3 · `SIDE.rat_nest` 在鼠王被杀/赶走时仍然出现**
- 位置：`SIDE.rat_nest.hook`
- 问题：`hook` 写“只有序幕放过了鼠王才会发生”，但数据没有 `need`。`prologue.rat_king` 是 `killed/driven` 时，玩家仍能接到“鼠王的请求”。
- 依据：`prologue_4.anchor` 里放过鼠王才写 `prologue.rat_king=spared`；`FLAG_KEYS` 还允许 `killed` 和 `driven`。
- 建议：加 `need: () => state.flags["prologue.rat_king"] === "spared"`。

**时间线-4 · `SIDE.martha_last_letter` 的“被围的第二天夜里”没有按天判断**
- 位置：`SIDE.martha_last_letter.hook`
- 问题：它在 `act3_haven` 一出现就会说“被围的第二天夜里”，但玩家可能刚到避难所，第三幕第一天就能触发。
- 依据：`act3_whisper` 的“最后一夜”才是明确的时间点；`SIDE.sath_stand` 同样有“第三天”的问题（时间线-5）。
- 建议：把“第二天夜里”改成“围城中的某个夜里”，或按 `state.day`/第三幕天数加条件。

**时间线-5 · `SIDE.sath_stand` 的“围城第三天”没有按天判断**
- 位置：`SIDE.sath_stand.hook`
- 问题：`at` 是 `act3_haven`/`act3_streets`，没有天数条件；玩家一到避难所就能接到“围城第三天”的街垒任务。
- 依据：第三幕没有统一记录“围城第几天”，`state.day` 是全局天数。
- 建议：改成“围城期间”，或者记录第三幕开始时的天数再判断。

**时间线-6 · `CAMP_EVENTS.act2_sea` 默认海妖和幽灵船都发生过**
- 位置：`CAMP_EVENTS.act2_sea.seed`
- 问题：seed 说“说说这几天看到的事：海妖、幽灵船、岛上的东西”，但第二幕航程是从 5 个事件里随机抽 2 个，可能根本没遇到海妖或幽灵船。
- 依据：`VOYAGE_POOL` 有 5 个，`voyagePlan()` 只取 2 个，再固定暴风。
- 建议：改成“海上的怪事、岛上的东西”这种不点名的说法，或按 `state.log` 里实际走过的场景分支。

**时间线-7 · `CAMP_EVENTS.selene_truth` 写死“幽灵船之后”**
- 位置：`CAMP_EVENTS.selene_truth.seed`
- 问题：seed 开头是“幽灵船之后”，但 `quest.selene.truth` 也可以在雾隐岛纪念礁的铭牌处拿到（`SCENES.act2_mist_memorial.anchor` 的备用路线）。从纪念礁拿到的玩家会看到“幽灵船之后”，和实际地点不符。
- 依据：`act2_mist_memorial` 明确有“航程里没遇到幽灵船”时的替代路线。
- 建议：改成“知道真相之后”，或按 `quest.selene.truth` 是怎么拿到的分支。

**时间线-8 · `CAMP_EVENTS.kassian_arden` 在毒药还没查到时提到“那瓶毒药”**
- 位置：`CAMP_EVENTS.kassian_arden.seed` / `when`
- 问题：`when` 只要求 `quest.kassian.arden` 且抉择未定；seed 的素材里已经有“那瓶毒药”。玩家可能刚在斗兽场遇到阿登，还没查账本，卡西安不该知道毒药。
- 依据：`QUESTS.kassian` 第二步才是 `quest.kassian.poison`。
- 建议：把毒药部分改成“若已经查到账本（`quest.kassian.poison`）才提”；没有查到时只写那场比赛和好友。

**时间线-9 · `SIDE.eel_last_crew` 默认第二步的水手都回了灰帆港**
- 位置：`SIDE.eel_last_crew.hook`
- 问题：第二步的 `goal` 明说“带他们回锚地、给他们一条小船、或者只拿账本走，都会影响第三步他们会不会出现”，但第三步的 `need` 只看 `side.eel_wreck === "done"`，没看玩家当时选了什么。只拿账本走、把水手留在岛上的玩家，第三步仍会看到“被老鳗抛弃的那批水手回到了灰帆港”。
- 依据：`SIDE.eel_wreck.goal` 自己写了三种处理方式，但 `SIDE` 状态只有 `taken/done/failed`，没有记录分支。
- 建议：第二步完成时写一个分支标记（例如 `side.eel_wreck_crew` 或复用 `act1.eel` 的合法值），第三步的 `need` 据此判断；或者把第三步改写成“有几个水手辗转回来”，不假定全部。

**时间线-10 · `SIDE.eel_wreck` 默认皮特被救过**
- 位置：`SIDE.eel_wreck.hook`
- 问题：hook 写“皮特（如果上一轮救过他）说……”，但 `ribs_smuggler` 只有 `done`，没有记录玩家是救他、开箱子还是把他交给教团。选了后两种的玩家仍会被写成“皮特告诉你们位置”。
- 依据：`SIDE.ribs_smuggler.goal` 的三种处置都会写 `done`，没有分支标记。
- 建议：按 `ribs_smuggler` 的完成方式加分支，或把“皮特说”改成“如果你们救过皮特，他会来说；否则……”的条件句。

**时间线-11 · `CAMP_EVENTS.naia_scene` / `vex_scene` 在已经是恋人时仍会触发“关键场景”**
- 位置：`CAMP_EVENTS.naia_scene.when` / `CAMP_EVENTS.vex_scene.when`
- 问题：`naia_scene` 的条件是 `naiaTrue() && c.approval >= 50 && c.romance !== "vowed"`，包含 `together`；`vex_scene` 的条件是 `["hint","together"].includes(c.romance)`。两个场景的 seed 都是“第一次真正交底/第一次烟火”的性质，已经是恋人时再触发会像重复告白。
- 依据：其他四人的 `*_scene` 都限制在 `none/hint`；`love_naia` 的 seed 是“第一次以真面目站在你面前”，`love_vex` 是“他承认从来没有人等过他”。
- 建议：把 `naia_scene` 改成 `["none","hint"].includes(c.romance)`；`vex_scene` 如果确实想保留恋人阶段，改写 seed，不要再当第一次交底。

**时间线-12 · `CAMP_EVENTS.selene_deep` / `kassian_deep` 的海上场景可以在第三幕触发**
- 位置：`CAMP_EVENTS.selene_deep.seed` / `CAMP_EVENTS.kassian_deep.seed` / `when`
- 问题：两个 `when` 都是 `state.act >= 2`，所以第三幕在避难所扎营时仍可能出现“海上的夜，船头值夜”和“在甲板上教船员唱潮歌”。第三幕没有船，地点对不上。
- 依据：`act3_haven` 是酒馆避难所；第三幕也没有航海场景。
- 建议：把这两个事件限制在 `state.act === 2`，或者把 seed 改成按地点分支（船上是海，避难所是屋顶/后院）。

---

## 3. 人物

**人物-1 · `act1.martha_alive` 绑架人质的结果被当成“玛莎是否活着”**
- 位置：`SCENES.act1_lighthouse.anchor`（写 `act1.martha_alive`）、`tavernKeeper()`、`SCENES.act1_dawn.anchor`、`SCENES.act3_haven.anchor`、`SIDE.martha_last_letter.need`、`SIDE.tom_courage.need`
- 问题：锚点明确说 `act1.martha_alive` 记的是“人质是否活着”，人质可以是玛莎，也可以是小汤姆。但 `tavernKeeper()` 看到 `false` 就返回“小汤姆”，`martha_last_letter` 看到 `false` 就隐藏，`act1_dawn` 写“玛莎（如果活着）”，`act3_haven` 又写“小汤姆跑前跑后”。如果人质是小汤姆并且死了：玛莎被当成死的、小汤姆却还在跑腿，`tom_courage` 也还能接到。
- 依据：`SCENES.act1_lighthouse.anchor` 说“确定人质时写 `act1.hostage=martha` 或 `tom`”；设定集“灯塔之夜”也说教团绑架玛莎，如果和汤姆关系更好则绑架汤姆。
- 建议：拆成两个结果标记（例如 `act1.martha_alive` / `act1.tom_alive`），或保留一个“人质是否活着”的标记，再在所有使用处结合 `act1.hostage` 判断。`tavernKeeper()`、`act1_dawn`、`act3_haven`、`martha_last_letter`、`tom_courage` 都要一起改。`SIDE.refugees.rewardText` 的“玛莎和小汤姆会记住”也建议按存活情况分支。

**人物-2 · 博林的铁炉堡经历和设定集冲突**
- 位置：`CAMP_EVENTS.borin_act2_stone.seed`
- 问题：seed 说“铁炉堡陷落那天他不在城里，他在外面酿酒”；设定集写他是“从已经沦陷的铁炉堡逃出来的老兵”。“逃出来”通常意味着城破时在城里。
- 依据：`docs/剧本设定集.md` 博林角色卡“背景”一条。
- 建议：把 seed 改成“铁炉堡陷落那天他正在城外送货，回来时只看见逃难的人”，或者按设定集改成“他从城里逃出来，一直不愿讲那天”。

**人物-3 · `CAMP_EVENTS.selene_borin_oath` 把达林当成已死**
- 位置：`CAMP_EVENTS.selene_borin_oath.seed`
- 问题：seed 里赛勒涅问“你哥哥战死那晚……”，但博林在第二幕可能已经知道达林活着（`quest.borin.alive`），甚至已经唤醒他（`quest.borin=woke`）。这是同伴对手戏，`planNight()` 不会检查 `when`，所以会在达林活着时照常说“战死”。
- 依据：`QUESTS.borin` 第二步、`SCENES.act2_ember_forge.anchor`。
- 建议：把 seed 改成按 `quest.borin` 分支：还不知道达林活着时用“战死那晚”；知道后用“你以为他死了那晚”；唤醒后用“你把他唤醒之后”。

**人物-4 · `CAMP_EVENTS.vex_borin_family` 在达林被唤醒后仍说“变成怪物的哥哥”**
- 位置：`CAMP_EVENTS.vex_borin_family.seed`
- 问题：seed 说“一个有个变成怪物的哥哥”。如果 `quest.borin=woke`，达林已经清醒，不再是“怪物”；这个对手戏仍会触发。
- 依据：`QUESTS.borin` 的 `woke` 结局、`SCENES.act2_ember_forge.anchor`。
- 建议：改成“一个有个让人操心的哥哥”这种不预设状态的写法，或按 `quest.borin` 分支。

**人物-5 · `CAMP_EVENTS.borin_lyra_axe` 默认博林已经拿到达林的战斧**
- 位置：`CAMP_EVENTS.borin_lyra_axe.seed`
- 问题：seed 写“莉拉对达林战斧上的矮人符文很感兴趣”，但战斧只有在 `act1.darin_axe=true`（下水道祭室）之后才在博林手里。没去过祭室的玩家也会看到这个对手戏。
- 依据：`SCENES.act1_sewers_shrine.anchor` 才写 `act1.darin_axe=true`。
- 建议：在 seed 里写成“如果博林已经拿回达林的战斧……；否则他手腕上还留着旧斧柄的磨痕”，或者等 Claude 给 pair 事件加条件。

**人物-6 · `CAMP_EVENTS.vex_act3_dull_blade` 在玛莎死后仍把莉丝托付给玛莎**
- 位置：`CAMP_EVENTS.vex_act3_dull_blade.seed`
- 问题：seed 说“他把莉丝（如果还活着）托付给玛莎”。如果灯塔的人质是玛莎并且她死了，玛莎不在，托付对象不成立。
- 依据：`act1.martha_alive` 的设定、`SCENES.act3_haven.anchor` 的“玛莎（若还活着）”。
- 建议：改成“托付给还活着的玛莎或小汤姆”，或按 `act1.hostage`/存活标记分支。

**人物-7 · `SCENES.act3_docks_fire.anchor` 在老鳗已死时仍说“老鳗也愿意谈条件”**
- 位置：`SCENES.act3_docks_fire.anchor`
- 问题：开头有“老鳗（若还活着）”，但后文“即使之前为敌，老鳗也愿意谈条件”没有条件。`quest.kassian=killed_eel` 时老鳗已死，这句话不成立。
- 依据：`QUESTS.kassian` 的 `killed_eel`、`SCENES.act1_docks_arena.anchor`。
- 建议：把后文改成“即使之前为敌，黑潮会剩下的人也愿意谈条件”，或按 `quest.kassian` 分支。

**人物-8 · `SCENES.act1_sewers_shrine.anchor` 假设博林和莉拉一定在场**
- 位置：`SCENES.act1_sewers_shrine.anchor`
- 问题：锚点说“博林认得，那是他哥哥达林的斧子”“莉拉会认出那是她的导师”。如果玩家没招募莉拉（可以拒绝）或博林不在队（代码允许未招募），没有人能认出来。
- 依据：`recruit` 只在废塔/序幕给机会；`present()` 只列队里的人。
- 建议：把“博林/莉拉”改成“如果博林/莉拉在场，他/她会认出；否则……”，或让线索通过检定/物品说明给出。

**人物-9 · `SCENES.act2_temple_heart.anchor` 假设赛勒涅在场**
- 位置：`SCENES.act2_temple_heart.anchor`
- 问题：锚点说“赛勒涅的反应最重”，但赛勒涅可以被拒绝招募/死亡/被掳走。她不在场时没有“反应最重”的人。
- 依据：`present()` 只列队里的人；`act2.taken` 可能把她掳走。
- 建议：改成“如果赛勒涅在场，她的反应最重；不在场则由其他人/赫斯提雅点出她的名字”。

**人物-10 · `SCENES.act1_lighthouse.anchor` 假设赛勒涅、博林、卡西安都在场**
- 位置：`SCENES.act1_lighthouse.anchor`
- 问题：锚点说“其他同伴会强烈表态：赛勒涅、博林主张严惩，卡西安主张宽恕”。如果其中有人没被招募/已离队，这几句不成立。
- 依据：`party()`/`present()` 只列队里的人；维克斯也可以离队。
- 建议：加“在队的话”，或按 `present()` 分支。

**人物-11 · `EPILOGUES.kassian` 的普通结局和恋人结局互相矛盾**
- 位置：`EPILOGUES.kassian.ending.crown` / `EPILOGUES.kassian.lover.crown`；`EPILOGUES.kassian.ending.fall` / `EPILOGUES.kassian.lover.fall`
- 问题：`crown` 普通结局写“他死在去杀你的路上”，恋人结局写“他来劝你回头……被卫兵拖走”（活着被拖走）；`fall` 普通结局写“他守着最后一个伤员上船，自己没走”，恋人结局写“他在船上给每个人分水”。`epilogueNote()` 对活着的恋人会把 `ending` 和 `lover` 两段都拼上，玩家会同时看到“死了/没走”和“被拖走/在船上”。
- 依据：`epilogueNote()` 的拼接逻辑；设定集“结局与触发条件”里恋人尾声单独写。
- 建议：让 `ending` 和 `lover` 对同一结局的画面一致；例如 `crown` 统一写“他来劝你，被拖走，后来死在……”或“他死在去杀你的路上”；`fall` 统一写“他留在火里”或“他在船上”。

**人物-12 · `EPILOGUES.vex` 的恋人/死亡素材默认莉丝还在**
- 位置：`EPILOGUES.vex.lover.seven`（“婚礼上他哭得比莉丝还难看”）、`EPILOGUES.vex.lover.crown`（“带着莉丝消失”）、`EPILOGUES.vex.gone.dead`（“莉丝把它串在脖子上”）
- 问题：`act1.lise=sold` 时莉丝可能已经被卖到外海，不一定在港口、也不一定知道他的死。`epilogueNote()` 会把这几段给恋人/死亡结局，可能出现“莉丝在场”的矛盾。
- 依据：`QUESTS.vex.choice` 的 `sold`/`stormed`/`alone`；`CAMP_EVENTS.vex_after` 也按结果分支。
- 建议：给这几段加“如果莉丝还在”的条件，或写成“如果莉丝还在，她……；否则……”；`gone.dead` 可以改成“那枚铜板后来被谁收着，没人知道”。

---

## 4. 泄露秘密

**泄露-1 · `SIDE.watch_mole.goal` 直接写出内鬼名字**
- 位置：`SIDE.watch_mole.goal`
- 问题：goal 写“内鬼是被教团收买的文书官霍布，抓到他交给萨丝”。`renderJournal()` 在支线“进行中”时会把 `goal` 显示给玩家，等于直接告诉答案。
- 依据：`index.html` 的 `renderJournal()`：`st === "taken" ? q.goal.replace(...)`。
- 建议：goal 只写“内鬼是能接触巡逻表的人，线索在鱼市/码头/总督府”；名字放到 `hook` 之外的 GM 字段，或等 Claude 加一个“玩家可见目标”字段。

**泄露-2 · `SIDE.cult_eye.goal` 直接写出眼线名字**
- 位置：`SIDE.cult_eye.goal`
- 问题：goal 写“是每天坐在角落、只点一杯酒的老水手‘灰须’，他的孙子被教团扣着”。同样是玩家可见的答案。
- 依据：`renderJournal()` 的 goal 显示逻辑。
- 建议：goal 只写“找出酒馆里给教团传话的人（洞悉/调查 DC 15）”；“灰须”和孙子放到 `hook` 或说书人资料里。

**泄露-3 · `SIDE.tom_errand.goal` 直接说“他是教团的探子”**
- 位置：`SIDE.tom_errand.goal`
- 问题：玩家接下任务时 goal 就告诉玩家那人是教团探子、身上有酒馆位置的纸条；这本来应该是调查结果。
- 依据：`hook` 只说他“给的钱多得不正常”；`goal` 是玩家可见的进行中说明。
- 建议：goal 改成“查清他为什么高价收龙鳞、背后是谁”；“教团探子”放到完成叙述/说书人资料。

**泄露-4 · `SIDE.eve_bundle.goal` 提前说破瓦尔多的动机**
- 位置：`SIDE.eve_bundle.goal`
- 问题：goal 写“被献祭的村子是他母亲的家乡，他因此恨上了银龙”。玩家还在找信，就已经看到瓦尔多动机的答案；这是第三幕说服主教的关键信息。
- 依据：`SCENES.act2_mist_memorial.anchor` 说伊芙会讲出“他真正想要的是什么”，`act3.valdo` 才用它辩论。
- 建议：goal 只写“找瓦尔多的旧笔记/没寄出的信，带回给伊芙”；村子和母亲的真相放到 `tell` 或完成后的叙述。

**泄露-5 · `SIDE` 的 goal 里混入标记名和内部代号**
- 位置：`SIDE.eel_clerk.goal`（`act1.sath_trust`）、`SIDE.eel_last_crew.goal`（`eel_deal`、`eel_deal` 的奖励）
- 问题：这些 goal 会被 `renderJournal()` 原样显示，玩家会看到 `act1.sath_trust`、`eel_deal` 这种内部标记名和“不要改 eel_deal 的奖励”这种给说书人的指令。
- 依据：`renderJournal()` 只删除了场景 id，没有删标记名。
- 建议：把“如果 `act1.sath_trust`”改成“如果萨丝已经信任你们”，把 `eel_deal` 改成“老鳗的最后一笔”；所有给说书人的指令移到锚点或 Claude 的 GM 字段。顺带检查其他 goal 里的 `写 xxx=`、`程序` 等字样。

---

## 5. 规则冲突

**规则-1 · `SIDE.eel_deal` 在老鳗已死时仍出现，奖励和 `ALLIES` 冲突**
- 位置：`SIDE.eel_deal.hook` / `goal` / `reward`；`ALLIES.tide`
- 问题：hook 写“老鳗（若还活着）”，但没有 `need`；`quest.kassian=killed_eel` 时老鳗已死，玩家仍能接到“去和老鳗谈”。奖励写“黑潮会船队成为盟友”并设置 `act1.eel=ally`，但 `ALLIES.tide` 的条件是 `repOf("tide") >= 20 && quest.kassian !== "killed_eel"`，所以实际上不会成为盟友。
- 依据：任务书明确说不要给 `eel_deal` 加 `need`（它是很多人拿黑潮会盟友的唯一路线）；但“已死”这条例外需要处理。
- 建议：不加 `need` 也可以：把 hook 改成“老鳗的副手/账房来谈”，把奖励文字改成“黑潮会残部愿意合作”，或者在 `killed_eel` 时只给声望/补给、不写“盟友”。如果 Claude 愿意破例，加 `need: () => state.flags["quest.kassian"] !== "killed_eel"` 最干净。

**规则-2 · `SIDE.widow_boat` 承诺“海燕号可以载你们出海”，代码里没有这艘船**
- 位置：`SIDE.widow_boat.rewardText`
- 问题：rewardText 说“如果你们没有船，海燕号可以载你们出海”，但 reward 只有 `supplies: 2`，没有设置 `act1.ship` 或 `act1.departure_ship`；`act1.ship` 的合法值是 `black_eel/seagull/stolen`，`departure_ship` 是 `black_eel/seagull/stolen/fishing`，没有“海燕号”。玩家可能因此拿到一个说书人许诺、代码不承认的船。
- 依据：`SCENES.act1_hub.gate` 要求 `act1.chart && act1.ship` 才能去灯塔；`SCENES.act1_dawn.anchor` 的出海船只有四个合法值。
- 建议：要么把 reward 设成 `act1.ship=stolen`/`departure_ship=fishing` 并说明“海燕号算民用渔船”，要么把 rewardText 改成“奈尔会记住你们，之后在港口帮你们打听消息”，不承诺出海。

**规则-3 · 潮裔支线的 rewardText 承诺“有优势/亲自送/替你们说话”，代码只给声望**
- 位置：`SIDE.tideborn_child.rewardText`、`SIDE.knight_sword.rewardText`、`SIDE.lost_names.rewardText`、`SIDE.ember_prisoners.rewardText`
- 问题：分别写“说服长老时有优势”“长老会更愿意听你们说话”“瑟拉长老会亲自送你们到神殿”“获救的潮裔会替你们在长老面前说话”。代码在 `FACTIONS.tideborn` 里只加声望（+10/+15/+20），没有给说服检定优势；如果 `act2.tideborn=enemy`（-50），这些正向承诺还会和实际声望相反。
- 依据：`FACTIONS.tideborn.base` 的加值；`act2_mist` 的说服检定只按 `act2.murals` / 赛勒涅认罪给优势，没有读这些支线标记。
- 建议：rewardText 改成“潮裔声望提高”，或让 `act2_mist` 的加值/优势真正读这些支线；在 `enemy` 时不要写“长老会亲自送”。

**规则-4 · `SIDE.eel_clerk` 把账本交给萨丝后，奖励仍把账本塞进行囊**
- 位置：`SIDE.eel_clerk.goal` / `reward.items`
- 问题：goal 的选项③是“把账本交给萨丝”，但 reward 固定给 `items: ["黑潮会的账本"]`；玩家把账本交出去后，行囊里还会出现一本。
- 依据：`SIDE` 奖励由 `applyGM` 在 `done` 时无条件发放，和 goal 的分支无关。
- 建议：如果选择交给萨丝，奖励改成金币/补给；或者把账本写成“抄本”，说明玩家留了副本。类似问题见规则-5。

**规则-5 · `SIDE.martha_letters` 把银坠交还玛莎后，奖励仍把银坠给玩家**
- 位置：`SIDE.martha_letters.goal` / `reward.items`
- 问题：goal 说“拿回来交给玛莎”，reward 却是 `items: ["玛莎的银坠"]`；如果是交还，银坠应该在玛莎身上。现在会同时出现“玛莎戴回去”和“玩家行囊里有银坠”。
- 依据：`SIDE` 奖励无条件发放。
- 建议：改成玛莎让玩家保管，或改成“玛莎的银坠（她让你先收着）”；如果不想加物品，reward 改金币/补给。

**规则-6 · `SCENES.act1_wreck.anchor` 允许把龙尸做成道具，但稀有物品会被代码丢弃**
- 位置：`SCENES.act1_wreck.anchor`
- 问题：锚点说“取龙鳞龙血（可以制成道具，写进 items_add）”，但 `ITEMS` 里的龙鳞甲、银龙血药剂等都是 `rare: true`；`applyGM` 对 `items_add` 的规则是“rare 且锚点字符串里没有这个名字就丢弃”。锚点没有点名具体物品，说书人写“龙鳞甲”会被静默丢掉。
- 依据：`applyGM` 的 `if (ITEMS[s]?.rare && !SCENES[state.scene].anchor.includes(s))`。
- 建议：在锚点里点名可给的物品（例如“龙鳞甲/银龙血药剂”），或明确只给杂物；也可以让 Claude 给这个场景加一个允许列表。

**规则-7 · `ENDINGS.seven` 不要求七个人都在，仍可选中“七人之誓”**
- 位置：`ENDINGS.seven.need`
- 问题：`met` 只统计 `alive && (recruited || betrayed)` 的同伴，不统计从未招募的人，也不统计 `taken` 的人。只要剩下的在队同伴赞同 ≥40 且无人背叛，`seven` 的 `need` 就返回空；被掳走/没招募的同伴会被排除，终章却写“七个人各自保留一片印记”。`epilogueNote()` 对被掳同伴还会给 `gone.taken`（仍被困），与“七人共同承担”矛盾。
- 依据：设定集“七人之誓”写“七人共同承担誓约，在世同伴赞同均 ≥ 40，无人背叛”；`SCENES.act3_altar` 可以救回被掳同伴，但不是强制。
- 建议：`need` 里加“六位同伴都在队/都已救回”或“met.length === 6”；如果只想统计在队的人，结局文字改成“留下来的人共同承担”，不要写死七个。

---

## 6. 重复

**重复-1 · 六对“恋爱关键场景”和旧的 `*_hint` 营地事件几乎同一件事**
- 位置：`CAMP_EVENTS.selene_scene` / `selene_hint`、`vex_scene` / `vex_hint`、`kassian_scene` / `kassian_hint`、`borin_scene` / `borin_hint`、`lyra_scene` / `lyra_hint`、`naia_scene` / `naia_hint`
- 问题：`*_scene` 是后来加的单独插曲（月下练剑、屋顶烟火、海边篝火、屋顶醉谈、深夜研究、哪一张脸）；`*_hint` 是旧版营地事件，seed 几乎写的是同一场（月下练剑、屋顶灯火、海边包扎、屋顶星星、深夜研究印记、月光下跳舞）。两套都在赞同 40～55 的早期阶段可用：除维克斯外，`*_scene` 和 `*_hint` 都能在 `romance=none` 时触发；维克斯则是先 `*_hint`（none）后 `*_scene`（hint）。`planNight()` 会在不同夜晚分别抽到，玩家可能把同一段“第一次”经历两次。
- 依据：`love_selene`/`love_vex`/… 的锚点和 `*_hint` 的 seed；`planNight()` 按 kind 和数组顺序挑，不区分“已经走过插曲”。
- 建议：删掉/改写六条 `*_hint`，或把它们改成插曲之后的“第二次”素材；如果保留，`when` 至少要排除 `state.campSeen` 里已经有对应 `*_scene` 的情况（但 `when` 只能拿到 c，需要 Claude 加条件）。

**重复-2 · 恋人的第二夜和关键场景题材重复**
- 位置：`CAMP_EVENTS.vex_lovers2` / `love_vex`（屋顶烟火）、`lyra_lovers2` / `love_lyra`（深夜研究）、`naia_lovers2` / `love_naia`（脸）、`kassian_lovers2` / `love_kassian`（海边篝火/包扎）
- 问题：`*_lovers2` 本来应该是“确定关系后的第二个夜晚”，但 seed 又回到关键场景的同一件事（再放烟火、再做研究、再问脸、再海边包扎），读起来像重复第一次。
- 依据：`*_lovers2` 的 seed 和对应 `love_*` 锚点。
- 建议：保留一个具体的新画面（例如维克斯的烟火改成“他这次没有买烟火，只带了一瓶酒”；莉拉改成“她把两人的名字写进论文致谢”），不要在 seed 里重写第一次的场景。

**重复-3 · `SIDE.eel_deal` 和 `SIDE.eel_last_crew` 都是“第三幕和黑潮会谈条件”**
- 位置：`SIDE.eel_deal` / `SIDE.eel_last_crew`
- 问题：两条都在 `act3_haven`/`act3_docks_fire`，都围绕老鳗/黑潮会船队；一个是“老鳗的最后一笔”（奖励盟友），一个是“黑潮会的最后一船人”（奖励金币/补给）。玩家会同时看到两个“最后一次谈判”。
- 依据：两条的 `at` 和 `hook`；`eel_deal` 奖励 `act1.eel=ally`，`eel_last_crew` 奖励钱/补给。
- 建议：明确分工：`eel_deal` 谈船队/盟友，`eel_last_crew` 只谈被抛弃的水手，并在 hook 里写“和老鳗的谈判是另一件事（`eel_deal`）”，避免说书人把它讲成第二次总谈判。

**重复-4 · `SIDE.pearl_diver` 和 `SIDE.tideborn_child` 都是“潮裔孩子/弟弟在岛上失踪”**
- 位置：`SIDE.tideborn_child` / `SIDE.pearl_diver`
- 问题：一个找潮裔小女孩珊，一个找采珠人奈芮的弟弟阿凯；都在骨骼岛，都要对龙骨妖/溺死水手，都带回雾隐岛，奖励都和潮裔态度有关。连续做会像同一件事换了个名字。
- 依据：两条的 `hook`/`goal`/`at`。
- 建议：把其中一条的落点换掉（例如阿凯在沉船里发现了教团的货，重点变成“沉船里的证据”，而不是再救一个潮裔孩子），或把两条合并成前后两步。

---

## 7. 错字、病句、中英混杂

**错字-1 · 设定集里的几处错字**
- 位置：`docs/剧本设定集.md` 第 154、155、193、232、252、268、362、497 行
- 问题：
  - 第 154 行“干广幽默” → 应是“干巴巴的幽默”/“干冷幽默”。
  - 第 155、232 行“侨奉” → 应是“信奉”或“侍奉”（`侨奉银龙`、`侨奉海洋女神`）。
  - 第 193 行“深色皙皮马甲” → 应是“深色麂皮马甲”。
  - 第 252 行“牧师披肆”“下颧” → 应是“牧师披风/披肩”“下颚”。
  - 第 268 行“为掉尉教团而战死” → 应是“为抵御教团而战死”。
  - 第 362 行“也可以要挥他” → 应是“要挟他”。
  - 第 497 行“为龙举行葡礼” → 应是“葬礼”。
- 依据：上下文语义。
- 建议：按上面替换；这些是设定集原文，不影响代码，但会出现在说书人资料里。

**错字-2 · `COMPANIONS.naia.secret` 的“千面母亲手训练”**
- 位置：`COMPANIONS.naia.secret`
- 问题：“由千面母亲手训练”会被读成“千面母亲（妈妈）手训练”；本意是“由千面母 亲手训练”。
- 依据：`PEOPLE.facemother` 的 id 是“千面母”，奈雅的养母。
- 建议：改成“由千面母亲自训练”或“由千面母 亲手训练”。

**错字-3 · `SCENES.act3_end.anchor` 还写着“本轮的要求”**
- 位置：`SCENES.act3_end.anchor`
- 问题：“具体内容见本轮的要求”是写任务书时的临时话术，游戏里没有“本轮”，玩家/说书人看不懂。
- 依据：`ENDINGS` 已经是最终的七种结局数据。
- 建议：改成“具体内容见 `ENDINGS` 和最终抉择的界面”。

**错字-4 · `SCENES.act2_temple` / `act2_temple_truth` 的旧指令和 `TRIALS` 重复**
- 位置：`SCENES.act2_temple.anchor`（“具体写”）、`SCENES.act2_temple_truth.anchor`（“照同伴资料里的秘密写”）
- 问题：现在已经有 `TRIALS.fears` / `TRIALS.secrets` 给这两场提供素材，锚点还让说书人“具体写/照资料写”，两套指令会打架；说书人可能忽略 `TRIALS`。
- 依据：`trialLine()` 会把 `TRIALS` 拼进这两场的提示词。
- 建议：锚点改成“按【勇气试炼的素材】写；素材之外可以补充”，第二场同理指向【真相之厅的素材】。

**错字-5 · `EPILOGUES.lyra.ending.egg` 的书名没加书名号**
- 位置：`EPILOGUES.lyra.ending.egg`
- 问题：“把论文标题改成一只幼龙的日常”读起来像句子，不像标题；建议《一只幼龙的日常》。
- 依据：中文标点习惯。
- 建议：改成“把论文标题改成《一只幼龙的日常》”。

**错字-6 · `TRIALS.fears` 用“他”指代玩家**
- 位置：`TRIALS.fears.*.ways`（多处“他会……”“让他……”）
- 问题：玩家角色是玩家自己捏的，游戏其他地方用“玩家/你”；这里统一用“他”会默认玩家是男性，女角色/非二元角色读起来出戏。
- 依据：`SYSTEM` 和场景锚点大多用“玩家/你”。
- 建议：把 `TRIALS.fears` 里的“他”改成“玩家”或“你”。

---

## 拿不准的

1. **`SCENES.act1_lighthouse` 的“千面母的真名”来源**：锚点把“用千面母的真名威胁”当成一个可选办法，设定集第 454 行也这么写，但数据里没有“玩家得知千面母真名”的标记/场景。如果这是留给说书人临场发挥的，不算错；如果要严谨，应该加一个前置线索。**建议 Claude 确认。**
2. **`SIDE.eve_letter` 的 `done` 时机**：goal 说“带到祖坛交给瓦尔多”，但 `eve_bundle` 的 `need` 接受 `taken` 或 `done`，所以玩家一接下信就能做第二步。如果“拿到信”就算完成，建议把 goal 改成“收下信”并明确 `done` 时机；如果“送到祖坛”才算完成，第二步在第二幕会永远不出现。**需要设计确认。**
3. **`ENDINGS.seven` 的“七人”口径**：上面规则-7 按“七个人都要在”理解；如果设计本意是“在世且入队的同伴”，那代码没问题，只是结局文字要改。**需要 Claude 确认。**
4. **同伴不在场时的锚点**：人物-8/9/10 的修法取决于游戏是否假设“所有同伴最终都会入队”。代码允许莉拉/奈雅被拒绝、维克斯离队、赛勒涅被杀，所以我按“可能不在场”报；如果设计上不允许，应该加招募保底。**需要确认。**
5. **`CAMP_EVENTS` 的 pair 事件没有 `when`**：`planNight()` 对 `pair` 只检查两人在场，不调用 `when`。所以人物-3/4/5 这类“达林状态”问题不能靠给 pair 加 `when` 修；要么改 seed 成条件句，要么 Claude 改 `planNight()` 支持 pair 的 `when`。**这是代码层选择。**
6. **`SIDE.eel_last_crew` 的分支记录**：时间线-9/10 需要记录“水手有没有被带回来/皮特有没有被救”，`SIDE` 目前只有 `taken/done/failed`，要么加新标记（Claude 改数据/代码），要么把第三步写成不依赖分支的模糊叙述。**需要 Claude 定。**

---

## 附：脚本核对结果

- `FLAG_KEYS` 中不存在的 flag 引用：0
- `SCENES` 中不存在的场景 id 引用：0
- `TRIALS.fears` 与 `BACKGROUNDS` 的键差异：0
- `TRIALS.secrets` 与 `COMPANIONS` 的键差异：0
- `INTEL[1]` / `INTEL[3]`：各 12 条，无重复
- `EPILOGUES`：6 人 × 7 结局，`gone` 均为 dead/betrayed/taken
- 唯一被脚本标出的“物品不在 ITEMS”是 `总督的走私账本`、`玛莎的银坠`、`黑潮会的账本` 这类杂物，以及 `SCENES.act1_wreck.anchor` 的笼统“道具”说法（见规则-6）。
