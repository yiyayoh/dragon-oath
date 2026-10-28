// 用真实战斗函数模拟；玩家由同伴 AI 代打，不调用说书人，也不读取任何存档。
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const runs = Number(option('--runs', '300'));
const seed = Number(option('--seed', '20261027'));
const only = option('--encounter', '');
if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(seed)) throw new Error('用法：node tests/combat-sim.mjs [--runs 300] [--seed 20261027] [--encounter tavern_ambush]');

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let code = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!code) throw new Error('找不到游戏脚本');
// 游戏启动和事件绑定不属于模拟范围；保留同一份战斗和角色规则。
code = code.slice(0, code.indexOf('$("mSheet").onclick'));
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, { placeholder: '', style: {}, classList: { add() {}, remove() {} }, append() {}, setAttribute() {}, addEventListener() {} });
  return nodes.get(id);
};
let randomState = seed >>> 0;
const randomMath = Object.create(Math);
randomMath.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
const context = vm.createContext({
  Math: randomMath, console, setTimeout, clearTimeout, AbortController,
  window: {}, location: { hostname: 'test.invalid', protocol: 'file:' },
  document: { getElementById: node, createElement: node, addEventListener() {} },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
});
vm.runInContext(code + `
save = () => true; renderPlay = () => {}; advanceCombat = () => {}; toast = () => {};
const realHurt = hurt;
let simDown = 0, simDownFirst = 0, simCultistFirst = 0;
hurt = function(u, n, o) {
  const wasDown = !!u.down, wasDead = !!u.dead;
  const result = realHurt(u, n, o);
  if (u.side === 'party' && !wasDown && u.down) { simDown++; if (state.combat.round === 1) simDownFirst++; }
  if (u.type === 'cultist' && !wasDead && u.dead && state.combat.round === 1) simCultistFirst++;
  return result;
};
globalThis.simulate = function(id, level, scene, away = [], allyFlags = {}) {
  const d = freshDraft(); d.cls = 'paladin'; d.race = 'half_orc'; classPreset(d);
  state = newGame(d); state.act = id === 'tavern_ambush' ? 0 : scene.startsWith('act3') ? 3 : scene.startsWith('act2') ? 2 : 1; state.scene = scene;
  for (const id of ['selene', 'kassian', 'borin']) state.companions[id].recruited = true;
  if (id === 'tower_spies' || id.startsWith('docks')) state.companions.borin.recruited = false; // 场景里遇到莉拉或维克斯，仍为四人
  if (id === 'tavern_ambush') state.companions.vex.taken = true; // 序幕在场者自动参战，控制为四人
  levelUp(level);
  if (state.pendingAsi) applyAsi({ str: 2 });
  Object.assign(state.flags, allyFlags); // 第三幕的盟友由标记算出
  // 印记：第二幕起同伴各 +15 龙化，玩家按常见进度给一点（第二幕 20、第三幕 40）
  if (state.act >= 2) { for (const c of Object.values(state.companions)) c.draconic = 15 * (state.act - 1); state.player.draconic = 20 * (state.act - 1); }
  // 装备：按一路拿到的战利品估——第二幕全队护甲 +1、玩家武器 +1；第三幕全队护甲 +2、饰品命中 +1
  if (state.act >= 2) {
    const ids = ['player', 'selene', 'kassian', 'borin'];
    for (const id of ids) { const a = state.act >= 3 ? '龙鳞甲' : '加固皮甲'; state.player.inventory.push(a); equip(id, 'armor', a); if (state.act >= 3) { state.player.inventory.push('精准指环'); equip(id, 'trinket1', '精准指环'); } }
    state.player.inventory.push('精钢长剑'); equip('player', 'melee', '精钢长剑');
  }
  if (away.length) state.split = { scene, away, text: '' }; // 灯塔之夜分头行动：去码头的人不参战
  simDown = 0; simDownFirst = 0; simCultistFirst = 0;
  startCombat(id);
  const c = state.combat;
  if (Object.values(c.units).filter(u => u.side === 'party').length !== 4 - away.length) throw new Error(id + ': 队伍人数不对');
  let result = null, steps = 0;
  while (!(result = combatResult()) && steps++ < 1500) {
    const u = cbCur();
    if (u.dead || u.out) { nextTurn(); continue; }
    beginTurn(u);
    if (combatResult()) break;
    if (ACTIVE(u) && !u.skip) (u.side === 'party' ? allyTurn : foeTurn)(u);
    nextTurn();
  }
  result ||= combatResult();
  if (!result) throw new Error(id + ': 战斗未结束');
  const us = Object.values(c.units).filter(u => u.side === 'party');
  return { win: (result === 'victory' || result === 'final') && !c.units.player.dead, result, rounds: c.round,
    down: simDown, firstDown: simDownFirst, firstCultists: simCultistFirst,
    died: us.some(u => u.dead), playerDied: !!c.units.player.dead };
};`, context, { filename: 'dragon-oath-battle.js' });

