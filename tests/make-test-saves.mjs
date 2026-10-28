// 造定点复验用的测试存档：用游戏自己的函数把进度摆到关键位置，存成“导出当前进度”的格式。
// 只写到 tests/saves/（或命令行给的目录），不碰用户存档。用法：node tests/make-test-saves.mjs [输出目录]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1].split('$("mSheet").onclick')[0];
const out = process.argv[2] || new URL('./saves/', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');
const node = () => ({ placeholder: '', style: { setProperty() {} }, classList: { add() {}, remove() {} }, append() {}, setAttribute() {}, addEventListener() {} });
const context = vm.createContext({ Math, console, setTimeout, clearTimeout, AbortController, Date, JSON,
  window: {}, location: { hostname: 'test.invalid', protocol: 'file:' },
  document: { getElementById: node, createElement: node, addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
vm.runInContext(source + '\nsave=()=>true; renderPlay=()=>{}; render=()=>{}; closeModal=()=>{}; advanceCombat=()=>{}; toast=()=>{}; gm=()=>{};', context);

// 每个存档：在游戏的上下文里执行一段代码摆好进度，summary 写进前情提要，让说书人知道之前发生了什么
const SAVES = {
  '01-酒馆营地-恋爱场景与入梦': `
    begin(1, 'act1_hub', 3); state.day = 3; state.act1Day = 2;
    team({ selene: 45, borin: 30, kassian: 20, vex: 25 });
    Object.assign(state.flags, { 'act1.debt_known': true, 'act1.lise': 'saved', 'act1.vex_debt': 'paid', 'quest.vex': 'sold', 'quest.vex.egg': true });
    state.hestiaTrust = 25; state.player.gold = 200; state.supplies = 3;
    state.campSeen = ['act1_home']; // 让当晚的重要事件落到赛勒涅的月下练剑
    story('灰帆港', '你们在灰帆港待了两天：维克斯把龙蛋卖给了老鳗，换回了妹妹莉丝，债也清了。今晚大家回到醉龙酒馆。赛勒涅这两天对你格外上心，常在练剑时偷看你。');`,
  '02-金鳗货舱-救莉丝': `
    begin(1, 'act1_docks_hold', 3); state.day = 3; state.act1Day = 1;
    team({ vex: 30, selene: 25, kassian: 25 });
    Object.assign(state.flags, { 'act1.debt_known': true });
    story('金鳗的货舱', '老鳗限维克斯三天还债，今天是最后一天，明早到期莉丝就会被卖到外海。你们摸进了金鳗船底的货舱，莉丝就关在最里面的铁栏后面，两个打手在打牌。');`,
  '03-总督府-正式请柬': `
    begin(1, 'act1_manor', 3); state.day = 2; state.act1Day = 1;
    team({ selene: 25, borin: 25, naia: 25 });
    Object.assign(state.flags, { 'act1.sath_trust': true, 'act1.vex_debt': 'paid', 'act1.lise': 'saved' });
    story('总督府', '萨丝已经信任你们。总督想拉拢“被银光选中的人”，当面答应给你们发月光舞会的正式请柬，今天派人送来。');`,
  '04-斗兽场-黑拳': `
    begin(1, 'act1_docks_arena', 3); state.day = 2; state.act1Day = 1;
    team({ kassian: 30, borin: 30, selene: 20 });
    Object.assign(state.flags, { 'act1.vex_debt': 'paid', 'act1.lise': 'saved' });
    state.player.gold = 20;
    story('地下斗兽场', '你们缺钱。斗场主管铁颚看中了你们的身手，想请你们打一场黑拳，赢了分一大笔赌金。');`,
  '05-出海-随机航程': `
    begin(1, 'act1_dawn', 5); state.day = 5; state.act1Day = 1;
    team({ selene: 30, kassian: 25, lyra: 25, borin: 25 });
    Object.assign(state.flags, { 'act1.departure_ship': 'seagull', 'act1.ship': 'seagull', 'act1.chart': 'opened', 'act1.key': 'legal', 'quest.selene.diary': true, 'act1.vex_debt': 'paid', 'act1.lise': 'saved' });
    state.dreams = [1]; state.ended = true; nextAct(); state.voyage = ['act2_doldrums', 'act2_castaway', 'act2_storm'];
    state.pendingAsi = 0; state.levelNote = null;
    story(null, '第一幕结束：你们拿到了航海图，借到港卫军的海鸥号，驶出灰帆港。赛勒涅在沉船湾找到了骑士团长的日记，还没读懂。');`,
  '06-最后一夜-告别与最后的梦': `
    begin(3, 'act3_whisper', 11); state.day = 14;
    team({ selene: 85, vex: 65, kassian: 45, borin: 30, lyra: 15, naia: 50 });
    const s = state.companions.selene; s.romance = 'together'; s.tested = true;
    Object.assign(state.flags, { 'act1.naia_exposed': true, 'act1.naia_fate': 'recruited', 'quest.selene': 'reforged', 'quest.vex': 'stormed', 'quest.vex.egg': true, 'quest.kassian': 'exposed',
      'quest.borin': 'woke', 'act2.darin': 'woke', 'quest.lyra': 'turned', 'quest.naia': 'free', 'act2.heart': 'hestia', 'act2.taken': false, 'act3.saved_first': 'docks', 'act1.eel': 'ally' });
    state.dreams = [1, 2]; state.hestiaTrust = 10; state.supplies = 3;
    state.campSeen = CAMP_EVENTS.filter(e => e.kind === 'banter' || e.scene).map(e => e.id); // 只留下告别，测起来清楚
    story('最后一夜', '明天就要攻上烬冠山。战争会议开完了，盟友各自回营。今晚是攻山前的最后一夜，烬王在每个人耳边低语。你和赛勒涅已经在一起，她也看到了你的心意（考验已过）。');`,
  '07-最终抉择-尾声': `
    begin(3, 'act3_king', 12); state.day = 15;
    team({ selene: 85, vex: 65, kassian: 55, borin: 50, lyra: 45, naia: 60 });
    const s = state.companions.selene; s.romance = 'together'; s.tested = true;
    Object.assign(state.flags, { 'act1.naia_exposed': true, 'act1.naia_fate': 'recruited', 'quest.selene': 'reforged', 'quest.vex': 'stormed', 'quest.vex.egg': true, 'act2.egg_warmed': 3,
      'quest.kassian': 'exposed', 'quest.borin': 'woke', 'act2.darin': 'woke', 'quest.lyra': 'turned', 'quest.naia': 'free', 'act2.heart': 'hestia', 'act2.taken': false, 'act3.route': 'charge', 'act1.eel': 'ally' });
    state.dreams = [1, 2, 3]; state.pendingFinal = true;
    story('烬王', '烬王从天上坠落在火山口边缘，鳞片崩裂，平台一块块塌下去。它抬起头看着你。最终抉择就在眼前。');`,
};
const HELPERS = `
  function begin(act, scene, level) {
    state = newGame(freshDraft()); state.player.name = '试玩者'; state.act = act; state.scene = scene; state.location = SCENES[scene].loc;
    levelUp(level); state.pendingAsi = 0; state.levelNote = null; state.log = [];
  }
  function team(appr) {
    for (const [id, a] of Object.entries(appr)) { const c = state.companions[id]; c.recruited = true; c.approval = a; c.hp = c.hpMax; }
  }
  function story(title, text) {
    if (title) push('chapter', title);
    push('sys', '（测试存档）' + text);
    memo().summary = text;
  }`;

await mkdir(out, { recursive: true });
for (const [name, code] of Object.entries(SAVES)) {
  const json = vm.runInContext(`(() => { ${HELPERS} ${code}
    if (!validState(state)) throw new Error('存档不合法');
    return JSON.stringify(Object.assign({ format: SAVE_FORMAT, version: 1 }, snapshot()));
  })()`, context);
  await writeFile(new URL(name + '.json', 'file:///' + out.replace(/\\/g, '/').replace(/\/?$/, '/')), json);
  console.log('写好', name);
}
