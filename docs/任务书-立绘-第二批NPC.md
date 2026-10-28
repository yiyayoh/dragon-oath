# 任务书：立绘第二批（第二幕的 NPC）

写于 2026-10-28，Claude 写，交给 GPT/Codex 执行。第一批五张（老鳗、萨丝、总督、千面母、主教）已经放进主仓库，画风和已有立绘对得上，做得很好。用户说额度还剩 12%，**按顺序画，够几张算几张**。

做法和第一批完全一样，见 `docs/任务书-立绘-第一批NPC.md`（规格、转 webp、在副本里检查、交付），这里只列这一批画谁。继续用你上一批的副本 `D:\Codex\dragon-oath-portrait-work`，开工前先把它更新到包含这份任务书的提交（里面有 DS 新补的提示词）。原图放桌面 `dragon-oath-portraits-v5`。

## 第 0 张（最先画）：用户自己的角色

用户想要一张自己角色的立绘，排在这一批最前面。

- **角色**：佐佐木琲世，男，半精灵法师，背景是街头儿童。游戏里写的外貌：黑色短发，左眼下有一颗泪痣，穿旧皮夹克，总带着漫不经心的笑。
- **用户的要求**：他是《咒术回战》乙骨忧太的粉丝，想要乙骨的感觉。做法是**把乙骨的气质特点写进提示词，不写乙骨的名字、不照搬他的脸和校服、不画成动漫画风**：一来图片工具多半不肯画现成的角色，二来要和游戏里其他半写实厚涂的立绘放在一起。要让人一眼看出“乙骨那种感觉”，但这是用户自己的角色。
- **提示词**（风格前缀 + 下面这段 + `, neutral expression`）：

  ```text
  young male half-elf wizard in his early twenties, slightly messy black hair falling over his eyes, subtly pointed ears, a small tear mole under his left eye, gentle tired dark eyes with a quiet hidden intensity, soft unassuming face that hides great power, faint melancholy half-smile, worn dark leather jacket over a plain dark high-collared shirt, a slender straight-bladed sword in a black sheath held loosely at his side, a faint coiling silver dragon-mist spirit hovering protectively over his shoulder like a guardian presence, glowing silver dragon-scale rune on his left palm
  ```

- 要点：**左掌一定要有银色龙鳞印记**（他是印记持有者）；身后的银色龙雾要淡，像守护灵，不要画成一条完整的龙、也不要盖住脸；刀和人都完整收在画面里，头顶留 10% 空白。画风参考照旧用 `martha_neutral.webp`。
- **交付不一样**：这张**不放进 `portraits/`**（玩家的立绘存在各自的存档里，不是游戏文件）。转成 768×1152 的 webp 或 png，放在桌面 `dragon-oath-portraits-v5` 里叫 `player_佐佐木琲世.png`。用户在游戏里打开“角色”，点立绘下面的“更换立绘”选这张图就能换上（Claude 刚加的按钮）。

## 画哪几张（按顺序）

| 顺序 | 文件名 | 谁 | 提示词在哪里（`docs/剧本设定集.md`） |
| --- | --- | --- | --- |
| 1 | `darin_neutral.webp` | 烬卫达林，博林的哥哥，第二幕 Boss | “烬卫达林”一段的第一条提示词 |
| 2 | `oswald_neutral.webp` | 奥斯瓦尔德，莉拉的导师 | “奥斯瓦尔德”一段（DS 新补的） |
| 3 | `sera_neutral.webp` | 瑟拉长老，潮裔长老 | “瑟拉长老”一段（DS 新补的） |
| 4 | `eve_neutral.webp` | 伊芙，主教瓦尔多的妹妹 | “伊芙”一段（DS 新补的） |

注意：

- **达林**和博林是亲兄弟：用 `portraits/borin_neutral.webp` 当**人物**参考（脸型、胡子颜色），再按提示词画成被烬火改造的样子。以后还要画清醒后的 `darin_woke`，这一张要留好同一张脸。
- **伊芙**和主教是兄妹：用这一批刚画好的 `portraits/valdo_neutral.webp` 当**人物**参考，让人看得出是一家人，但她已经离开教团，纹路要旧、要淡，穿潮裔的衣服。
- **瑟拉长老**是独眼，按提示词画眼罩，不要画成怪物。
- 其他照旧：风格前缀 + 提示词 + `, neutral expression`；NPC 左掌没有印记；画风参考 `martha_neutral.webp`。第一批里萨丝的戟尖、主教的法杖贴到了画面边缘，这一批长武器、法杖要整个收在画面里，顶部留出 10% 的空白。

## 交付

和第一批一样：不提交，在副本的 `docs/立绘-第二批.md` 里写每张的最终提示词、生成次数和自评，告诉用户做完了几张。