const scenarios = [
  ['tavern_ambush', 1, 'prologue_3'],
  ['docks_brawl', 2, 'act1_docks'], ['docks_brawl', 3, 'act1_docks'], ['docks_ship', 3, 'act1_docks'], ['docks_ship', 4, 'act1_docks'],
  ['arena_bout', 2, 'act1_docks_arena'], ['arena_bout', 3, 'act1_docks_arena'],
  ['tower_spies', 2, 'act1_tower'], ['tower_spies', 3, 'act1_tower'],
  ['wreck_drowned', 3, 'act1_wreck'],
  ['manor_guards', 3, 'act1_manor'], ['manor_guards', 4, 'act1_manor'],
  ['sewers_cult', 3, 'act1_sewers'], ['sewers_cult', 4, 'act1_sewers'],
  ['lighthouse', 5, 'act1_lighthouse'],
  ['lighthouse', 5, 'act1_lighthouse', ['borin']],
  ['lighthouse', 5, 'act1_lighthouse', ['borin', 'kassian']],
  ['ghost_ship', 6, 'act2_ghost'],
  ['bone_wyrms', 6, 'act2_bone'], ['bone_wyrms', 7, 'act2_bone'],
  ['ember_outpost', 7, 'act2_ember'], ['ember_outpost', 8, 'act2_ember'],
  ['darin_forge', 7, 'act2_ember'], ['darin_forge', 8, 'act2_ember'],
  ['mist_kraken', 7, 'act2_mist'], ['mist_kraken', 8, 'act2_mist'],
  ['temple_raid', 9, 'act2_temple'],
  ['harbor_wyrmling', 10, 'act3_1'],
  ['ember_slope', 11, 'act3_climb'],
  ['valdo_altar', 11, 'act3_altar'],
  ['ember_king', 12, 'act3_king', [], { 'act1.sath_trust': true, 'act2.tideborn': 'ally' }],
  ['ember_king', 12, 'act3_king', [], { 'act1.sath_trust': true, 'act2.tideborn': 'ally', 'act2.darin': 'woke', 'prologue.rat_king': 'spared' }],
  ['ember_king', 12, 'act3_king'],
].filter(([id]) => !only || id === only);
if (!scenarios.length) throw new Error('未知遭遇：' + only);
const results = scenarios.map(([id, level, scene, away = [], allyFlags = {}]) => {
  const rows = Array.from({ length: runs }, () => context.simulate(id, level, scene, away, allyFlags));
  const avg = key => rows.reduce((n, r) => n + (Number(r[key]) || 0), 0) / runs;
  return { id: id + (away.length ? `（${4 - away.length} 人）` : '') + (id === 'ember_king' ? `（${Object.keys(allyFlags).length} 方盟友）` : ''), level, runs, winRate: avg('win'), avgRounds: avg('rounds'), avgDown: avg('down'), deathRate: avg('died'), playerDeathRate: avg('playerDied'), avgFirstCultists: avg('firstCultists'), avgFirstDown: avg('firstDown') };
});
if (args.includes('--json')) console.log(JSON.stringify({ seed, results }, null, 2));
else console.table(results.map(r => ({ 遭遇: r.id, 等级: r.level, 局数: r.runs, 胜率: (r.winRate * 100).toFixed(1) + '%', 平均回合: r.avgRounds.toFixed(2), 平均倒地: r.avgDown.toFixed(2), 阵亡比例: (r.deathRate * 100).toFixed(1) + '%', 首回合狂信徒死亡: r.avgFirstCultists.toFixed(2), 首回合倒地: r.avgFirstDown.toFixed(2) })));
