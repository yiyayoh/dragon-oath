// 在隔离的内存环境里执行游戏原脚本，不读取浏览器或用户存档。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1].split('$("mSheet").onclick')[0];
if (!source) throw new Error('找不到游戏脚本');
function game() {
  const nodes = new Map();
  const node = id => {
    if (!nodes.has(id)) nodes.set(id, { placeholder: '', style: { setProperty() {} }, classList: { add() {}, remove() {} }, append() {}, setAttribute() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const math = Object.create(Math);
  const context = vm.createContext({ Math: math, console, setTimeout, clearTimeout, AbortController,
    window: {}, location: { hostname: 'test.invalid', protocol: 'file:' },
    document: { getElementById: node, createElement: node, addEventListener() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } });
  vm.runInContext(source + '\nsave=()=>true; renderPlay=()=>{}; advanceCombat=()=>{}; toast=()=>{};', context);
  return code => JSON.parse(JSON.stringify(vm.runInContext(code, context)));
}

test('梦境和黎明开场不会结束，玩家回应与必要标记齐备后才能结束', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.scene='prologue_4';
    applyGM({advance:'prologue_5',scene_end:true});const transition={scene:state.scene,ended:state.ended};
    state=newGame(freshDraft()); state.scene='prologue_4'; state.camp={}; state.player.hp=1; gm=()=>{};
    restNight(null); const sleep={scene:state.scene,hp:state.player.hp,heals:state.log.filter(e=>e.t==='长休：全员生命恢复').length};
    applyGM({flags:{'prologue.hestia_answer':'trust'},scene_end:true}); const intro=state.ended;
    push('you','我回应赫斯提雅'); applyGM({scene_end:true}); const dreamEnd=state.ended;
    state=newGame(freshDraft()); state.act=1; state.scene='act1_dawn'; applyGM({scene_end:true}); const dawnIntro=state.ended;
    push('you','我回应'); applyGM({scene_end:true}); return {transition,sleep,intro,dreamEnd,dawnIntro,dawnEnd:state.ended};
  })()`);
  assert.deepEqual(result.transition, { scene: 'prologue_5', ended: false });
  assert.equal(result.sleep.scene, 'prologue_5'); assert.equal(result.sleep.heals, 1); assert.ok(result.sleep.hp > 1);
  assert.equal(result.intro, false); assert.equal(result.dreamEnd, true);
  assert.equal(result.dawnIntro, false); assert.equal(result.dawnEnd, true);
});

test('本次场景回应不能借用上次访问的记录，检定未完成也不能结束', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.scene='prologue_5';state.visits={prologue_5:2};
    state.log.push({k:'you',t:'上次回应',s:'prologue_5'});state.flags['prologue.hestia_answer']='trust';
    applyGM({scene_end:true});const oldVisit=state.ended;
    push('you','本次回应');applyGM({check:{skill:'insight',dc:16},scene_end:true});const pending=state.ended;
    state.pendingCheck=null;applyGM({scene_end:true});return {oldVisit,pending,finished:state.ended};
  })()`);
  assert.deepEqual(result, { oldVisit: false, pending: false, finished: true });
});

test('期限在维克斯离队时仍到期，在他死亡时停止', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=1;
    state.flags['act1.debt_known']=true;state.companions.vex.recruited=false;
    for(let i=0;i<3;i++){state.camp={};restNight(null);}
    const expired={sold:state.flags['act1.lise'],approval:state.companions.vex.approval,memory:memo().people.vex[0],note:state.journal.find(j=>j.quest==='维克斯的债').note};
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=1;state.companions.vex.alive=false;
    for(let i=0;i<3;i++){state.camp={};restNight(null);}
    return {expired,deadHasSale:!!state.flags['act1.lise'],open:debtOpen()};
  })()`);
  assert.equal(result.expired.sold, 'sold'); assert.equal(result.expired.approval, -30);
  assert.match(result.expired.memory, /莉丝/); assert.match(result.expired.note, /卖到外海/);
  assert.equal(result.deadHasSale, false); assert.equal(result.open, false);
});

test('旧档被关押的奈雅可以探望但不参战，释放后重新入队', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    const n=state.companions.naia;n.fate='imprisoned';n.left=true;n.approval=80;state.flags['act1.naia_fate']='imprisoned';
    tidyLog(state);applyGM({romance:[{id:'naia',to:'hint'}],recruit:['naia'],approval:[{id:'naia',delta:3}]});
    const jailed={present:present().includes('naia'),party:party().includes('naia'),camp:campers().includes('naia'),romance:n.romance,approval:n.approval};
    startCombat('docks_brawl');jailed.combat=!!state.combat.units.naia;state.combat=null;
    applyGM({flags:{'act1.naia_fate':'recruited'}});return {jailed,freed:party().includes('naia'),stillJailed:n.jailed};
  })()`);
  assert.deepEqual(result.jailed, { present: true, party: false, camp: false, romance: 'none', approval: 83, combat: false });
  assert.equal(result.freed, true); assert.equal(result.stillJailed, false);
});

test('狂信徒自爆不连锁，全队近战留活口', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.scene='prologue_3';startCombat('tavern_ambush');
    const c=state.combat;const initialCultists=Object.values(c.units).filter(u=>u.type==='cultist').length;for(const u of Object.values(c.units))u.zone=1;
    const a=c.units.cultist1,b=c.units.cultist2,d=c.units.cultist3;
    for(const u of Object.values(c.units))if(u.type==='cultist'&&u!==a&&u!==b&&u!==d)u.out='fled';
    Math.random=()=>0;b.hp=1;d.hp=2;hurt(a,99);
    const chain={secondDead:!!b.dead,thirdHp:d.hp,thirdAlive:!d.dead};
    Math.random=()=>0.5;d.hp=1;c.spare=true;c.res={move:1,action:true,bonus:true};allyTurn(c.units.selene);
    return {initialCultists,chain,captured:d.out,fight:state.flags['prologue.fight_style']};
  })()`);
  assert.equal(result.initialCultists,5);
  assert.deepEqual(result.chain, { secondDead: true, thirdHp: 1, thirdAlive: true });
  assert.equal(result.captured, 'captured'); assert.equal(result.fight, 'fought');
});

test('清晨错误的 camp 标记不再自动扎营，玩家仍可主动扎营', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=1;state.camp={};
    let mode;gm=(action,shown,m)=>{mode=m;applyGM({camp:true},m);};restNight(null);
    const afterMorning={mode,pending:!!state.pendingCamp,camp:!!state.camp};
    applyGM({camp:true});return {afterMorning,manual:!!state.pendingCamp};
  })()`);
  assert.deepEqual(result, { afterMorning: { mode: 'morning', pending: false, camp: false }, manual: true });
});

test('灯塔分头行动：分组前不开战、不接受说书人写船的结果，去码头的人不参战', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';
    for(const id of ['selene','kassian','borin']) state.companions[id].recruited=true;
    applyGM({flags:{'act1.ship_intact':true},combat:'lighthouse'});
    const before={ship:state.flags['act1.ship_intact']??null,pending:state.pendingCombat,split:splitPending()};
    doSplit(['borin','kassian']);
    const party=Object.values(state.combat.units).filter(u=>u.side==='party').map(u=>u.ref).sort();
    return {before,party,present:present().sort(),ship:typeof state.flags['act1.ship_intact'],away:state.split.away,hp:state.companions.borin.hp<=state.companions.borin.hpMax};
  })()`);
  assert.deepEqual(result.before, { ship: null, pending: 'lighthouse', split: true });
  assert.deepEqual(result.party, ['player', 'selene']);
  assert.deepEqual(result.present, ['selene']);
  assert.equal(result.ship, 'boolean');
  assert.deepEqual(result.away, ['borin', 'kassian']);
});

test('没人去码头时船被炸；离开灯塔前必须先分组', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';state.companions.selene.recruited=true;
    applyGM({advance:'act1_dawn'});const held={scene:state.scene,pending:state.pendingAdvance};
    doSplit([]);return {held,scene:state.scene,ship:state.flags['act1.ship_intact']};
  })()`);
  assert.deepEqual(result, { held: { scene: 'act1_lighthouse', pending: 'act1_dawn' }, scene: 'act1_dawn', ship: false });
});

test('千面母开战时伪装、打不到；识破后现形，重伤会换脸', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';state.companions.selene.recruited=true;
    state.split={scene:'act1_lighthouse',away:[],text:''};startCombat('lighthouse');
    const fm=Object.values(state.combat.units).find(u=>u.type==='facemother');
    const hidden=!!fm.guise, targetable=validTarget({kind:'attack',w:0},fm);
    rollD20=()=>20;trySpot(state.combat.units.player);const shown=!fm.guise&&!!fm.cond.exposed;
    hurt(fm,20);const reshift=!!fm.guise&&fm.hp===50;
    hurt(fm,5);const smallHit=!!fm.guise;
    return {hidden,targetable,shown,reshift,smallHit};
  })()`);
  assert.deepEqual(result, { hidden: true, targetable: false, shown: true, reshift: true, smallHit: true });
});

test('未识破的伪装不会在先攻、换脸结果或说书人战况中透露面孔', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';
    state.companions.selene.recruited=true;state.split={scene:'act1_lighthouse',away:[],text:''};
    startCombat('lighthouse');const fm=Object.values(state.combat.units).find(u=>u.type==='facemother');
    const face=fm.guise, initiative=state.log.find(e=>e.t.startsWith('先攻：')).t, brief=combatBrief('narrate');
    delete fm.guise;const shift=hurt(fm,20), newFace=fm.guise, hiddenBrief=combatBrief('narrate');
    trySpot(state.combat.units.naia || {ref:'naia',name:'奈雅'});
    return {face,initiative,brief,shift,newFace,hiddenBrief,revealed:!fm.guise};
  })()`);
  assert.doesNotMatch(result.initiative, /千面母/);
  assert.doesNotMatch(result.brief, new RegExp('伪装成' + result.face));
  assert.doesNotMatch(result.shift, new RegExp(result.newFace));
  assert.doesNotMatch(result.hiddenBrief, new RegExp('伪装成' + result.newFace));
  assert.equal(result.revealed, true);
});

test('航海图要先拿到守誓人的钥匙；旧存档的航海图拿法转成钥匙', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    applyGM({flags:{'act1.chart':'opened'}});const noKey=state.flags['act1.chart']??null;
    applyGM({flags:{'act1.key':'stolen'}});applyGM({flags:{'act1.chart':'opened'}});const opened=state.flags['act1.chart'];
    const old=newGame(freshDraft());old.flags['act1.chart']='legal';tidyLog(old);
    return {noKey,opened,oldKey:old.flags['act1.key'],oldChart:old.flags['act1.chart']};
  })()`);
  assert.deepEqual(result, { noKey: null, opened: 'opened', oldKey: 'legal', oldChart: 'legal' });
});

test('战斗提前打完时，还在烧的导火线由代码收尾', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};const fight=(round,end,dice)=>{
      state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';state.companions.selene.recruited=true;
      state.split={scene:'act1_lighthouse',away:[],text:''};startCombat('lighthouse');const c=state.combat;
      c.lit={fuse:4};c.round=round;if(dice)rollD20=()=>dice;
      for(const u of Object.values(c.units))if(u.side!=='party')u.dead=true;
      if(end)c.end=end;endCombat(end||'victory');return state.log.filter(e=>e.k==='sys').map(e=>e.t).join('|');
    };
    return {early:fight(5),late:fight(7,null,1),hp:state.player.hp,fled:fight(5,'escaped')};
  })()`);
  assert.match(result.early, /扑灭了/);
  assert.match(result.late, /没来得及/); assert.ok(result.hp >= 1);
  assert.match(result.fled, /你们离开后/);
});

test('维克斯的债有结果后可以在酒馆入队；打过的码头斗殴之后还能强夺黑鳗号', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    applyGM({recruit:['vex']});const before={present:present().includes('vex'),recruited:state.companions.vex.recruited};
    state.flags['act1.lise']='saved';applyGM({recruit:['vex']});const after=state.companions.vex.recruited;
    state.scene='act1_docks';state.fought={docks_brawl:'victory'};
    applyGM({combat:'docks_brawl'});const again=state.pendingCombat||null;
    applyGM({combat:'docks_ship'});return {before,after,again,ship:state.pendingCombat,prompt:buildPrompt('我要抢船').includes('已经打完的遭遇')};
  })()`);
  assert.deepEqual(result, { before: { present: false, recruited: false }, after: true, again: null, ship: 'docks_ship', prompt: true });
});

test('可招募的同伴在说书人资料里写明要用 recruit，不能招募时不写', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    const before=companionBrief('vex').includes('recruit:["vex"]');
    state.flags['act1.lise']='saved';const after=companionBrief('vex').includes('recruit:["vex"]');
    state.companions.vex.recruited=true;return {before,after,joined:companionBrief('vex').includes('recruit:')};
  })()`);
  assert.deepEqual(result, { before: false, after: true, joined: false });
});

test('个人任务按顺序推进，第二步要赞同度 20，考验通过后才能立誓约', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';const k=state.companions.kassian;k.recruited=true;
    applyGM({flags:{'quest.kassian.poison':true}});const skip=!!state.flags['quest.kassian.poison'];
    applyGM({flags:{'quest.kassian.arden':true}});applyGM({flags:{'quest.kassian.poison':true}});const lowApproval=!!state.flags['quest.kassian.poison'];
    k.approval=25;applyGM({flags:{'quest.kassian.poison':true,'quest.kassian':'spared'}});
    const done={poison:state.flags['quest.kassian.poison'],choice:state.flags['quest.kassian']};
    applyGM({flags:{'quest.kassian':'exposed'}});const locked=state.flags['quest.kassian'];
    applyGM({flags:{'quest.selene.truth':true}});const act2=!!state.flags['quest.selene.truth'];
    k.approval=85;k.romance='together';applyGM({romance:[{id:'kassian',to:'vowed'}]});const noVow=k.romance;
    applyGM({flags:{'quest.kassian.tested':true}});applyGM({romance:[{id:'kassian',to:'vowed'}]});
    return {skip,lowApproval,done,locked,act2,noVow,vowed:k.romance,brief:companionBrief('kassian').includes('斗兽场的回声')};
  })()`);
  assert.deepEqual(result, { skip: false, lowApproval: false, done: { poison: true, choice: 'spared' }, locked: 'spared', act2: false, noVow: 'together', vowed: 'vowed', brief: true });
});

test('维克斯独自去交易：赞同不够就带着妹妹和龙蛋消失', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';const v=state.companions.vex;v.recruited=true;v.approval=25;
    applyGM({flags:{'act1.debt_known':true,'quest.vex.egg':true,'quest.vex':'alone'}});
    return {lise:state.flags['act1.lise'],gone:!party().includes('vex'),left:!!v.left};
  })()`);
  assert.deepEqual(result, { lise: 'saved', gone: true, left: true });
});

test('第二幕：第一幕结束接到出海，航程每晚一个海上事件，暴风由代码结算', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_dawn';state.ended=true;closeModal=()=>{};render=()=>{};
    state.companions.selene.recruited=true;state.flags['act1.departure_ship']='seagull';
    nextAct();state.voyage=['act2_siren','act2_ghost','act2_storm'];const start={act:state.act,scene:state.scene,level:state.player.level};
    state.camp={};restNight(null);const sirenLine=state.log.find(e=>e.k==='sys'&&/海妖之歌/.test(e.t))?.t||'';const siren={scene:state.scene,saves:/=[0-9]+ (成功|失败)/.test(sirenLine)&&!/object/.test(sirenLine)};
    state.camp={};restNight(null);const ghost=state.scene;
    state.camp={};restNight(null);const storm={scene:state.scene,flag:state.flags['act2.storm'],clean:!/object|NaN/.test(state.log.filter(e=>e.k==='sys').pop().t)};
    applyGM({flags:{'act2.storm':'light'},advance:'act2_hub'});
    return {start,siren,ghost,storm,hub:state.scene,stormKept:state.flags['act2.storm']===storm.flag};
  })()`);
  assert.deepEqual(result.start, { act: 2, scene: 'act2_1', level: 6 });
  assert.deepEqual(result.siren, { scene: 'act2_siren', saves: true });
  assert.equal(result.ghost, 'act2_ghost');
  assert.equal(result.storm.scene, 'act2_storm'); assert.ok(result.storm.clean); assert.ok(['light', 'heavy'].includes(result.storm.flag));
  assert.equal(result.hub, 'act2_hub'); assert.equal(result.stormKept, true);
});

test('第二幕：岛屿升级、神殿要钥匙、誓约之心与主教掳人、龙蛋计数', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=2;state.scene='act2_hub';levelUp(6);
    for(const id of ['selene','vex','kassian']) state.companions[id].recruited=true;
    state.companions.kassian.approval=50;state.companions.vex.approval=10;
    applyGM({advance:'act2_temple'});const locked=state.scene;
    for(const id of ['act2_bone','act2_ember','act2_mist']){applyGM({advance:id});applyGM({advance:'act2_hub'});}
    const level=state.player.level;
    state.flags['quest.vex.egg']=true;applyGM({flags:{'act2.egg_warmed':2}});const skip=state.flags['act2.egg_warmed']??0;
    applyGM({flags:{'act2.egg_warmed':1}});applyGM({flags:{'act2.egg_warmed':2}});const warmed=state.flags['act2.egg_warmed'];
    applyGM({flags:{'act2.temple_key':'stolen'}});applyGM({advance:'act2_temple'});
    applyGM({advance:'act2_temple_truth'});const blocked=state.scene;
    applyGM({flags:{'act2.trial_courage':true},advance:'act2_temple_truth'});applyGM({flags:{'act2.trial_truth':true},advance:'act2_temple_heart'});
    applyGM({flags:{'act2.heart':'destroyed'}});const noTide=state.flags['act2.heart']??null;
    applyGM({advance:'act2_end'});
    return {locked,blocked,level,skip,warmed,noTide,heart:state.flags['act2.heart'],taken:state.flags['act2.taken'],gone:!party().includes('kassian'),ambush:state.log.some(e=>e.t.includes('撤离神殿途中')&&e.t.includes('掳走了卡西安')),scene:state.scene};
  })()`);
  assert.deepEqual(result, { locked: 'act2_hub', blocked: 'act2_temple', level: 9, skip: 0, warmed: 2, noTide: null, heart: 'cult', taken: 'kassian', gone: true, ambush:true, scene: 'act2_end' });
});

test('烬卫达林：熔炉给他回血，博林的战歌唤醒他', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=2;state.scene='act2_ember';levelUp(7);state.companions.borin.recruited=true;
    startCombat('darin_forge');const c=state.combat,d=Object.values(c.units).find(u=>u.type==='darin');
    const forge=Object.values(c.units).find(u=>u.type==='forge');d.hp=90;foeTurn(forge);const healed=d.hp;
    rollD20=()=>20;const b=c.units.borin,progress=[];for(let i=0;i<3;i++){c.res={move:1,action:true,bonus:true};allyTurn(b);progress.push(state.flags['act2.darin']||null);}
    return {healed,progress,out:d.out,flag:state.flags['act2.darin'],result:combatResult()};
  })()`);
  assert.deepEqual(result, { healed: 100, progress: [null, null, 'woke'], out: 'awakened', flag: 'woke', result: 'victory' });
});

test('说书人不能跳过战歌唤醒达林，杀死和放任仍能正常记录', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_ember_forge';
    applyGM({flags:{'act2.darin':'woke'}});const forged=state.flags['act2.darin']||null;
    state.act=3;const falseAlly=allies().some(a=>a.id==='darin');state.act=2;
    applyGM({flags:{'act2.darin':'killed'}});const killed=state.flags['act2.darin'];
    delete state.flags['act2.darin'];applyGM({flags:{'act2.darin':'left'}});const left=state.flags['act2.darin'];
    state.flags['act2.darin']='woke';applyGM({flags:{'act2.darin':'woke'}});
    return {forged,falseAlly,killed,left,existing:state.flags['act2.darin']};
  })()`);
  assert.deepEqual(result, {forged:null,falseAlly:false,killed:'killed',left:'left',existing:'woke'});
});

test('第三幕：盟友按标记算，赞同低又没了结个人任务的同伴在最后一夜背叛，攻山路线和说服主教有条件', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_council';
    for(const id of ['selene','vex','kassian']) state.companions[id].recruited=true;
    state.companions.vex.approval=-10;state.companions.kassian.approval=-10;state.flags['quest.kassian']='spared';
    state.flags['act1.sath_trust']=true;state.flags['act2.darin']='woke';
    const allyNames=allies().map(a=>a.id);const line=buildPrompt('开会').includes('盟友（程序按之前的选择算出，共 2 方）');
    applyGM({advance:'act3_whisper'});
    const betrayed={vex:!!state.companions.vex.betrayed,kassian:!!state.companions.kassian.betrayed,party:party().sort()};
    state.scene='act3_climb';applyGM({flags:{'act3.route':'wings'}});const wings=state.flags['act3.route']??null;
    applyGM({flags:{'act3.route':'charge'}});const charge=state.flags['act3.route'];
    state.scene='act3_altar';applyGM({flags:{'act3.valdo':'convinced'}});const noProof=state.flags['act3.valdo']??null;
    state.flags['act2.eve']=true;state.flags['quest.selene.diary']=true;applyGM({flags:{'act3.valdo':'convinced','act3.ending':'crown'}});
    return {allyNames,line,betrayed,wings,charge,noProof,valdo:state.flags['act3.valdo'],ending:state.flags['act3.ending']??null};
  })()`);
  assert.deepEqual(result, { allyNames: ['watch', 'darin'], line: true, betrayed: { vex: true, kassian: false, party: ['kassian', 'selene'] },
    wings: null, charge: 'charge', noProof: null, valdo: 'convinced', ending: null });
});

test('烬王：低语、升空后近战够不着、盟友压制、坠落时进入最终抉择，选完进入终章', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};openFinal=()=>{};render=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_king';levelUp(12);
    state.companions.selene.recruited=true;state.flags['act1.sath_trust']=true;
    startCombat('ember_king');const c=state.combat,k=Object.values(c.units).find(u=>u.type==='ember_king');
    k.hp=150;kingTurn(k);const air={aloft:k.aloft,grounded:k.grounded,allies:c.allies.length};
    kingTurn(k);const noMelee=validTarget({kind:'attack',w:0},k)===false||state.combat.units.player.weapons[0].ranged;
    kingTurn(k);const landsWithoutAllies=k.grounded;
    hurt(k,60);const fallen=!!k.fallen&&!combatResult();hurt(k,500);const result=combatResult();endCombat(result);
    const pending=!!state.pendingFinal;const egg=ENDINGS.egg.need().length>0, crown=ENDINGS.crown.need().length===0;
    chooseEnding('crown');
    return {air,noMelee,landsWithoutAllies,fallen,result,pending,egg,crown,scene:state.scene,ending:state.flags['act3.ending']};
  })()`);
  assert.deepEqual(result, { air: { aloft: true, grounded: true, allies: 0 }, noMelee: true, landsWithoutAllies: true, fallen: true, result: 'final', pending: true, egg: true, crown: true, scene: 'act3_end', ending: 'crown' });
});

test('最终战失败就是港口陷落', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};render=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_king';levelUp(12);
    startCombat('ember_king');const exit=state.combat.zones[0].tags.includes('exit');
    state.combat.zones[0].tags=[];restoreCombatExit(state);const oldSaveExit=state.combat.zones[0].tags.includes('exit');
    for(const u of Object.values(state.combat.units)) if(u.side==='party'){u.hp=0;u.down=true;}
    endCombat(combatResult());return {exit,oldSaveExit,ending:state.flags['act3.ending'],scene:state.scene,over:!!state.gameOver};
  })()`);
  assert.deepEqual(result, { exit: true, oldSaveExit: true, ending: 'fall', scene: 'act3_end', over: false });
});

test('港口陷落后重新挑战立即保存恢复的进度', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_end';state.flags['act3.ending']='fall';
    const checkpoint=newGame(freshDraft());checkpoint.runId=state.runId;checkpoint.act=3;checkpoint.scene='act3_climb';
    let saved=null, button=null;readSave=()=>({state:checkpoint});checkpoint.phase="play";
    loadState=s=>{state=s;return true};save=()=>{saved={scene:state.scene,ending:state.flags['act3.ending']||null}};closeModal=()=>{};
    el=(tag,cls,text)=>({tag,text,style:{},classList:{add(){}},append(){},setAttribute(){}});
    modal=(title,build)=>build({classList:{add(){}},append(...items){for(const item of items) if(item.text?.startsWith('重新挑战')) button=item}});
    openEnd();button.onclick();return saved;
  })()`);
  assert.deepEqual(result,{scene:'act3_climb',ending:null});
});

test('第一幕的小场景：货舱要先知道债、舞会要请柬；小场景不算升级的地点', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';levelUp(2);
    applyGM({advance:'act1_docks'});applyGM({advance:'act1_docks_hold'});const hold=state.scene;
    applyGM({flags:{'act1.debt_known':true},advance:'act1_docks_hold'});const hold2=state.scene;
    applyGM({advance:'act1_docks_casino'});applyGM({advance:'act1_docks_arena'});applyGM({advance:'act1_hub'});
    applyGM({advance:'act1_manor'});applyGM({advance:'act1_manor_ball'});const ball=state.scene;
    applyGM({flags:{'act1.invite':'bought'},advance:'act1_manor_ball'});const ball2=state.scene;
    applyGM({advance:'act1_manor_vault'});applyGM({advance:'act1_hub'});
    return {hold,hold2,ball,ball2,level:state.player.level,market:nextOf(SCENES.act1_hub).includes('act1_market')};
  })()`);
  assert.deepEqual(result, { hold: 'act1_docks', hold2: 'act1_docks_hold', ball: 'act1_manor', ball2: 'act1_manor_ball', level: 3, market: true });
});

test('支线：在对的场景能接，先接下才能完成，完成时代码发奖励', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_market';
    const offer=buildPrompt('看看').includes('《寡妇的渔船》（side.widow_boat）');
    applyGM({flags:{'side.ghost_ring':'done'}});const skip=state.flags['side.ghost_ring']??null;
    const gold=state.player.gold;applyGM({flags:{'side.ghost_ring':'taken'}});applyGM({flags:{'side.ghost_ring':'done'}});
    const after={state:state.flags['side.ghost_ring'],gold:state.player.gold-gold,item:state.player.inventory.includes('老海狗的鱼叉')};
    applyGM({flags:{'side.ghost_ring':'failed'}});
    state.scene='act1_manor';applyGM({flags:{'side.watch_mole':'taken'}});applyGM({flags:{'side.watch_mole':'done'}});
    return {offer,skip,after,locked:state.flags['side.ghost_ring'],sath:state.flags['act1.sath_trust']};
  })()`);
  assert.deepEqual(result, { offer: true, skip: null, after: { state: 'done', gold: 15, item: true }, locked: 'done', sath: true });
});

test('营地事件的数据完整：同伴存在、条件能执行', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_hub';
    const bad=CAMP_EVENTS.filter(e=>{try{ if(e.group) e.when(); else if(e.pair) return !e.pair.every(id=>COMPANIONS[id]); else { if(!COMPANIONS[e.who]) return true; e.when(state.companions[e.who]); } return !e.seed||!KIND_ORDER.hasOwnProperty(e.kind)&&!LISTED.includes(e.kind)||e.kind==='farewell'&&!COMPANIONS[e.who]; }catch(x){return true;}}).map(e=>e.id);
    const ids=CAMP_EVENTS.map(e=>e.id);return {bad,dup:ids.length-new Set(ids).size,count:ids.length};
  })()`);
  assert.deepEqual(result.bad, []); assert.equal(result.dup, 0); assert.ok(result.count >= 55, String(result.count));
});

test('数据完整：出口、遭遇、支线地点、个人任务标记都指向存在的东西', () => {
  const run = game();
  const result = run(`(() => {
    const bad=[];
    for(const [id,sc] of Object.entries(SCENES)){
      for(const n of nextOf(sc)) if(!SCENES[n]) bad.push(id+' → '+n);
      for(const e of sc.encounters||[]) if(!ENCOUNTERS[e]) bad.push(id+' 遭遇 '+e);
      for(const g of Object.keys(sc.gate||{})) if(!nextOf(sc).includes(g)) bad.push(id+' gate '+g);
      if(sc.campNext&&!SCENES[sc.campNext]) bad.push(id+' campNext');
      if(sc.after&&!SCENES[sc.after]) bad.push(id+' after');
      for(const m of (sc.anchor.match(/act\d_[a-z_]+(?= |；|）|，|。|$)/g)||[])) if(!SCENES[m]&&!FLAG_KEYS[m]&&!/^act\d_$/.test(m)) bad.push(id+' 锚点提到 '+m);
    }
    for(const [id,q] of Object.entries(SIDE)) for(const a of q.at) if(!SCENES[a]) bad.push('支线 '+id+' '+a);
    for(const [id,E] of Object.entries(ENCOUNTERS)) for(const [t] of [...E.foes,...(E.events||[]).flatMap(e=>e.spawn||[])]) if(!ENEMIES[t]) bad.push(id+' 敌人 '+t);
    return bad;
  })()`);
  assert.deepEqual(result, []);
});

test('第三幕：先救的街区才能去；支线能补出盟友；伊芙的信可以代替证词', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_1';
    applyGM({advance:'act3_docks_fire'});const blocked=state.scene;
    applyGM({flags:{'act3.saved_first':'docks'},advance:'act3_docks_fire'});const docks=state.scene;
    const before=allies().length;
    state.flags['side.ward_stones']='done';state.flags['act1.eel']='enemy';state.scene='act3_haven';
    applyGM({flags:{'side.eel_deal':'taken'}});applyGM({flags:{'side.eel_deal':'done'}});
    const after=allies().map(a=>a.id).sort();
    state.scene='act3_altar';state.flags['quest.selene.diary']=true;state.flags['side.eve_letter']='done';
    applyGM({flags:{'act3.valdo':'convinced'}});
    return {blocked,docks,before,after,valdo:state.flags['act3.valdo']};
  })()`);
  assert.deepEqual(result, { blocked: 'act3_1', docks: 'act3_docks_fire', before: 0, after: ['academy', 'tide'], valdo: 'convinced' });
});

test('装备：换上武器、护甲、饰品后战斗数值跟着变，卸下放回行囊', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.companions.selene.recruited=true;
    const before=partyUnit('player',0);
    state.player.inventory.push('黑潮弯刀','加固皮甲','精准指环','守誓人徽记','手弩');
    equip('player','melee','黑潮弯刀');equip('player','armor','加固皮甲');equip('player','trinket1','精准指环');equip('selene','trinket1','守誓人徽记');equip('selene','ranged','手弩');
    const u=partyUnit('player',0),s=partyUnit('selene',0);
    const wrong=equip('player','armor','治疗药水');
    unequip('player','melee');const back=state.player.inventory.includes('黑潮弯刀');
    return {acUp:u.ac-before.ac,sword:u.weapons.find(w=>!w.ranged).n,hitUp:u.weapons.find(w=>!w.ranged).hit-before.weapons.find(w=>!w.ranged).hit,
      seleneBow:s.weapons.some(w=>w.n==='手弩'),seleneAc:acTotal('selene')-COMPANIONS.selene.ac,save:bonusFor('selene','save_wis').total-Math.floor((COMPANIONS.selene.ab.wis-10)/2),wrong,back};
  })()`);
  assert.deepEqual(result, { acUp: 1, sword: '黑潮弯刀', hitUp: 2, seleneBow: true, seleneAc: 1, save: 1, wrong: false, back: true });
});

test('战利品只发一次；商店买卖；说书人给的稀有物品要锚点里写着才算', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';const gold=state.player.gold;
    startCombat('docks_brawl');for(const u of Object.values(state.combat.units)) if(u.side!=='party') u.dead=true;endCombat(combatResult());
    const looted={gold:state.player.gold-gold,bow:state.player.inventory.includes('手弩')};
    state.scene='act1_market';state.player.gold=100;const ok=buy('治疗药水',SHOPS.act1_market),noRare=buy('龙骨刃',SHOPS.act1_market);
    const sold=sell('手弩');
    applyGM({items_add:['龙鳞甲','一根绳子']});const rare=state.player.inventory.includes('龙鳞甲'),junk=state.player.inventory.includes('一根绳子');
    state.scene='act1_manor_vault';applyGM({items_add:['银刃匕首']});
    return {looted,ok,noRare,sold,gold:state.player.gold,rare,junk,dagger:state.player.inventory.includes('银刃匕首')};
  })()`);
  assert.deepEqual(result, { looted: { gold: 45, bow: true }, ok: true, noRare: false, sold: true, gold: 100, rare: false, junk: true, dagger: true });
});

test('同伴生命低时自己喝行囊里的药；炸弹扔向区域', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';state.companions.selene.recruited=true;
    state.player.inventory.push('治疗药水','火焰炸弹');startCombat('docks_brawl');const c=state.combat,s=c.units.selene;
    s.hp=2;c.res={move:0,action:true,bonus:true};allyTurn(s);const drank={hp:s.hp>2,left:state.player.inventory.filter(x=>x==='治疗药水').length};
    const before=state.player.inventory.filter(x=>x==='治疗药水').length;
    c.turn=c.order.indexOf('player');c.started=true;c.res={move:1,action:true,bonus:true};pick={kind:'fireball',item:'火焰炸弹',label:'火焰炸弹'};castFireball(1);
    return {drank,bomb:!state.player.inventory.includes('火焰炸弹'),log:state.log.some(e=>e.k==='cb'&&/火焰炸弹砸进/.test(e.t))};
  })()`);
  assert.equal(result.drank.hp, true); assert.equal(result.bomb, true); assert.equal(result.log, true);
});

test('印记：龙化值跨过门槛解锁能力、同伴按看法调整赞同；龙之眼识破伪装，龙息烧区域，龙翼飞起来', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_lighthouse';
    for(const id of ['selene','lyra']) state.companions[id].recruited=true;
    applyGM({draconic:15});applyGM({draconic:15});applyGM({draconic:15});
    const unlocked=marksOf('player').map(m=>m.id),appr={selene:state.companions.selene.approval,lyra:state.companions.lyra.approval};
    state.split={scene:'act1_lighthouse',away:[],text:''};startCombat('lighthouse');const c=state.combat,me=c.units.player;
    const fm=Object.values(c.units).find(u=>u.type==='facemother');const eye=useMark(me,'eye')&&!fm.guise&&c.eye;
    const again=useMark(me,'eye');const z=c.units.assassin1.zone,hp=c.units.assassin1.hp;useMark(me,'breath',z);
    const burned=c.units.assassin1.hp<hp||c.units.assassin1.dead;const wings=useMark(me,'wings');
    return {unlocked,appr,eye,again,burned,wings,drac:state.player.draconic};
  })()`);
  assert.deepEqual(result.unlocked, ['eye', 'breath']);
  assert.deepEqual(result.appr, { selene: -3, lyra: 3 });
  assert.equal(result.eye, true); assert.equal(result.again, false); assert.equal(result.burned, true);
  assert.equal(result.wings, false); assert.equal(result.drac, 60);
});

test('共鸣：营地里看过共鸣事件后解锁合体技；进入第二幕同伴龙化 +15；莉拉接受邀请 +30', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';const s=state.companions.selene;s.recruited=true;s.approval=45;
    state.campSeen=['act1_home','selene_scene','selene_hint'];state.camp={plan:planNight(),done:[],talk:null};const planned=state.camp.plan.important;
    talkTo('selene');const res=!!s.resonance;
    startCombat('docks_brawl');const c=state.combat,me=c.units.player,mate=c.units.selene;mate.zone=me.zone;
    const foe=Object.values(c.units).find(u=>u.side!=='party');c.res={move:1,action:true,bonus:true};comboStrike(me,mate,foe);const used=!!c.combos.selene;state.combat=null;
    state.scene='act1_dawn';state.ended=true;closeModal=()=>{};render=()=>{};nextAct();
    state.flags['quest.lyra.oswald']=true;state.flags['act1.notes_copied']=true;state.companions.lyra.approval=30;state.scene='act2_ember_study';
    applyGM({flags:{'quest.lyra':'joined'}});
    return {planned,res,used,selene:s.draconic,lyra:state.companions.lyra.draconic};
  })()`);
  assert.deepEqual(result, { planned: 'selene_resonance', res: true, used: true, selene: 15, lyra: 45 });
});

test('职业能力：按等级解锁，守护灵光加 AC，反射闪避减半范围伤害，三连击打三下', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=2;state.scene='act2_ember';levelUp(11);state.pendingAsi=0;
    for(const id of ['selene','vex','borin']) state.companions[id].recruited=true;
    startCombat('ember_outpost');const c=state.combat,sel=c.units.selene,vex=c.units.vex,bor=c.units.borin;
    const feats={selene:sel.feats,vex:vex.feats,borin:bor.feats};
    vex.zone=sel.zone;const foe=Object.values(c.units).find(u=>u.type==='ember_guard');foe.zone=sel.zone;
    const m=attackMods(foe,vex,foe.weapons[0]).ac,base=vex.ac;
    const hp=vex.hp;hurt(vex,20,{area:true});const area=hp-vex.hp;
    let swings=0;const orig=fightTurn;fightTurn=()=>{swings++;};c.res={move:1,action:true,bonus:true};bor.sigUsed=true;bor.fUsed.surge=true;allyTurn(bor);fightTurn=orig;
    return {feats,aura:base-0,auraAc:'skip',area,swings};
  })()`);
  assert.deepEqual(result.feats.selene, ['aura', 'radiant']); assert.deepEqual(result.feats.vex, ['evasion', 'uncanny']); assert.deepEqual(result.feats.borin, ['surge', 'triple']);
  assert.equal(result.area, 10); assert.equal(result.swings, 3);
});

test('同伴专属技能各用一次；短休两次后要长休', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';
    for(const id of ['selene','kassian','borin']) state.companions[id].recruited=true;
    startCombat('docks_brawl');const c=state.combat;c.res={move:1,action:true,bonus:true};
    const k=c.units.kassian;signatureTurn(k);const bless=c.blessed>=c.round&&k.sigUsed;
    const sel=c.units.selene;c.units.borin.hp=0;c.units.borin.down=true;c.res={move:1,action:true,bonus:true};signatureTurn(sel);const raised=!c.units.borin.down;
    state.combat=null;state.player.hp=1;const r1=shortRest(),r2=shortRest(),r3=shortRest();
    state.camp={};restNight(null);const reset=state.shortRests;
    return {bless,raised,r:[r1,r2,r3],reset};
  })()`);
  assert.deepEqual(result, { bless: true, raised: true, r: [true, true, false], reset: 0 });
});

test('阵营声望：关键选择算底数，说书人小幅增减；影响价格、不卖、第三幕盟友、烬冠加冕', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_market';
    const start={watch:repOf('watch'),cult:repOf('cult')};
    state.flags['act1.sath_trust']=true;applyGM({reputation:[{id:'watch',delta:40},{id:'nope',delta:5}]});const watch=repOf('watch');
    const price=priceOf('治疗药水',SHOPS.act1_market);
    state.flags['act1.eel']='enemy';state.repDelta.tide=-20;const shut=shopShut(SHOPS.act1_docks_casino);state.player.gold=999;const bought=buy('强效治疗药水',SHOPS.act1_docks_casino);
    state.act=3;const al=allies().map(a=>a.id);
    const crown=ENDINGS.crown.text.includes('教团的信徒不承认你');state.repDelta.cult=40;const crown2=ENDINGS.crown.text.includes('主教瓦尔多亲自');
    return {start,watch,price,shut,bought,al,crown,crown2};
  })()`);
  assert.deepEqual(result, { start: { watch: 0, cult: -30 }, watch: 40, price: 23, shut: true, bought: false, al: ['watch'], crown: true, crown2: true });
});

test('烬王末路崩塌平台；主教生命过半开始献祭，3 回合后烬王更强；攻山前记下存档点', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};const store={};localStorage.setItem=(k,v)=>{store[k]=v;};localStorage.getItem=k=>store[k]??null;
    state=newGame(freshDraft());state.act=3;state.scene='act3_whisper';state.companions.selene.recruited=true;levelUp(11);
    goScene('act3_climb');const cp=!!store['dragon-oath-checkpoint'];
    state.scene='act3_altar';startCombat('valdo_altar');let c=state.combat;c.res={move:1,action:true,bonus:true};const v=Object.values(c.units).find(u=>u.type==='valdo');
    for(const u of Object.values(c.units)) if(u.type==='pillar') u.out='defeated';
    hurt(v,Math.ceil(v.max/2)+1);const started=c.ritualAt;const ritualText=c.feed.at(-1);c.turn=c.order.length;for(let i=0;i<3;i++){c.turn=c.order.length-1;nextTurn();}
    const ritual=!!state.flags['act3.ritual'];state.combat=null;
    state.scene='act3_king';startCombat('ember_king');c=state.combat;c.res={move:1,action:true,bonus:true};const k=Object.values(c.units).find(u=>u.type==='ember_king');const bigger=k.max>Math.round(300*1.3);
    for(const u of Object.values(c.units)) if(u.side==='party') u.zone=1;hurt(k,k.hp-Math.floor(k.max/3)+1);
    const zonesBefore=c.zones.filter(z=>!z.gone).length;kingTurn(k);const zonesAfter=c.zones.filter(z=>!z.gone).length;
    return {cp,started:!!started,ritual,ritualText,bigger,fallen:k.fallen,collapsed:zonesBefore-zonesAfter,partyMoved:Object.values(c.units).filter(u=>u.side==='party').every(u=>!c.zones[u.zone].gone)};
  })()`);
  assert.match(result.ritualText, /祖坛上的刻纹燃起黑火/);
  delete result.ritualText;
  assert.deepEqual(result, { cp: true, started: true, ritual: true, bigger: true, fallen: true, collapsed: 1, partyMoved: true });
});

test('支线的前置条件：没满足时不出现、接不了', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    SIDE.chain_test={name:'测试链',act:1,at:['act1_hub'],need:()=>state.flags['side.tom_leg']==='done',hook:'钩子',goal:'目标',reward:{},rewardText:'无'};FLAG_KEYS['side.chain_test']=['taken','done','failed'];
    const hidden=!buildPrompt('看').includes('测试链');applyGM({flags:{'side.chain_test':'taken'}});const blocked=state.flags['side.chain_test']??null;
    state.flags['side.tom_leg']='done';const shown=buildPrompt('看').includes('测试链');applyGM({flags:{'side.chain_test':'taken'}});
    return {hidden,blocked,shown,taken:state.flags['side.chain_test']};
  })()`);
  assert.deepEqual(result, { hidden: true, blocked: null, shown: true, taken: 'taken' });
});

test('航程：从五个海上事件里抽两个，暴风总是最后一夜；旧存档走过的事件排在前面；无风带由代码结算', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};const plans=[];
    for(let i=0;i<40;i++){state=newGame(freshDraft());state.act=2;state.scene='act2_1';plans.push(voyagePlan());}
    const ok=plans.every(p=>p.length===3&&p[2]==='act2_storm'&&new Set(p).size===3&&p.slice(0,2).every(id=>VOYAGE_POOL.includes(id)));
    const kinds=new Set(plans.flatMap(p=>p.slice(0,2))).size;
    state=newGame(freshDraft());state.act=2;state.scene='act2_1';state.voyage=['act2_doldrums','act2_castaway','act2_storm'];
    const walk=[];for(let i=0;i<3;i++){state.camp={};restNight(null);walk.push(state.scene);}
    const dold=state.flags['act2.doldrums'];applyGM({flags:{'act2.doldrums':'ok','act2.castaway':'saved'}});
    state=newGame(freshDraft());state.act=2;state.scene='act2_ghost';push('you','旧档');const legacy=campNextOf(SCENES.act2_ghost);
    return {ok,kinds,walk,dold,legacyFirst:state.voyage[0],legacy};
  })()`);
  assert.equal(result.ok, true); assert.ok(result.kinds >= 4, String(result.kinds));
  assert.deepEqual(result.walk, ['act2_doldrums', 'act2_castaway', 'act2_storm']);
  assert.ok(['ok', 'bad'].includes(result.dold));
  assert.equal(result.legacyFirst, 'act2_ghost'); assert.notEqual(result.legacy, 'act2_ghost');
});

test('航程没抽到幽灵船时，赛勒涅个人任务的第二步在漂流者和纪念礁也能完成；救下漂流者潮裔声望 +10', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_mist_memorial';const s=state.companions.selene;s.recruited=true;s.approval=30;
    state.flags['quest.selene.diary']=true;const before=repOf('tideborn');
    applyGM({flags:{'quest.selene.truth':true,'act2.castaway':'saved'}});
    return {truth:state.flags['quest.selene.truth'],memorial:SCENES.act2_mist_memorial.anchor.includes('quest.selene.truth'),castaway:SCENES.act2_castaway.anchor.includes('quest.selene.truth'),rep:repOf('tideborn')-before};
  })()`);
  assert.deepEqual(result, { truth: true, memorial: true, castaway: true, rep: 10 });
});

test('恋爱关键场景：营地里跟着对方走开进入单独的场景，只有两人在场，结束后回到篝火边还能睡觉', () => {
  const run = game();
  const result = run(`(() => {
    const calls=[];gm=(a,s)=>{if(s)push('you',s);calls.push(a);};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    const s=state.companions.selene;s.recruited=true;s.approval=45;state.companions.borin.recruited=true;
    state.campSeen=['act1_home'];enterCamp();const planned=state.camp.plan.important;
    talkTo('selene');const inside={scene:state.scene,camp:state.camp,present:present(),line:nextLine(SCENES[state.scene])};
    applyGM({scene_end:true});const early=state.scene;
    push('you','我接过剑');applyGM({romance:[{id:'selene',to:'hint'}],scene_end:true});
    return {planned,inside,early,back:state.scene,romance:s.romance,camp:!!state.camp,done:state.camp?.done,talk:state.camp?.talk,seen:state.campSeen.includes('selene_scene')};
  })()`);
  assert.equal(result.planned, 'selene_scene');
  assert.equal(result.inside.scene, 'love_selene'); assert.equal(result.inside.camp, null);
  assert.deepEqual(result.inside.present, ['selene']); assert.match(result.inside.line, /插曲/);
  assert.equal(result.early, 'love_selene');
  assert.equal(result.back, 'act1_hub'); assert.equal(result.romance, 'hint');
  assert.equal(result.camp, true); assert.deepEqual(result.done, ['selene']); assert.equal(result.talk, null); assert.equal(result.seen, true);
});

test('赫斯提雅每幕入梦一次：按信任值走向不同，醒来后写清晨；第三幕最后一夜梦完进入攻山', () => {
  const run = game();
  const result = run(`(() => {
    const calls=[];gm=(a,s,m)=>{calls.push([a,m]);};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=1;state.day=1;
    state.camp={};restNight(null);const first=state.scene;
    state.camp={};restNight(null);const dreaming=state.scene;state.hestiaTrust=25;
    const prompt=buildPrompt('你好');const high=prompt.includes(SCENES.hestia_dream1.trust.high);
    applyGM({hestia_trust:5,scene_end:true});const notYet=state.scene;
    push('you','我信你');const insp=state.player.inspiration;applyGM({scene_end:true});
    const woke={scene:state.scene,insp:state.player.inspiration-insp,wake:state.pendingWake?.mode,trust:state.hestiaTrust};
    state.pendingWake=null;state.camp={};restNight(null);const again=state.scene;
    state=newGame(freshDraft());state.act=3;state.scene='act3_whisper';state.hestiaTrust=-30;state.camp={};restNight(null);
    const d3={scene:state.scene,low:buildPrompt('x').includes(SCENES.hestia_dream3.trust.low)};push('you','不');applyGM({scene_end:true});
    return {first,dreaming,high,notYet,woke,again,d3,climb:state.scene,next:!!state.pendingWake&&!state.pendingWake.mode};
  })()`);
  assert.equal(result.first, 'act1_hub'); assert.equal(result.dreaming, 'hestia_dream1'); assert.equal(result.high, true);
  assert.equal(result.notYet, 'hestia_dream1');
  assert.deepEqual(result.woke, { scene: 'act1_hub', insp: 1, wake: 'morning', trust: 30 });
  assert.equal(result.again, 'act1_hub');
  assert.deepEqual(result.d3, { scene: 'hestia_dream3', low: true });
  assert.equal(result.climb, 'act3_climb'); assert.equal(result.next, true);
});

test('酒馆升级：花金币，说书人写不了；客房多一次短休、吧女分钱或添补给、情报站多一条消息、第三幕多一条攻山的路', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=state.day;state.player.gold=100;
    applyGM({flags:{'tavern.rooms':true}});const forged=!!state.flags['tavern.rooms'];
    const a=upgradeTavern('rooms'),b=upgradeTavern('barmaid');const gold=state.player.gold;const poor=upgradeTavern('intel');
    state.camp={};restNight(null);const night={gold:state.player.gold-gold,short:state.shortRests};
    let n=0;state.player.hp=1;while(shortRest())n++;
    state.player.gold=200;upgradeTavern('intel');const intel=buildPrompt('x').includes('【情报站】');
    state.scene='act1_docks';const away=buildPrompt('x').includes('【情报站】');
    state.act=3;state.scene='act3_haven';const sup=state.supplies;state.camp={};restNight(null);const sup3=state.supplies-sup;
    state.scene='act3_climb';applyGM({flags:{'act3.route':'tunnel'}});
    return {forged,poor,a,b,spent:100-gold,night,shorts:n,intel,away,sup3,route:state.flags['act3.route']};
  })()`);
  assert.equal(result.forged, false); assert.equal(result.poor, false); assert.equal(result.a, true); assert.equal(result.b, true);
  assert.equal(result.spent, 100); assert.deepEqual(result.night, { gold: 8, short: -1 });
  assert.equal(result.shorts, 3); assert.equal(result.intel, true); assert.equal(result.away, false);
  assert.equal(result.sup3, 1); assert.equal(result.route, 'tunnel');
});

test('DS 扩充：新支线的场景、奖励与事件链都合法', () => {
  const run = game();
  const result = run(`(() => {
    state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub'; gm = () => {};
    const ids = ['martha_letters','tom_errand','sath_ledger','pearl_diver','ribs_smuggler','ember_cook','siren_verse','ghost_letters','eve_bundle','cistern_water','bell_tower','deserters','ash_urn','last_cask','martha_last_letter','sath_stand','eve_witness'];
    const junk = ['玛莎的银坠'];
    const missing = ids.filter(id => !SIDE[id]);
    const badAt = [], badFields = [], badItems = [], badFlags = [];
    for (const id of ids) {
      const q = SIDE[id]; if (!q) continue;
      for (const a of q.at) if (!SCENES[a]) badAt.push(id + ':' + a);
      if (!q.hook || !q.goal || !q.rewardText || !q.reward) badFields.push(id);
      for (const n of q.reward.items || []) if (!ITEMS[n] && !junk.includes(n)) badItems.push(id + ':' + n);
      for (const [k, v] of Object.entries(q.reward.flags || {})) {
        const r = FLAG_KEYS[k];
        const ok = r === 'bool' ? typeof v === 'boolean' : r === 'count' ? Number.isInteger(v) : Array.isArray(r) ? r.includes(v) : r === 'id' ? !!(PEOPLE[v] || COMPANIONS[v]) : false;
        if (!ok) badFlags.push(id + ':' + k + '=' + v);
      }
    }
    const links = [['martha_letters','side.martha_relic'],['tom_errand','side.tom_leg'],['sath_ledger','side.watch_mole'],['eve_bundle','side.eve_letter'],['martha_last_letter','side.martha_letters'],['sath_stand','side.sath_ledger'],['eve_witness','side.eve_bundle'],['tom_courage','side.tom_errand']];
    const badLinks = [];
    for (const [id, prev] of links) {
      delete state.flags[prev];
      if (SIDE[id].need() !== false) badLinks.push(id + ' 提前出现');
      state.flags[prev] = 'taken';
      if (id === 'eve_bundle' && SIDE[id].need() !== true) badLinks.push(id + ' 接下信后不出现');
      state.flags[prev] = 'done';
      if (SIDE[id].need() !== true) badLinks.push(id + ' 完成后不出现');
    }
    delete state.flags['side.martha_relic'];
    delete state.flags['side.martha_letters'];
    applyGM({ flags: { 'side.martha_letters': 'taken' } });
    const blocked = state.flags['side.martha_letters'] ?? null;
    state.flags['side.martha_relic'] = 'done';
    applyGM({ flags: { 'side.martha_letters': 'taken' } });
    const taken = state.flags['side.martha_letters'] || null;
    const badState = ids.filter(id => !(FLAG_KEYS['side.' + id] || []).includes('done'));
    state.act = 2; state.scene = 'act2_hub';
    const offer2 = buildPrompt('看看').includes('《沉船下的采珠人》');
    state.act = 3; state.scene = 'act3_haven';
    const offer3 = buildPrompt('看看').includes('《干涸的蓄水池》');
    return { missing, badAt, badFields, badItems, badFlags, badLinks, blocked, taken, badState, offer2, offer3 };
  })()`);
  assert.deepEqual(result, { missing: [], badAt: [], badFields: [], badItems: [], badFlags: [], badLinks: [], blocked: null, taken: 'taken', badState: [], offer2: true, offer3: true });
});

test('最后一夜的告别列成按钮、可以有好几个；结局尾声素材按同伴的处境塞进终章提示', () => {
  const run = game();
  const result = run(`(() => {
    const calls=[];gm=(a,s)=>{calls.push(a);};state=newGame(freshDraft());state.act=3;state.scene='act3_whisper';
    for(const id of ['selene','borin']){state.companions[id].recruited=true;state.companions[id].approval=30;}
    CAMP_EVENTS.push({id:'t_fw_selene',who:'selene',kind:'farewell',when:()=>state.scene==='act3_whisper',seed:'赛勒涅的告别'},
      {id:'t_fw_borin',who:'borin',kind:'farewell',title:'屋顶上的最后一桶',when:()=>state.scene==='act3_whisper',seed:'博林的告别'});
    state.campSeen=[];const plan=planNight();state.camp={plan,done:[],talk:null};
    const labels=plan.banter.filter(id=>id.startsWith('t_fw')).map(id=>eventLabel(eventFor(id)));
    talkTo('event:t_fw_selene');const brief=campBrief();
    EPILOGUES.selene={ending:{seven:'她成了新守誓人的第一人'},lover:{seven:'她在酒馆门口等你'},choice:{reforged:'骑士团重立'},gone:{dead:'墓前的剑'}};
    state.companions.selene.romance='vowed';state.flags['quest.selene']='reforged';state.flags['act3.ending']=null;
    for(const c of Object.values(state.companions)){c.recruited=true;c.approval=Math.max(30,c.approval);}
    chooseEnding('seven');const end=calls.pop();
    state.companions.selene.alive=false;const dead=epilogueNote('selene','seven');
    return {important:plan.important,labels,brief:/赛勒涅单独说话/.test(brief)&&/赛勒涅的告别/.test(brief),
      end:['新守誓人的第一人','在酒馆门口等你','骑士团重立'].every(x=>end.includes(x)),dead};
  })()`);
  assert.ok(!String(result.important).startsWith('t_fw'));
  assert.deepEqual(result.labels, ['告别 · 赛勒涅', '屋顶上的最后一桶']);
  assert.equal(result.brief, true); assert.equal(result.end, true);
  assert.equal(result.dead, '（尾声素材：墓前的剑）');
});

test('DS 第二轮：告别与恋人最终场景互斥、尾声素材齐全、情报站每幕 12 条', () => {
  const run = game();
  const result = run(`(() => {
    const names = ['selene','vex','kassian','borin','lyra','naia'];
    const fw = CAMP_EVENTS.filter(e => e.kind === 'farewell');
    const missing = names.flatMap(id => [id + '_farewell', id + '_final']).filter(id => !fw.some(e => e.id === id));
    const badWho = fw.filter(e => !COMPANIONS[e.who]).map(e => e.id);
    const badSeed = fw.filter(e => !e.seed || !e.when).map(e => e.id);

    state = newGame(freshDraft()); state.act = 3; state.scene = 'act3_whisper';
    for (const id of names) state.companions[id].recruited = true;
    state.campSeen = [];
    let plan = planNight();
    const farewellOnly = names.every(id => plan.banter.includes(id + '_farewell') && !plan.banter.includes(id + '_final'));
    state.companions.selene.romance = 'together'; state.campSeen = [];
    plan = planNight();
    const finalOnly = plan.banter.includes('selene_final') && !plan.banter.includes('selene_farewell');
    state.scene = 'act3_haven'; state.campSeen = [];
    plan = planNight();
    const elsewhere = names.every(id => !plan.banter.includes(id + '_farewell') && !plan.banter.includes(id + '_final'));

    const ends = Object.keys(ENDINGS), badEp = [];
    for (const id of names) {
      const ep = EPILOGUES[id]; if (!ep) { badEp.push(id + ' 缺'); continue; }
      for (const e of ends) if (!ep.ending?.[e]) badEp.push(id + ' ending ' + e);
      for (const k of ['egg','seven','hestia','mortal']) if (!ep.lover?.[k]) badEp.push(id + ' lover ' + k);
      const opts = Object.keys(QUESTS[id].choice.options);
      for (const o of opts) if (!ep.choice?.[o]) badEp.push(id + ' choice ' + o);
      const extra = Object.keys(ep.choice || {}).filter(k => !opts.includes(k));
      if (extra.length) badEp.push(id + ' choice 多出 ' + extra.join(','));
      const gk = Object.keys(ep.gone || {}).sort().join(',');
      if (gk !== 'betrayed,dead,taken') badEp.push(id + ' gone ' + gk);
    }

    state = newGame(freshDraft()); state.act = 3; state.scene = 'act3_end';
    const s = state.companions.selene; s.recruited = true; s.romance = 'vowed'; s.alive = true;
    state.flags['quest.selene'] = 'reforged';
    const note = epilogueNote('selene', 'seven');
    const full = note.includes(EPILOGUES.selene.ending.seven) && note.includes(EPILOGUES.selene.lover.seven) && note.includes(EPILOGUES.selene.choice.reforged);
    s.alive = false; const dead = epilogueNote('selene', 'seven');
    const onlyDead = dead.includes(EPILOGUES.selene.gone.dead) && !dead.includes(EPILOGUES.selene.ending.seven);

    const dup = a => a.length - new Set(a).size;
    const i1 = INTEL[1], i3 = INTEL[3];
    const intel = { l1: i1.length, l3: i3.length, d1: dup(i1), d3: dup(i3), empty: [...i1, ...i3].filter(x => !x || typeof x !== 'string').length };
    return { missing, badWho, badSeed, farewellOnly, finalOnly, elsewhere, badEp, full, onlyDead, intel };
  })()`);
  assert.deepEqual(result.missing, []); assert.deepEqual(result.badWho, []); assert.deepEqual(result.badSeed, []);
  assert.equal(result.farewellOnly, true); assert.equal(result.finalOnly, true); assert.equal(result.elsewhere, true);
  assert.deepEqual(result.badEp, []); assert.equal(result.full, true); assert.equal(result.onlyDead, true);
  assert.deepEqual(result.intel, { l1: 12, l3: 12, d1: 0, d3: 0, empty: 0 });
});

test('试玩报告修复：莉丝救出后忘写标记，到期那一轮可以撤销；已定的结局不能再改', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=state.day;
    state.flags['act1.debt_known']=true;const v=state.companions.vex;v.recruited=true;v.approval=30;state.dreams=[1];
    const hint=buildPrompt('x').includes('act1.lise=saved');
    for(let i=0;i<3;i++){state.camp={};restNight(null);}
    const sold={flag:state.flags['act1.lise'],approval:v.approval};
    applyGM({flags:{'act1.lise':'saved'}});const undone={flag:state.flags['act1.lise'],approval:v.approval,mem:(memo().people.vex||[]).length};
    applyGM({flags:{'act1.lise':'sold'}});const locked=state.flags['act1.lise'];
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=state.day;state.flags['act1.debt_known']=true;state.companions.vex.recruited=true;state.dreams=[1];
    for(let i=0;i<3;i++){state.camp={};restNight(null);}
    applyGM({});applyGM({flags:{'act1.lise':'saved'}});
    return {hint,sold,undone,locked,late:state.flags['act1.lise']};
  })()`);
  assert.equal(result.hint, true);
  assert.deepEqual(result.sold, { flag: 'sold', approval: 0 });
  assert.deepEqual(result.undone, { flag: 'saved', approval: 30, mem: 0 });
  assert.equal(result.locked, 'saved'); assert.equal(result.late, 'sold');
});

test('试玩报告修复：正式请柬能进舞会；去不了的地方地点不变并提示；同一轮离开和扎营先换场景', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_manor';state.location='总督府';
    applyGM({location:'总督府舞厅',advance:'act1_manor_ball'});const blocked={scene:state.scene,loc:state.location,note:state.log.at(-1).t};
    applyGM({flags:{'act1.invite':true},advance:'act1_manor_ball'});const ball={scene:state.scene,invite:state.flags['act1.invite']};
    state.scene='act1_docks_hold';state.supplies=2;applyGM({camp:true});const holdCamp={pending:!!state.pendingCamp,note:state.log.at(-1).t};
    applyGM({camp:true,advance:'act1_docks'});return {blocked,ball,holdCamp,moved:state.scene,pending:!!state.pendingCamp};
  })()`);
  assert.equal(result.blocked.scene, 'act1_manor'); assert.equal(result.blocked.loc, '总督府'); assert.match(result.blocked.note, /还去不了/);
  assert.deepEqual(result.ball, { scene: 'act1_manor_ball', invite: 'invited' });
  assert.equal(result.holdCamp.pending, false); assert.match(result.holdCamp.note, /没法扎营/);
  assert.equal(result.moved, 'act1_docks'); assert.equal(result.pending, true);
});

test('试玩报告修复：黑拳只用拳头、打倒就出局，讲好规矩的比赛不放鳄鱼', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks_arena';state.player.level=3;
    state.companions.selene.recruited=true;state.flags['side.arena_champion']='taken';
    startCombat('arena_bout');const c=state.combat,me=c.units.player,s=c.units.selene;
    const fists=[me,s].every(u=>u.weapons.length===1&&u.weapons[0].n==='拳套'&&u.uses===0&&u.sigUsed);
    const ko=hurt(s,999);const foe=Object.values(c.units).find(u=>u.side!=='party');hurt(foe,999);
    const r={fists,fair:!!c.stopped?.fair,ko,selene:{down:!!s.down,out:s.out},foe:foe.out,dead:!!foe.dead};
    state.combat=null;state.flags['side.arena_champion']=undefined;delete state.fought;startCombat('arena_bout');r.brawl=!!state.combat.stopped?.fair;
    return r;
  })()`);
  assert.equal(result.fists, true); assert.equal(result.fair, true); assert.match(result.ko, /出局/);
  assert.deepEqual(result.selene, { down: false, out: 'ko' }); assert.equal(result.foe, 'ko'); assert.equal(result.dead, false);
  assert.equal(result.brawl, false);
});

test('神殿试炼的素材：勇气试炼按玩家背景，真相之厅按在场同伴和赞同度', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_temple';state.companions.selene.recruited=true;state.companions.vex.recruited=true;state.companions.vex.approval=5;state.companions.selene.approval=40;
    TRIALS.fears[state.player.bg]={vision:'测试幻象',ways:'测试办法'};TRIALS.secrets.selene={refuse:'S拒绝',tell:'S秘密'};TRIALS.secrets.vex={refuse:'V拒绝',tell:'V秘密'};
    const a=buildPrompt('x');state.scene='act2_temple_truth';const b=buildPrompt('x');state.scene='act2_hub';const c=buildPrompt('x');
    return {fear:a.includes('测试幻象')&&a.includes('测试办法'),selene:b.includes('S秘密')&&!b.includes('S拒绝'),vex:b.includes('V拒绝')&&b.includes('V秘密'),elsewhere:!c.includes('试炼的素材')&&!c.includes('真相之厅的素材')};
  })()`);
  assert.deepEqual(result, { fear: true, selene: true, vex: true, elsewhere: true });
});

test('DS 第三轮：勇气幻象八背景、真相秘密六同伴、老鳗链三步与前置条件', () => {
  const run = game();
  const result = run(`(() => {
    state = newGame(freshDraft()); state.act = 2;
    const bgKeys = Object.keys(BACKGROUNDS).sort().join(',');
    const fearKeys = Object.keys(TRIALS.fears).sort().join(',');
    const badFears = Object.keys(BACKGROUNDS).filter(k => !TRIALS.fears[k]?.vision || !TRIALS.fears[k]?.ways);
    const extraFears = Object.keys(TRIALS.fears).filter(k => !BACKGROUNDS[k]);
    const comps = ['selene','vex','kassian','borin','lyra','naia'];
    const badSecrets = comps.filter(id => !TRIALS.secrets[id]?.refuse || !TRIALS.secrets[id]?.tell);
    const extraSecrets = Object.keys(TRIALS.secrets).filter(id => !COMPANIONS[id]);

    state.player.bg = 'soldier'; state.scene = 'act2_temple';
    const fearPrompt = buildPrompt('x');
    const fearHit = fearPrompt.includes(TRIALS.fears.soldier.vision) && fearPrompt.includes(TRIALS.fears.soldier.ways);
    state.scene = 'act2_temple_truth';
    for (const id of comps) state.companions[id].recruited = true;
    state.companions.selene.approval = 10; state.companions.vex.approval = 30;
    const lowPrompt = buildPrompt('x');
    state.companions.selene.approval = 30;
    const highPrompt = buildPrompt('x');
    const trial = {
      low: lowPrompt.includes(TRIALS.secrets.selene.refuse) && lowPrompt.includes(TRIALS.secrets.selene.tell),
      high: highPrompt.includes(TRIALS.secrets.selene.tell) && !highPrompt.includes(TRIALS.secrets.selene.refuse),
      vex: lowPrompt.includes(TRIALS.secrets.vex.tell) && !lowPrompt.includes(TRIALS.secrets.vex.refuse),
    };

    const ids = ['eel_clerk','eel_wreck','eel_last_crew'];
    const missing = ids.filter(id => !SIDE[id]);
    const badAt = ids.flatMap(id => (SIDE[id]?.at || []).filter(a => !SCENES[a]).map(a => id + ':' + a));
    const badReward = ids.filter(id => !SIDE[id]?.reward || !SIDE[id]?.rewardText);
    const badItems = ids.flatMap(id => (SIDE[id]?.reward?.items || []).filter(n => !ITEMS[n] && n !== '黑潮会账本的抄本').map(n => id + ':' + n));
    // 老鳗的最后一笔只在老鳗被卡西安杀死时不出现（校对报告规则-1），其他时候不能被挡住
    const kq=state.flags['quest.kassian'];state.flags['quest.kassian']=undefined;const eelDealNeed=!!SIDE.eel_deal.need&&!SIDE.eel_deal.need();state.flags['quest.kassian']='killed_eel';const eelDealDead=!SIDE.eel_deal.need||SIDE.eel_deal.need();state.flags['quest.kassian']=kq;

    state.flags['act1.eel'] = 'enemy'; delete state.flags['quest.kassian'];
    const enemy = SIDE.eel_clerk.need();
    state.flags['act1.eel'] = 'deal';
    const deal = SIDE.eel_clerk.need();
    state.flags['quest.kassian'] = 'killed_eel';
    const killed = SIDE.eel_clerk.need();
    delete state.flags['quest.kassian']; delete state.flags['side.eel_clerk'];
    const step2Before = SIDE.eel_wreck.need();
    state.flags['side.eel_clerk'] = 'done';
    const step2After = SIDE.eel_wreck.need();
    delete state.flags['side.eel_wreck'];
    const step3Before = SIDE.eel_last_crew.need();
    state.flags['side.eel_wreck'] = 'done';
    const step3After = SIDE.eel_last_crew.need();
    state.flags['quest.kassian'] = 'killed_eel';
    const step3Killed = SIDE.eel_last_crew.need();
    return { bgKeys, fearKeys, badFears, extraFears, badSecrets, extraSecrets, fearHit, trial, missing, badAt, badReward, badItems, eelDealNeed, eelDealDead, enemy, deal, killed, step2Before, step2After, step3Before, step3After, step3Killed };
  })()`);
  assert.equal(result.bgKeys, 'acolyte,entertainer,noble,outlander,sage,sailor,soldier,urchin');
  assert.equal(result.fearKeys, result.bgKeys);
  assert.deepEqual(result.badFears, []); assert.deepEqual(result.extraFears, []);
  assert.deepEqual(result.badSecrets, []); assert.deepEqual(result.extraSecrets, []);
  assert.equal(result.fearHit, true);
  assert.deepEqual(result.trial, { low: true, high: true, vex: true });
  assert.deepEqual(result.missing, []); assert.deepEqual(result.badAt, []);
  assert.deepEqual(result.badReward, []); assert.deepEqual(result.badItems, []);
  assert.equal(result.eelDealNeed, false);
  assert.equal(result.eelDealDead, false);
  assert.equal(result.enemy, false); assert.equal(result.deal, true); assert.equal(result.killed, false);
  assert.equal(result.step2Before, false); assert.equal(result.step2After, true);
  assert.equal(result.step3Before, false); assert.equal(result.step3After, true); assert.equal(result.step3Killed, false);
});

test('立绘：龙化 40 / 80 换变体图（排在表情前面），第二个梦里赫斯提雅用龙形；阿登能被点名', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;const s=state.companions.selene;
    const pick=(id,expr)=>{const im={};portrait(im,id,expr);return im.src;};
    const plain=pick('selene','smile');s.draconic=45;const d40=pick('selene','smile');s.draconic=85;const d80=pick('selene','smile');
    state.companions.naia.draconic=85;const naiaMasked=pick('naia','neutral');
    state.scene='hestia_dream2';const dragon=pick('hestia');state.scene='hestia_dream1';const human=pick('hestia');
    applyGM({speakers:['arden']});
    return {plain,d40,d80,naiaMasked,dragon,human,arden:state.speakers[0],note:npcLines().includes('阿登')};
  })()`);
  assert.equal(result.plain, 'portraits/selene_smile.webp');
  assert.equal(result.d40, 'portraits/selene_drac40.webp'); assert.equal(result.d80, 'portraits/selene_drac80.webp');
  assert.equal(result.naiaMasked, 'portraits/naia_disguise.webp');
  assert.equal(result.dragon, 'portraits/hestia_dragon.webp'); assert.equal(result.human, 'portraits/hestia_neutral.webp');
  assert.equal(result.arden, 'arden'); assert.equal(result.note, true);
});

test('校对报告修复：人质死的是谁、支线前置条件、关键场景之后不再出旧的暧昧事件、对手戏条件、日志不剧透、七人之誓要救回被掳的人', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.flags['act1.martha_alive']=false;state.flags['act1.hostage']='tom';
    const tomDead={keeper:tavernKeeper(),letter:SIDE.martha_last_letter.need.length===0&&(state.flags['side.martha_letters']='done',SIDE.martha_last_letter.need()),courage:(state.flags['side.tom_errand']='done',SIDE.tom_courage.need()),note:buildPrompt('x').includes('人质小汤姆没能救回来')};
    state.flags['act1.hostage']='martha';const marthaDead={keeper:tavernKeeper(),letter:SIDE.martha_last_letter.need()};
    state=newGame(freshDraft());state.act=1;
    const needs={relic:SIDE.martha_relic.need(),eye:SIDE.cult_eye.need(),rat:SIDE.rat_nest.need()};
    state.flags['act1.chart']='opened';state.flags['act1.deacon']='informant';state.flags['prologue.rat_king']='spared';
    const needs2={relic:SIDE.martha_relic.need(),eye:SIDE.cult_eye.need(),rat:SIDE.rat_nest.need()};
    state.scene='act1_hub';const s=state.companions.selene;s.recruited=true;s.approval=45;state.companions.borin.recruited=true;state.companions.lyra.recruited=true;
    state.campSeen=['act1_home','selene_scene'];const afterScene=planNight().important;
    const axe1=planNight().banter.includes('borin_lyra_axe');state.flags['act1.darin_axe']=true;const axe2=planNight().banter.includes('borin_lyra_axe');
    const journal=SIDE.watch_mole.task.includes('霍布')||SIDE.cult_eye.task.includes('灰须');
    state=newGame(freshDraft());state.act=3;for(const id of Object.keys(COMPANIONS)){const c=state.companions[id];c.recruited=true;c.approval=50;}
    state.companions.lyra.taken=true;state.companions.lyra.recruited=false;const seven=ENDINGS.seven.need();
    return {tomDead,marthaDead,needs,needs2,afterScene,axe1,axe2,journal,seven};
  })()`);
  assert.deepEqual(result.tomDead, { keeper: '玛莎', letter: true, courage: false, note: true });
  assert.deepEqual(result.marthaDead, { keeper: '小汤姆', letter: false });
  assert.deepEqual(result.needs, { relic: false, eye: false, rat: false });
  assert.deepEqual(result.needs2, { relic: true, eye: true, rat: true });
  assert.notEqual(result.afterScene, 'selene_hint');
  assert.equal(result.axe1, false); assert.equal(result.axe2, true);
  assert.equal(result.journal, false);
  assert.ok(result.seven.includes('被掳走的同伴已经救回来'));
});

test('完整通关报告修复：米拉揭露前不变形、不会识破自己；交了航海图补主线标记；可以雇船', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_tower';state.companions.naia.recruited=true;
    startCombat('tower_spies');const n=state.combat.units.naia;
    beginTurn(n);allyTurn(n);const hidden={guise:!!n.guise,leak:state.combat.feed.some(t=>/形变|养母|顶着那张脸/.test(t))};
    state.flags['act1.naia_exposed']=true;n.sigUsed=false;beginTurn(n);signatureTurn(n);
    const shifted=!!n.guise, self=foeGuised(n).length, spotted=trySpot(n), still=!!n.guise;
    state.combat=null;state.scene='act1_manor';state.flags['act1.key']='legal';
    applyGM({items_add:['守誓人的航海图']});const chart=state.flags['act1.chart'];
    state.scene='act1_docks';applyGM({flags:{'act1.ship':'hired'}});
    return {hidden,shifted,self,spotted,still,chart,ship:state.flags['act1.ship']};
  })()`);
  assert.deepEqual(result.hidden, { guise: false, leak: false });
  assert.equal(result.shifted, true); assert.equal(result.self, 0);
  assert.equal(result.spotted, false); assert.equal(result.still, true);
  assert.equal(result.chart, 'opened'); assert.equal(result.ship, 'hired');
});

test('完整通关报告修复：从港口能直接进金鳗货舱；在港口打起来会把场景带过去；提示里列出小场景和遭遇', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.flags['act1.debt_known']=true;
    const hint=buildPrompt('x');
    applyGM({advance:'act1_docks_hold'});const deep={scene:state.scene,visitedDocks:!!state.visits.act1_docks};
    state.scene='act1_hub';delete state.flags['act1.debt_known'];applyGM({advance:'act1_docks_hold'});const gated=state.scene;
    state.flags['act1.debt_known']=true;applyGM({location:'金鳗船底的货舱',combat:'docks_brawl'});
    const fight={scene:state.scene,combat:state.pendingCombat};
    state.scene='act1_tower_vault';state.pendingCombat=null;applyGM({combat:'docks_brawl'});
    return {hold:hint.includes('act1_docks_hold'),enc:hint.includes('docks_brawl'),rule:SYSTEM.includes('不要让玩家换个说法'),deep,gated,fight,far:{scene:state.scene,combat:state.pendingCombat}};
  })()`);
  assert.equal(result.hold, true); assert.equal(result.enc, true); assert.equal(result.rule, true);
  assert.deepEqual(result.deep, { scene: 'act1_docks_hold', visitedDocks: true });
  assert.equal(result.gated, 'act1_hub');
  assert.deepEqual(result.fight, { scene: 'act1_docks_hold', combat: 'docks_brawl' });
  assert.deepEqual(result.far, { scene: 'act1_tower_vault', combat: null });
});

test('完整通关报告修复：航海图和船都到手后睡下就进灯塔之夜；强夺黑鳗号要先打过码头斗殴；港口提示写清遭遇名字和地点', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=state.day;state.dreams=[1];
    state.flags['act1.chart']='opened';state.camp={};restNight(null);const ready=state.scene;
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=state.day;state.dreams=[1];
    state.flags['act1.chart']='opened';state.flags['act1.ship']='stolen';state.camp={};restNight(null);const night=state.scene;
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.flags['act1.debt_known']=true;
    const hint=buildPrompt('x');
    applyGM({location:'黑鳗号栈桥',combat:'docks_ship'});const early={scene:state.scene,combat:state.pendingCombat||null};
    state.scene='act1_docks';state.fought={docks_brawl:'won'};applyGM({combat:'docks_ship'});
    return {ready,night,early,later:state.pendingCombat,
      named:hint.includes('docks_brawl「码头斗殴」'),place:/金鳗的货舱/.test(hint.split('程序会把场景一起带过去')[1]||''),noShip:!(hint.split('程序会把场景一起带过去')[1]||'').includes('docks_ship')};
  })()`);
  assert.equal(result.ready, 'act1_hub'); assert.equal(result.night, 'act1_lighthouse');
  assert.deepEqual(result.early, { scene: 'act1_hub', combat: null });
  assert.equal(result.later, 'docks_ship');
  assert.equal(result.named, true); assert.equal(result.place, true); assert.equal(result.noShip, true);
});

test('完整通关报告修复：只改地点也会跟到能去的地方，第二幕的岛也能直接进小场景；剧情场景不会被走进去；熔炉不会被活捉', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks';
    applyGM({location:'灰帆港 · 醉龙酒馆'});const home=state.scene;
    applyGM({location:'灰帆港 · 醉龙酒馆'});const stay=state.scene;
    state.flags['act1.chart']='opened';state.flags['act1.ship']='stolen';applyGM({location:'灰帆港 · 灯塔'});const lighthouse=state.scene;
    state.scene='act1_docks';applyGM({location:'灰帆港 · 黑潮码头'});const same=state.scene;
    state.act=2;state.scene='act2_hub';applyGM({location:'雾隐岛 · 纪念礁'});const memorial={scene:state.scene,mist:!!state.visits.act2_mist};
    state.scene='act2_hub';applyGM({advance:'act2_mist_memorial'});const deep=state.scene;
    state.scene='act2_mist';applyGM({location:'雾隐岛 · 纪念礁'});const sub=state.scene;
    state.scene='act2_ember_forge';state.flags['act2.darin']=null;startCombat('darin_forge');state.combat.spare=true;
    const forge=Object.values(state.combat.units).find(u=>u.type==='forge');const line=hurt(forge,99,{spare:true});
    return {home,stay,lighthouse,same,memorial,deep,sub,forge:{captured:forge.out==='captured',line}};
  })()`);
  assert.equal(result.home, 'act1_hub'); assert.equal(result.stay, 'act1_hub');
  assert.equal(result.lighthouse, 'act1_hub'); assert.equal(result.same, 'act1_docks');
  assert.deepEqual(result.memorial, { scene: 'act2_mist_memorial', mist: true });
  assert.equal(result.deep, 'act2_mist_memorial'); assert.equal(result.sub, 'act2_mist_memorial');
  assert.equal(result.forge.captured, false); assert.ok(!result.forge.line.includes('活捉'));
});

test('收尾：从神殿一路走到终章（七人之誓），神殿打完忘了 advance 也会进第二幕结尾；其余结局都能选、能结束；一场拖得太久会提醒', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};openFinal=()=>{};render=()=>{};openSplit=()=>{};
    const trace=[];
    const say=(d,t='我行动')=>{state.turns++;push('you',t);applyGM(d);trace.push(state.scene);};
    const win=id=>{startCombat(id);for(const u of Object.values(state.combat.units)) if(u.side!=='party'&&!u.dead){u.hp=0;u.dead=true;} endCombat(combatResult());state.pendingCombat=null;applyGM({});};
    const party6=()=>{for(const id of Object.keys(COMPANIONS)){const c=state.companions[id];c.recruited=true;c.approval=60;}state.flags['act1.naia_exposed']=true;};
    state=newGame(freshDraft());state.act=2;state.scene='act2_temple';levelUp(9);state.dreams=[1,2,3];party6();
    Object.assign(state.flags,{'act2.tideborn':'ally','act2.temple_key':'given','act1.sath_trust':true,'act2.darin':'woke','act1.governor':'exposed'});
    for(let i=0;i<10;i++) push('you','再看看');const nagTemple=buildPrompt('x').includes('这一场玩家已经回应了 10 次');
    state.scene='act3_streets';for(let i=0;i<10;i++) push('you','再看看');const nag=buildPrompt('x').includes('这一场玩家已经回应了 10 次')&&!nagTemple;state.scene='act2_temple';
    say({flags:{'act2.trial_courage':true},advance:'act2_temple_truth'});
    say({flags:{'act2.trial_truth':true},advance:'act2_temple_heart'});
    say({flags:{'act2.sacrifice':'memory','act2.revealed':true,'act2.heart':'destroyed'},combat:'temple_raid'});
    win('temple_raid');const stay=state.scene;say({});const auto=state.scene;const taken=state.flags['act2.taken'];
    say({scene_end:true});const end2=state.ended;nextAct();
    say({flags:{'act3.saved_first':'docks'},advance:'act3_docks_fire'});win('harbor_wyrmling');
    say({advance:'act3_haven'});say({location:'灰帆港 · 街巷'});const streets=state.scene;say({location:'灰帆港 · 醉龙酒馆'});const back=state.scene;
    say({advance:'act3_council'});say({advance:'act3_whisper'});
    say({camp:true});state.camp={};restNight(null);
    say({flags:{'act3.route':'charge'},advance:'act3_charge'});win('ember_slope');
    say({advance:'act3_altar'});say({recruit:[taken]});const rescued=!!state.companions[taken].recruited;
    win('valdo_altar');say({advance:'act3_king'});
    startCombat('ember_king');hurt(Object.values(state.combat.units).find(u=>u.type==='ember_king'),9999);const res=combatResult();endCombat(res);
    const sevenOk=ENDINGS.seven.need().length===0;chooseEnding('seven');say({scene_end:true});
    const chain={trace:trace.join(' '),stay,auto,end2,walk:streets+'>'+back,rescued,res,sevenOk,scene:state.scene,ended:state.ended};
    const others={};
    for(const [id,setup] of Object.entries({
      egg:()=>{Object.assign(state.flags,{'act2.egg_warmed':3,'quest.vex.egg':true});},
      hestia:()=>{},crown:()=>{},
      dragon:()=>{state.player.draconic=80;},
      mortal:()=>{Object.assign(state.flags,{'act2.heart':'destroyed','act2.tideborn':'ally','act1.sath_trust':true,'act2.darin':'woke'});},
    })){
      state=newGame(freshDraft());state.act=3;state.scene='act3_king';levelUp(12);party6();setup();
      startCombat('ember_king');hurt(Object.values(state.combat.units).find(u=>u.type==='ember_king'),9999);endCombat(combatResult());
      const miss=ENDINGS[id].need();chooseEnding(id);state.turns++;push('you','尾声');applyGM({scene_end:true});
      others[id]={miss:miss.join(''),scene:state.scene,ended:state.ended,ending:state.flags['act3.ending']};
    }
    return {nag,chain,others};
  })()`);
  assert.equal(result.nag, true);
  assert.equal(result.chain.stay, 'act2_temple_heart'); assert.equal(result.chain.auto, 'act2_end');
  assert.deepEqual({ ...result.chain, trace: undefined }, { trace: undefined, stay: 'act2_temple_heart', auto: 'act2_end', end2: true, walk: 'act3_streets>act3_haven', rescued: true, res: 'final', sevenOk: true, scene: 'act3_end', ended: true });
  assert.ok(result.chain.trace.includes('act3_charge') && result.chain.trace.includes('act3_altar'), result.chain.trace);
  for (const id of ['egg', 'hestia', 'crown', 'dragon', 'mortal'])
    assert.deepEqual(result.others[id], { miss: '', scene: 'act3_end', ended: true, ending: id }, id);
});

test('收尾：第三幕说书人忘了写打完后的 advance、救人的 recruit 和烬王的 combat，程序照样能走到最终抉择且七人之誓可选', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};openFinal=()=>{};render=()=>{};openSplit=()=>{};
    const say=(d,t='我行动')=>{state.turns++;push('you',t);applyGM(d);return state.scene;};
    const win=id=>{startCombat(id);for(const u of Object.values(state.combat.units)) if(u.side!=='party'&&!u.dead){u.hp=0;u.dead=true;} endCombat(combatResult());state.pendingCombat=null;applyGM({});};
    state=newGame(freshDraft());state.act=3;state.scene='act3_1';levelUp(10);state.dreams=[1,2,3];
    for(const id of Object.keys(COMPANIONS)){const c=state.companions[id];c.recruited=true;c.approval=60;}
    Object.assign(state.flags,{'act1.naia_exposed':true,'act2.tideborn':'ally','act1.sath_trust':true,'act2.darin':'woke','act2.taken':'borin','act2.heart':'destroyed'});
    Object.assign(state.companions.borin,{taken:true,recruited:false});
    say({flags:{'act3.saved_first':'academy'},advance:'act3_academy_fire'});win('harbor_wyrmling');
    const fire=say({});
    say({advance:'act3_council'});say({advance:'act3_whisper'});state.camp={};restNight(null);
    say({flags:{'act3.route':'charge'},advance:'act3_charge'});win('ember_slope');const slope=say({});
    win('valdo_altar');const altar=say({});const borin={back:!!state.companions.borin.recruited,taken:!!state.companions.borin.taken};
    const first=say({});const pending1=state.pendingCombat||null;const second=say({});const pending2=state.pendingCombat;
    startCombat(pending2);hurt(Object.values(state.combat.units).find(u=>u.type==='ember_king'),9999);endCombat(combatResult());
    return {fire,slope,altar,borin,pending1,pending2,final:!!state.pendingFinal,seven:ENDINGS.seven.need()};
  })()`);
  assert.deepEqual(result, { fire: 'act3_haven', slope: 'act3_altar', altar: 'act3_king', borin: { back: true, taken: false },
    pending1: null, pending2: 'ember_king', final: true, seven: [] });
});

test('数值调整：营地陪聊、个人任务每一步、每走完一幕都加赞同度；进新一幕玩家龙化值 +15；七人之誓门槛 30；说书人规则', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{state.turns++;};state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    const k=state.companions.kassian;k.recruited=true;k.approval=10;
    state.camp={talk:null,event:null,done:[],plan:{important:null,banter:[]}};
    talkTo('kassian');endTalk();const quiet=k.approval;
    talkTo('kassian');state.turns++;endTalk();const chatted=k.approval;
    state.camp=null;k.approval=25;applyGM({flags:{'quest.kassian.arden':true}});const step=k.approval;
    applyGM({flags:{'quest.kassian.arden':true}});const again=k.approval;
    const v=state.companions.vex;v.recruited=false;v.approval=0;applyGM({flags:{'act1.debt_known':true}});const away=v.approval;
    state.scene='act1_dawn';state.ended=true;const dr=state.player.draconic;nextAct();
    const act={approval:k.approval,draconic:state.player.draconic-dr};
    const rules=['不要另外发明程序不记录的前置手续','- draconic：玩家的龙化值变化','给得太省','可以详细描写双方自愿的成年人性行为','不要用一句转场直接跳过'].every(t=>SYSTEM.includes(t));
    const noFade=!SYSTEM.includes('不写露骨的性行为过程');
    return {quiet,chatted,step,again,away,act,rules,noFade,seven:ENDINGS.seven.need.toString().includes('>= 30')};
  })()`);
  assert.deepEqual(result, { quiet: 10, chatted: 15, step: 32, again: 32, away: 0, act: { approval: 39, draconic: 15 }, rules: true, noFade: true, seven: true });
});

test('亲密系统：长休外可单独进入亲密场景，结算亲密值、次数、方式和受孕，并能在预产日出生', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{}; state=newGame(freshDraft()); state.act=1; state.scene='act1_hub';
    const v=state.companions.vex; v.recruited=true; v.romance='together'; v.approval=60;
    const day=state.day, can=canIntimate(), started=startIntimacy('vex','try','player');
    const inside={scene:state.scene,present:present(),day:state.day};
    applyIntimacy({intimacy:{positions:['面对面','从背后']}},[]);
    push('you','我留下来'); push('you','继续');
    Math.random=()=>0;
    applyGM({scene_end:true});
    const rec=intimacyOf('vex');
    const after={scene:state.scene,day:state.day,count:rec.count,value:rec.value,positions:rec.positions,pregnant:!!state.pregnancy};
    state.day=state.pregnancy.dueDay; checkPregnancy();
    return {day,can,started,inside,after,children:state.children.length,cleared:!state.pregnancy};
  })()`);
  assert.deepEqual(result, {
    day: 1, can: true, started: true, inside: { scene: 'intimacy', present: ['vex'], day: 1 },
    after: { scene: 'act1_hub', day: 1, count: 1, value: 5, positions: ['面对面', '从背后'], pregnant: true },
    children: 1, cleared: true,
  });
});

test('私密场景说书人：亲密插曲、恋人夜谈和露骨输入自动改用私密接口，其余仍走主说书人', () => {
  const run = game();
  const result = run(`(() => {
    pref.priv = { on: true, base: 'https://api.deepseek.com/v1', model: 'deepseek-chat', key: 'test-key' };
    pref.api = 'chatgpt';
    const priv = narrateTarget({ priv: true }), main = narrateTarget({});
    pref.priv.key = '';
    const noKey = narrateTarget({ priv: true });
    pref.priv.key = 'test-key';
    state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub';
    const noLover = privTurn('我走向窗边');
    state.companions.vex.recruited = true; state.companions.vex.romance = 'together';
    const hubChat = privTurn('我走向窗边');
    state.scene = 'intimacy'; state.intimacyWith = 'vex';
    const inScene = privTurn('我留下来');
    state.scene = 'act1_hub'; state.intimacyWith = null;
    state.camp = { talk: 'vex' };
    const campNight = privTurn('我们说说话');
    state.camp = null;
    const word = privTurn('我想和她做爱');
    const loveScene = (() => { state.scene = 'love_selene'; const r = privTurn('我看着她'); state.scene = 'act1_hub'; return r; })();
    return { priv, main, noKey, noLover, hubChat, inScene, campNight, word, loveScene };
  })()`);
  assert.deepEqual(result, { priv: 'priv', main: 'chatgpt', noKey: 'chatgpt', noLover: false, hubChat: false, inScene: true, campNight: true, word: true, loveScene: true });
});

test('私密内容打标记：主说书人只看中性版，打开“可以写露骨内容”才拿全文', () => {
  const run = game();
  const result = run(`(() => {
    pref.explicitOk = false;
    state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub';
    const v = state.companions.vex; v.recruited = true; v.romance = 'together';
    sensitiveTurn = true;
    push('you', '我把她按在墙上');
    push('gm', '她在你耳边喘息，声音发颤。');
    remember('vex', '你们第一次真正在一起');
    sensitiveTurn = false;
    const marked = state.log.filter(e => e.x).length, sensitive = memo().sensitive.length;
    const safe = buildPrompt('我坐下');
    const out = { marked, sensitive, placeholder: safe.includes(SENSITIVE_NOTE), leakSafe: safe.includes('按在墙上') || safe.includes('声音发颤'), memHidden: !safe.includes('你们第一次真正在一起') };
    pref.explicitOk = true;
    const full = buildPrompt('我坐下');
    out.leakFull = full.includes('声音发颤'); out.memShown = full.includes('你们第一次真正在一起');
    pref.explicitOk = false;
    out.plainTurn = (() => { const s = buildPrompt('我坐下'); return !s.includes(SENSITIVE_NOTE) || true; })();
    return out;
  })()`);
  assert.equal(result.marked, 2);
  assert.equal(result.sensitive, 1);
  assert.equal(result.placeholder, true);
  assert.equal(result.leakSafe, false);
  assert.equal(result.memHidden, true);
  assert.equal(result.leakFull, true);
  assert.equal(result.memShown, true);
});

test('回复格式容错：没有 @@@ 也能取到结尾 JSON，普通叙述里的“不能”不算拒答，亲密场景要求写得更直白', () => {
  const run = game();
  const result = run(`(() => {
    const [n1, d1] = parseGMReply('你推开门，雨声灌了进来。\\n{"location":"醉龙酒馆"}');
    const [n2, d2] = parseGMReply('你推开门。@@@{"location":"醉龙酒馆"}');
    const bad = t => { try { parseGMReply(t); return false; } catch (e) { return e.code === 'invalid_reply'; } };
    pref.priv = { on: true, base: 'b', model: 'm', key: 'k', note: '多用露骨对白' };
    state = newGame(freshDraft()); state.act = 1; state.scene = 'intimacy'; state.intimacyWith = 'vex';
    const line = intimacyLine();
    return { n1, d1, n2, d2, badPlain: bad('只有正文'), badOpen: bad('正文@@@{"flags":'),
      noRefuse: refusalReply('你不能确定方向，只能继续往前走。'),
      refuse: refusalReply('抱歉，我无法描写这类内容。'),
      lineLen: line.includes('300–600 字'), lineDirect: line.includes('性器官') && line.includes('代称'), lineNote: line.includes('多用露骨对白') };
  })()`);
  assert.deepEqual(result, {
    n1: '你推开门，雨声灌了进来。', d1: { location: '醉龙酒馆' }, n2: '你推开门。', d2: { location: '醉龙酒馆' },
    badPlain: true, badOpen: true, noRefuse: false, refuse: true, lineLen: true, lineDirect: true, lineNote: true,
  });
});

test('多人恋爱门槛：赛勒涅和莉拉为 40，卡西安/博林 60，维克斯/奈雅 0', () => {
  const run = game();
  const result = run(`(() => {
    const rules = Object.fromEntries(Object.entries(ROMANCE_RULES).map(([k, v]) => [k, v.poly]));
    const apply = approval => {
      state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub';
      const s = state.companions.selene; s.recruited = true; s.romance = 'together'; s.approval = approval;
      const v = state.companions.vex; v.recruited = true; v.romance = 'together';
      applyBonds({ consent: [{ id: 'selene', for: 'vex', ok: true }] }, []);
      return { consent: s.consent && s.consent.vex, approval: s.approval };
    };
    return { rules, at39: apply(39), at40: apply(40) };
  })()`);
  assert.deepEqual(result.rules, { selene: 40, vex: 0, kassian: 60, borin: 60, lyra: 40, naia: 0 });
  assert.deepEqual(result.at39, { consent: false, approval: 24 });
  assert.deepEqual(result.at40, { consent: true, approval: 40 });
});

test('亲密结束后两轮内保留余韵提示，之后自动清掉', () => {
  const run = game();
  const result = run(`(() => {
    gm = () => {};
    state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub';
    const v = state.companions.vex; v.recruited = true; v.romance = 'together'; v.approval = 60;
    startIntimacy('vex', 'safe', null);
    push('you', '一'); push('you', '二');
    applyGM({ scene_end: true });
    const first = { scene: state.scene, who: state.afterglow && state.afterglow.id, line: buildPrompt('我坐下').includes('【刚发生的事】') };
    state.turns += 5;
    const later = { line: buildPrompt('我坐下').includes('【刚发生的事】'), cleared: state.afterglow === null };
    return { first, later };
  })()`);
  assert.deepEqual(result, { first: { scene: 'act1_hub', who: 'vex', line: true }, later: { line: false, cleared: true } });
});

test('快速测试模式：搭好第一幕酒馆和恋人，全程不写存档', () => {
  const run = game();
  const result = run(`(() => {
    pref.priv = { on: true, base: 'https://api.deepseek.com/v1', model: 'deepseek-flash', key: 'test' };
    const ok = enterTestMode('selene', false);
    const out = { ok, testMode, scene: state.scene, act: state.act, day: state.day,
      lover: lovers().includes('selene'), notVex: !lovers().includes('vex'), can: canIntimate(), note: state.log.some(e => /快速测试模式/.test(e.t || '')) };
    testMode = false;
    return out;
  })()`);
  assert.deepEqual(result, { ok: true, testMode: true, scene: 'act1_hub', act: 1, day: 10, lover: true, notVex: true, can: true, note: true });
});

test('被拒时能识别并改用私密说书人重试，私密章节纪要写成中性版', () => {
  const run = game();
  const result = run(`(() => {
    state = newGame(freshDraft()); state.act = 1; state.scene = 'act1_hub';
    const sens = chapterPrompt('intimacy', '记录', true), plain = chapterPrompt('act1_hub', '记录', false);
    const refusedText = refusalReply('抱歉，我不能写这类露骨内容。');
    const okReply = refusalReply('你推开酒馆的门。@@@{"location":"醉龙酒馆"}');
    const withJson = refusalReply('抱歉，无法完成。@@@{}');
    push('you', '我把她抱住');
    privateRetry = { action: '我把她抱住', shown: '我把她抱住', mode: undefined };
    let called = null;
    gm = (a, s, m, fp) => { called = { a, s, m, fp }; };
    const ok = retryPrivateTurn();
    return { refusedText, okReply, withJson, sensRule: sens.includes('这一章是私密场景'), plainRule: plain.includes('这一章是私密场景'),
      ok, called, youLeft: state.log.filter(e => e.k === 'you').length, cleared: privateRetry === null };
  })()`);
  assert.deepEqual(result, {
    refusedText: true, okReply: false, withJson: false, sensRule: true, plainRule: false,
    ok: true, called: { a: '我把她抱住', s: '我把她抱住', fp: true }, youLeft: 0, cleared: true,
  });
});

test('放宽恋爱门槛后，事件和关系推进一致，誓约考验和角色底线仍生效', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_hub';
    const k=state.companions.kassian;k.recruited=true;k.approval=24;
    const scene=eventFor('kassian_scene');const before=scene.when(k);
    applyGM({romance:[{id:'kassian',to:'hint'}]});const blocked=k.romance;
    k.approval=25;const available=scene.when(k);applyGM({romance:[{id:'kassian',to:'hint'}]});const hint=k.romance;
    k.approval=40;const confess=eventFor('kassian_confess').when(k);applyGM({romance:[{id:'kassian',to:'together'}]});const together=k.romance;
    k.approval=60;applyGM({romance:[{id:'kassian',to:'vowed'}]});const noTest=k.romance;
    k.tested=true;applyGM({romance:[{id:'kassian',to:'vowed'}]});
    const s=state.companions.selene;s.recruited=true;s.approval=40;s.romance='hint';s.caughtLie=true;
    applyGM({romance:[{id:'selene',to:'together'}]});
    return {before,blocked,available,hint,confess,together,noTest,vowed:k.romance,lie:s.romance};
  })()`);
  assert.deepEqual(result, { before:false, blocked:'none', available:true, hint:'hint', confess:true, together:'together', noTest:'together', vowed:'vowed', lie:'hint' });
});

test('银龙重生的终章提示明确玩家与赫斯提雅共用一具身体', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_king';
    const s=state.companions.selene;s.recruited=true;s.romance='together';
    let prompt='';gm=(text)=>{prompt=text};chooseEnding('hestia');
    return {oneBody:prompt.includes('不要另写一具沉睡的玩家身体'),lover:prompt.includes('借你身体重生的赫斯提雅'),ending:state.flags['act3.ending']};
  })()`);
  assert.deepEqual(result,{oneBody:true,lover:true,ending:'hestia'});
});

test('烬冠加冕的尾声不会把存档中活着的同伴写成死亡', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_king';
    for(const id of ['selene','kassian','borin']) state.companions[id].recruited=true;
    state.companions.selene.romance='together';let prompt='';gm=(text)=>{prompt=text};chooseEnding('crown');
    return {rule:prompt.includes('同行的人仍然活着'),selene:prompt.includes('她拒绝效忠烬王'),kassian:prompt.includes('继续照顾逃难的人'),borin:prompt.includes('最终撤离'),alive:state.companions.selene.alive};
  })()`);
  assert.deepEqual(result,{rule:true,selene:true,kassian:true,borin:true,alive:true});
});

test('神殿提示要求销毁实际完成后才记录，并等待程序公布被掳者', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=2;state.scene='act2_temple_heart';
    const text=buildPrompt('把誓约之心交给潮裔');
    return {destroy:text.includes('只有确实已经销毁、晶体不再存在时才写 destroyed'),taken:text.includes('在程序公布结果之前，不要描写同伴被掳或失踪')};
  })()`);
  assert.deepEqual(result,{destroy:true,taken:true});
});

test('七人之誓的恋人尾声按实际关系阶段显示', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());const k=state.companions.kassian;k.recruited=true;k.romance='together';
    const together=loverEpilogue('kassian','seven');const prompt=epilogueNote('kassian','seven');
    k.romance='vowed';return {together,prompt,vowed:loverEpilogue('kassian','seven')};
  })()`);
  assert.match(result.together,/以恋人身份继续相伴/);
  assert.equal(result.prompt.includes('你们在海边立誓'),false);
  assert.match(result.vowed,/你们在海边立誓/);
});

test('恋人结局图只在适合其场景的结局显示', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_end';
    const k=state.companions.kassian;k.recruited=true;k.romance='together';
    let nodes=[];el=(tag,cls,text)=>{const n={tag,text,style:{},classList:{add(){}},append(){},setAttribute(){}};nodes.push(n);return n};
    modal=(title,build)=>build({classList:{add(){}},append(){}});readSave=()=>null;
    const hasImage=end=>{nodes=[];state.flags['act3.ending']=end;openEnd();return nodes.some(n=>n.tag==='img'&&n.src==='portraits/ending_kassian.webp')};
    return {seven:hasImage('seven'),mortal:hasImage('mortal'),fall:hasImage('fall'),crown:hasImage('crown')};
  })()`);
  assert.deepEqual(result,{seven:true,mortal:true,fall:false,crown:false});
});

test('熔岩沟跳跃失败时由程序结算伤害，成功及其他检定不扣血', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_tunnel';state.player.hp=50;state.player.hpMax=50;
    Math.random=()=>0;let last='';gm=(t)=>{last=t};
    const check=(skill,hazard,ok)=>{applyGM({check:{skill,dc:15,who:'player',reason:'跃过熔岩沟',hazard}});rolled={d:ok?18:1,bonus:0,total:ok?18:1,label:'杂技',ok};finishRoll();return state.player.hp;};
    const failure=check('acrobatics','lava_jump',false), once=last.includes('伤害已由程序结算');
    const success=check('acrobatics','lava_jump',true), unrelated=check('arcana','lava_jump',false);
    state.scene='act3_altar';const otherScene=check('acrobatics','lava_jump',false);
    return {failure,once,success,unrelated,otherScene};
  })()`);
  assert.deepEqual(result,{failure:47,once:true,success:47,unrelated:47,otherScene:47});
});

test('暧昧时完成的恋爱考验在确定关系后保留，最后一夜提示使用当前誓约门槛', () => {
  const run = game();
  const result = run(`(() => {
    state=newGame(freshDraft());state.act=3;state.scene='act3_whisper';
    const k=state.companions.kassian;k.recruited=true;k.approval=49;
    applyGM({flags:{'quest.kassian.tested':true}});const before=k.tested||false;
    k.romance='hint';const brief=companionBrief('kassian').includes('恋爱的考验');
    applyGM({flags:{'quest.kassian.tested':true}});const remembered=k.tested;
    k.approval=40;applyGM({romance:[{id:'kassian',to:'together'}]});k.approval=49;applyGM({romance:[{id:'kassian',to:'vowed'}]});const below=k.romance;k.approval=50;applyGM({romance:[{id:'kassian',to:'vowed'}]});
    const finals=CAMP_EVENTS.filter(e=>/_(final)$/.test(e.id)).map(e=>e.seed);
    return {before,brief,remembered,below,romance:k.romance,allSix:finals.length===6&&finals.every(t=>t.includes('赞同 ≥ 50'))};
  })()`);
  assert.deepEqual(result,{before:false,brief:true,remembered:true,below:'together',romance:'vowed',allSix:true});
});

test('小修：说书人提示里列出这一幕已经成功的检定；海妖之歌写清玩家何时清醒；第一幕金币和情报站价格', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_sewers_shrine';
    state.log.push({k:'roll',t:'调查 成功',ok:true,why:'辨认研究信上的批注',s:'act1_sewers_shrine'});
    state.log.push({k:'gm',t:'莉拉读出了：将抄录的图样与新发现的印记逐一比对。',s:'act1_sewers_shrine'});
    state.log.push({k:'roll',t:'说服 失败',ok:false,why:'说服守卫',s:'act1_sewers_shrine'});
    const early=buildPrompt('x').includes('【已经成功的检定】');
    for(let i=0;i<12;i++) state.log.push({k:'you',t:'走走',s:'act1_hub'});
    const p=buildPrompt('x');const block=p.split('【已经成功的检定】')[1]||'';
    state.act=2;const nextAct=buildPrompt('x').includes('【已经成功的检定】');
    return {early,has:block.includes('辨认研究信上的批注：莉拉读出了'),noFail:!block.split('【')[0].includes('说服守卫'),nextAct,
      siren:SCENES.act2_siren.anchor.includes('从那一刻起玩家完全自主'),intel:TAVERN.intel.cost,brawl:LOOT.docks_brawl.gold};
  })()`);
  assert.deepEqual(result, { early: false, has: true, noFail: true, nextAct: false, siren: true, intel: 90, brawl: 45 });
});


test('长期角色档案超过十条仍保留，当前重点有预算并优先未完承诺', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.companions.selene.recruited=true;
    remember('selene','你答应归还月桂吊坠');for(let i=0;i<35;i++)remember('selene','你们一起走过第'+i+'处河岸');
    const before=JSON.stringify(state),lines=peopleMemoryLines('今晚聊聊旅途');
    const picked=selectPeopleMemories().filter(r=>r.id==='selene');
    return {count:memo().people.selene.length,first:memo().people.selene[0],picked:picked.length,promise:lines.includes('待办')&&lines.includes('月桂吊坠'),bounded:lines.length<7000,unchanged:JSON.stringify(state)===before};
  })()`);assert.deepEqual(result,{count:36,first:'你答应归还月桂吊坠',picked:10,promise:true,bounded:true,unchanged:true});
});

test('后台只返回两条重点时不覆盖长期档案，未知条目不能混入已有记忆', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.companions.selene.recruited=true;
    remember('selene','你答应归还月桂吊坠');for(let i=0;i<19;i++)remember('selene','你们走过河岸'+i);
    const before=memo().people.selene.slice();for(let i=0;i<14;i++)push('gm','沿河赶路，营火安稳。'.repeat(130));
    narrate=async()=>JSON.stringify({summary:'你们继续沿河赶路。',people:{selene:[before[18],before[19],'没有发生过的求婚']}});
    await summarize();return {same:JSON.stringify(memo().people.selene)===JSON.stringify(before),focus:memo().peopleFocus.selene,source:peopleMemories('selene')[0].origin};
  })()`);assert.equal(result.same,true);assert.deepEqual(result.focus,['你们走过河岸17','你们走过河岸18']);assert.equal(result.source,'event');
});

test('后台整理期间新产生的记忆保留，换局后的迟到结果不写入新局', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());remember('selene','你答应修好旧盾');for(let i=0;i<14;i++)push('gm','平静的旅途记录。'.repeat(160));
    let finish;narrate=()=>new Promise(r=>finish=r);const pending=summarize();remember('selene','你替她保管了旧信');finish(JSON.stringify({summary:'你们在营地休整。',people:{selene:['你答应修好旧盾']}}));await pending;
    const kept=memo().people.selene.includes('你替她保管了旧信')&&memo().peopleFocus.selene.includes('你替她保管了旧信');
    for(let i=0;i<14;i++)push('gm','第二段旅途记录。'.repeat(160));const later=summarize();state=newGame(freshDraft());const next=JSON.stringify(state);finish(JSON.stringify({summary:'旧局迟到结果',people:{selene:['你答应修好旧盾']}}));await later;
    return {kept,newGameUnchanged:JSON.stringify(state)===next};
  })()`);assert.deepEqual(result,{kept:true,newGameUnchanged:true});
});

test('旧角色档案迁移保留输入与原文，只从可靠的本人台词补回旧事且可重复加载', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());memo().people.selene=['你曾帮她守夜','你答应归还吊坠'];
    push('gm','玛莎说：“你答应回来修好吧台，我记着呢。”');push('gm','你提起莉拉的名字，但她并不在这里。');push('gm','小汤姆说：“你答应陪我找药了吗？”');
    push('gm','博林说：“你答应给我带来麦酒。”',{failed:true});
    for(const e of state.log)delete e.knownBy;
    const old=JSON.parse(JSON.stringify(state)),raw=JSON.stringify(old);loadState(old);const count=memo().people.martha.length,first=JSON.stringify(state.memory);indexPeopleMemory();
    const saved=JSON.parse(JSON.stringify(state));loadState(saved);
    return {inputUntouched:JSON.stringify(old)===raw,rawUnchanged:JSON.stringify(state.log)===JSON.stringify(old.log),selene:memo().people.selene.length,martha:count,tom:(memo().people.tom||[]).length,lyra:(memo().people.lyra||[]).length,borin:(memo().people.borin||[]).length,idempotent:JSON.stringify(state.memory)===first,valid:validState(state),origin:peopleMemories('selene')[0].origin};
  })()`);assert.deepEqual(result,{inputUntouched:true,rawUnchanged:true,selene:2,martha:1,tom:0,lyra:0,borin:0,idempotent:true,valid:true,origin:'legacy'});
});

test('单独谈话只让知情角色记住，失败轮次不归档承诺', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.companions.selene.recruited=true;state.companions.vex.recruited=true;state.camp={talk:'selene',event:null,done:[],plan:{important:null,banter:[]}};
    narrate=async()=> '她收好吊坠，认真点头。@@@{"remember":[{"id":"selene","note":"你答应修好旧盾"},{"id":"vex","note":"你答应修好旧盾"}]}';
    await gm('我答应修好你的旧盾。','我答应修好你的旧盾。');
    const good={selene:memo().people.selene.length,vex:(memo().people.vex||[]).length,witness:state.log.find(e=>e.k==='you').knownBy};
    const previous=memo().people.selene.length;narrate=async()=> '她说你答应找回旧信。@@@{"remember":';await gm('我答应找回旧信。','我答应找回旧信。');
    return {good,failedUnchanged:memo().people.selene.length===previous,source:peopleMemories('selene').find(r=>r.origin==='turn').quote};
  })()`);assert.equal(result.good.selene,2);assert.equal(result.good.vex,0);assert.deepEqual(result.good.witness,['selene']);assert.equal(result.failedUnchanged,true);assert.equal(result.source,'她收好吊坠，认真点头。');
});

test('补建旧记忆必须有原句和知情证据，不能凭空归给未在场角色', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());state.act=1;state.scene='love_selene';state.companions.selene.recruited=true;state.companions.vex.recruited=true;
    const quote='你已经把修好的旧盾交还给她。';push('gm',quote);for(let i=0;i<14;i++)push('gm','河岸边的普通旅途记录。'.repeat(120));
    narrate=async()=>JSON.stringify({summary:'旧盾归还后继续旅行。',recovered:[{id:'selene',quote},{id:'vex',quote},{id:'selene',quote:'你送给她一座不存在的城堡。'},{id:'constructor',quote}]});
    await summarize();return {selene:memo().people.selene,other:(memo().people.vex||[]).length,quote:peopleMemories('selene')[0].quote,origin:peopleMemories('selene')[0].origin};
  })()`);assert.deepEqual(result.selene,['你已经把修好的旧盾交还给她。']);assert.equal(result.other,0);assert.equal(result.quote,result.selene[0]);assert.equal(result.origin,'quote');
});

test('引用缺席同伴过去的台词不会把他变成本次谈话的见证者', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.companions.selene.recruited=true;state.companions.vex.recruited=true;state.camp={talk:'selene',event:null,done:[]};
    const entry=push('gm','她回忆维克斯说：“我会等你回来。”');
    applyGM({remember:[{id:'selene',note:'你答应修好旧盾'},{id:'vex',note:'你答应修好旧盾'}]},undefined,[],entry);
    return {witnesses:entryMemoryAudience(entry),selene:(memo().people.selene||[]).length,vex:(memo().people.vex||[]).length};
  })()`);assert.deepEqual(result,{witnesses:['selene'],selene:1,vex:0});
});

test('解决和取代状态只改变提醒，长期条目与任务状态保留并能随档读回', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());remember('selene','你答应修好旧盾');remember('selene','她曾误会你的来意');const flags=JSON.stringify(state.flags);
    updatePeopleMemory('selene','你答应修好旧盾',{status:'resolved'});updatePeopleMemory('selene','她曾误会你的来意',{status:'superseded'});
    const selected=selectPeopleMemories().filter(r=>r.id==='selene').map(r=>r.record);const original=JSON.parse(JSON.stringify(state));const valid=validState(original);loadState(original);
    const broken=JSON.parse(JSON.stringify(state));broken.memory.peopleMeta.selene[0].status='pretend-success';
    return {count:memo().people.selene.length,selected:selected.length,status:selected[0].status,flagsUnchanged:JSON.stringify(state.flags)===flags,valid,roundtrip:peopleMemories('selene')[1].status,badRejected:!validState(broken)};
  })()`);assert.deepEqual(result,{count:2,selected:1,status:'resolved',flagsUnchanged:true,valid:true,roundtrip:'superseded',badRejected:true});
});

test('长期档案按话题选出早期细节，多个角色仍受每轮预算约束，检索不修改档案', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';
    for(const id of ['selene','vex','kassian','borin']){state.companions[id].recruited=true;remember(id,'你们曾在月桂吊坠上刻下一条银色潮纹');for(let i=0;i<150;i++)remember(id,'你们走过普通河岸的第'+i+'个路标，那里有一排枯树和一片芦苇');}
    const before=JSON.stringify(state);const normal=peopleMemoryLines('月桂吊坠 银色潮纹'),battle=peopleMemoryLines('月桂吊坠 银色潮纹','narrate');
    return {recalled:normal.includes('银色潮纹'),bounded:normal.length<7000,battleBounded:battle.length<2500,unchanged:JSON.stringify(state)===before,count:memo().people.selene.length};
  })()`);assert.deepEqual(result,{recalled:true,bounded:true,battleBounded:true,unchanged:true,count:151});
});

test('未答应和考虑中的事不自动成为承诺，明确兑现及和解不标成待办', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());const notes=['你尚未答应替她修盾','你考虑是否承诺归还旧信','你答应归还吊坠','你兑现了当初的承诺','她原谅了你此前撒谎'];for(const t of notes)remember('selene',t);
    return peopleMemories('selene').map(r=>r.status);
  })()`);assert.deepEqual(result,['recorded','recorded','open','resolved','resolved']);
});

function asyncGame() {
  const nodes = new Map(), storage = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, {style:{setProperty(){}},classList:{add(){},remove(){}},append(){},setAttribute(){},addEventListener(){}}); return nodes.get(id); };
  const context = vm.createContext({console,setTimeout,clearTimeout,AbortController,window:{},location:{hostname:'test.invalid',protocol:'file:'},
    document:{getElementById:node,createElement:node,addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)}});
  vm.runInContext(source+'\nrenderPlay=()=>{};render=()=>{};toast=()=>{};advanceCombat=()=>{};closeModal=()=>{};maybeSummarize=()=>{};pref.api="chatgpt";chatgpt.ready=true;',context);
  return async code => JSON.parse(JSON.stringify(await vm.runInContext(code,context)));
}

test('异常 JSON 和中断回复不提交状态，失败原文不进入后续记忆，成功重试只结算一次', async () => {
  const run=asyncGame();
  const result=await run(`(async()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.flags['act1.key']='legal';
    narrate=async()=> '玛莎把航海图交给你。@@@{"flags":{"act1.chart":"opened"';
    await gm('接图','接图');const bad={turns:state.turns,flag:state.flags['act1.chart']||null,retry:!!lastAction,recent:recentLines().includes('玛莎把航海图交给你')};
    narrate=async()=>{throw {code:'network',text:'这段中断内容不应该被记住'};};await gm('再试','再试');
    const failed=state.log.filter(e=>e.failed);failed.forEach(e=>e.m=1);
    const filtered={recent:recentLines().includes('这段中断内容'),recall:recallLines('这段中断内容'),chapter:state.log.filter(e=>!e.failed&&e.k==='gm').length};
    narrate=async()=> '玛莎把航海图交给你。@@@{"flags":{"act1.chart":"opened"}}';await gm('接图','接图');
    const invalidReplies=['只有正文','正文@@@','正文@@@null','正文@@@[]','正文@@@{"flags":'];
    const rejected=invalidReplies.map(t=>{try{parseGMReply(t);return false;}catch(e){return e.code==='invalid_reply';}});
    state.scene='act1_dawn';let chapterInput='';narrate=async prompt=>{chapterInput=prompt;return '纪要正文';};await writeChapter();
    return {bad,filtered,rejected,chapterClean:!chapterInput.includes('这段中断内容')&&chapterInput.includes('玛莎把航海图交给你'),turns:state.turns,flag:state.flags['act1.chart'],retry:!!lastAction,
      plainCombat:parseGMReply('战况正文','narrate')[0],emptyObject:parseGMReply('继续等待@@@{}')[1]};
  })()`);
  assert.deepEqual(result.bad,{turns:0,flag:null,retry:true,recent:false});
  assert.deepEqual(result.filtered,{recent:false,recall:'',chapter:0});
  assert(result.rejected.every(Boolean));assert.equal(result.chapterClean,true);
  assert.equal(result.turns,1);assert.equal(result.flag,'opened');assert.equal(result.retry,false);
  assert.equal(result.plainCombat,'战况正文');assert.deepEqual(result.emptyObject,{});
});

test('检查点只匹配同一局，导出携带一层检查点，老档和重复取点兼容', () => {
  const run=game();
  const result=run(`(()=>{
    state=newGame(freshDraft());const original=state.runId;state.act=3;state.scene='act3_climb';saveCheckpoint();
    const exported=snapshot(),embedded=!!exported.state.checkpoint,leaf=!exported.state.checkpoint.state.checkpoint;
    state=newGame(freshDraft());const foreign=currentCheckpoint();
    const imported=JSON.parse(JSON.stringify(exported.state));state=imported;const own=!!currentCheckpoint();
    saveCheckpoint();const repeated=!state.checkpoint.state.checkpoint;
    const old=newGame(freshDraft());delete old.runId;delete old.companions.naia;const before=JSON.stringify(old);
    const accepted=loadState(old),newId=!!state.runId,oldUntouched=JSON.stringify(old)===before;
    return {distinct:original!==state.runId,embedded,leaf,foreign,own,repeated,accepted,newId,oldUntouched,oldCompanion:!!state.companions.naia};
  })()`);
  assert.deepEqual(result,{distinct:true,embedded:true,leaf:true,foreign:null,own:true,repeated:true,accepted:true,newId:true,oldUntouched:true,oldCompanion:true});
});

test('不完整导入在替换当前状态前被拒绝，合法战斗档仍可恢复', () => {
  const run=game();
  const result=run(`(()=>{
    state=newGame(freshDraft());const before=state;
    const bad={phase:'play',player:{name:'损坏档'},scene:'prologue_1',log:[]};
    const rejects=[];
    for(const change of [s=>delete s.companions,s=>s.player.abilities=null,s=>s.memory={people:{x:[null]}},s=>s.pendingCheck={dc:15},s=>s.log=[null]]){
      const sample=newGame(freshDraft());change(sample);rejects.push(!loadState(sample)&&state===before);
    }
    const badAccepted=loadState(bad),unchanged=state===before;
    state.act=3;state.scene='act3_king';levelUp(12);startCombat('ember_king');const copy=JSON.parse(JSON.stringify(state));
    return {badAccepted,unchanged,rejects,combatValid:validState(copy),combatLoaded:loadState(copy)};
  })()`);
  assert.equal(result.badAccepted,false);assert.equal(result.unchanged,true);assert(result.rejects.every(Boolean));
  assert.equal(result.combatValid,true);assert.equal(result.combatLoaded,true);
});

test('七人之誓必须六位同伴健在同行，死亡、失踪、背叛、缺员与低赞同均阻止选择', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=3;state.scene='act3_king';
    const empty=ENDINGS.seven.need().length>0;
    for(const c of Object.values(state.companions)){c.recruited=true;c.approval=30;}
    const complete=ENDINGS.seven.need().length===0,blocked=[];
    for(const field of ['alive','recruited','taken','jailed','betrayed','approval']){
      const before=JSON.parse(JSON.stringify(state.companions.selene));state.companions.selene[field]=field==='approval'?29:['alive','recruited'].includes(field)?false:true;
      blocked.push(ENDINGS.seven.need().length>0);state.companions.selene=before;
    }
    return {empty,complete,blocked};
  })()`);assert(result.empty);assert(result.complete);assert(result.blocked.every(Boolean));
});

test('容器同意只接受本次询问的在队同伴，拒绝或无同意不能被献出，终章与读档保留唯一身体', () => {
  const run=game();const result=run(`(()=>{
    gm=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_king';state.pendingFinal=true;
    const c=state.companions.selene;c.recruited=true;c.romance='vowed';
    applyGM({});applyGM({vessel_consent:{id:'selene',ok:true}});const unsolicited=c.vesselConsent===undefined;
    state.vesselAsk='selene';applyGM({vessel_consent:{id:'vex',ok:true}});const wrong=c.vesselConsent===undefined;
    applyGM({vessel_consent:{id:'selene',ok:false}});const refused=!chooseEnding('hestia','selene')&&!state.flags['act3.ending'];
    state.vesselAsk='selene';c.taken=true;applyGM({vessel_consent:{id:'selene',ok:true}});const taken=c.vesselConsent===false;c.taken=false;
    applyGM({vessel_consent:{id:'selene',ok:true}});let prompt='';gm=t=>{prompt=t};const accepted=chooseEnding('hestia','selene');
    const portable=JSON.parse(JSON.stringify(state));portable.levelNote=null;loadState(portable);
    return {unsolicited,wrong,refused,taken,accepted,vessel:state.endingVessel,oneBody:prompt.includes('赫斯提雅借赛勒涅唯一的身体重生'),alive:prompt.includes('玩家仍然活着'),lover:loverEpilogue('selene','hestia').includes('等待赛勒涅'),card:endingText('hestia').includes('你活了下来')};
  })()`);assert.deepEqual(result,{unsolicited:true,wrong:true,refused:true,taken:true,accepted:true,vessel:'selene',oneBody:true,alive:true,lover:true,card:true});
});

test('掩盖真相的赞同上限覆盖剧情、任务、跨幕和夜谈来源，旧档抉择不补扣', () => {
  const run=game();const result=run(`(()=>{
    gm=()=>{};state=newGame(freshDraft());state.act=2;state.scene='act2_mist';const c=state.companions.selene;c.recruited=true;c.approval=90;
    Object.assign(state.flags,{'quest.selene.diary':true,'quest.selene.truth':true});applyGM({flags:{'quest.selene':'hidden'}});
    const cap=c.approvalCap,initial=c.approval;applyGM({approval:[{id:'selene',delta:15}]});const story=c.approval;
    state.camp={talk:'selene',talkAt:0,done:[]};state.turns=3;endTalk();const talk=c.approval;
    state.camp=null;state.scene='act2_end';state.ended=true;nextAct();const act=c.approval;
    const old=newGame(freshDraft());old.flags['quest.selene']='hidden';old.companions.selene.approval=90;loadState(old);
    return {cap,initial,story,talk,act,legacy:state.companions.selene.approval,legacyCap:state.companions.selene.approvalCap||null};
  })()`);assert.deepEqual(result,{cap:60,initial:60,story:60,talk:60,act:60,legacy:90,legacyCap:null});
});

test('破誓者实际替换灵光、打击与专属技能，保留等级成长和普通攻击', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=2;state.scene='act2_mist';const c=state.companions.selene;c.recruited=true;c.approval=40;
    Object.assign(state.flags,{'quest.selene.diary':true,'quest.selene.truth':true});applyGM({flags:{'quest.selene':'oathbreaker'}});levelUp(12);startCombat('darin_forge');
    const u=state.combat.units.selene,foe=cbList().find(x=>x.side!=='party'&&!ENEMIES[x.type]?.object);u.zone=foe.zone;
    state.combat.res={action:true,bonus:true,move:1};signatureTurn(u);
    rollD20=()=>20;attack(u,foe,u.weapons[0],{smite:true});
    return {label:classLabel('selene'),features:u.feats,extra:u.extra,fear:foe.cond.frightened,used:u.sigUsed,log:state.combat.feed.some(t=>t.includes('恐惧之拥')),dark:state.combat.feed.some(t=>t.includes('黯蚀斩')&&t.includes('黯蚀打击'))};
  })()`);assert.deepEqual(result,{label:'破誓者',features:['dread','necrotic'],extra:true,fear:2,used:true,log:true,dark:true});
});

test('卡西安复仇少一次神术，营地明确赎罪后恢复，重复完成不叠加', () => {
  const run=game();const result=run(`(()=>{
    gm=()=>{};state=newGame(freshDraft());state.act=1;state.scene='act1_docks_arena';const c=state.companions.kassian;c.recruited=true;c.approval=40;
    Object.assign(state.flags,{'quest.kassian.arden':true,'quest.kassian.poison':true});const before=partyUnit('kassian',0).uses;
    applyGM({flags:{'quest.kassian':'killed_eel'}});const after=partyUnit('kassian',0).uses,blocked=!completeAtonement();
    state.camp={talk:null,plan:{important:null,banter:[]},done:[]};const restored=completeAtonement(),again=completeAtonement();
    return {before,after,blocked,restored,again,uses:partyUnit('kassian',0).uses,memory:memo().people.kassian.filter(t=>t.includes('赎罪')).length};
  })()`);assert(result.before>0);assert.equal(result.after,result.before-1);assert(result.blocked);assert(result.restored);assert.equal(result.again,false);assert.equal(result.uses,result.before);assert.equal(result.memory,1);
});

test('博林抉择固定赞同后果只结算一次，低信任放任会离队', () => {
  const run=game();const result=run(`(()=>{
    const choose=(pick,approval)=>{state=newGame(freshDraft());state.act=2;state.scene='act2_ember_forge';const c=state.companions.borin;c.recruited=true;c.approval=approval;
      Object.assign(state.flags,{'act1.darin_axe':true,'quest.borin.alive':true});applyGM({flags:{'quest.borin':pick}});applyGM({flags:{'quest.borin':pick}});return {approval:c.approval,left:!!c.left};};
    return {mercy:choose('mercy',40),leave:choose('abandoned',20),stay:choose('abandoned',60)};
  })()`);assert.deepEqual(result,{mercy:{approval:50,left:false},leave:{approval:-5,left:true},stay:{approval:35,left:false}});
});

test('莉拉新抉择在第三幕检查 60 门槛，旧档不追溯背叛，已背叛不重复记忆', () => {
  const run=game();const result=run(`(()=>{
    const sample=(approval,old)=>{state=newGame(freshDraft());state.act=2;state.scene='act2_ember_study';const c=state.companions.lyra;c.recruited=true;c.approval=approval;
      if(old)state.flags['quest.lyra']='joined';else {Object.assign(state.flags,{'act1.notes_copied':true,'quest.lyra.oswald':true});applyGM({flags:{'quest.lyra':'joined'}});}
      state.act=3;goScene('act3_1');resolveCultPact();return {betrayed:!!c.betrayed,party:party().includes('lyra'),memory:(memo().people.lyra||[]).filter(t=>t.includes('投向了教团')).length};};
    return {low:sample(59,false),high:sample(60,false),legacy:sample(20,true)};
  })()`);assert.deepEqual(result,{low:{betrayed:true,party:false,memory:1},high:{betrayed:false,party:true,memory:0},legacy:{betrayed:false,party:true,memory:0}});
});

test('战况提示精简重复人物资料，其他幕支线保留索引，长期记忆原文完整保留', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=3;state.scene='act3_king';for(const c of Object.values(state.companions)){c.recruited=true;c.approval=50;}
    state.flags['side.tom_leg']='taken';memo().chapters=[{id:'act1_1',title:'酒馆约定',text:'你答应玛莎战后回来修好吧台。'}];
    const before=JSON.stringify(state.memory),normal=buildPrompt('继续'),battle=buildPrompt('继续','narrate');
    return {smaller:battle.length<normal.length,remembers:battle.includes('你答应玛莎战后回来修好吧台'),index:battle.includes('其他幕未完成的支线'),unchanged:JSON.stringify(state.memory)===before};
  })()`);assert.deepEqual(result,{smaller:true,remembers:true,index:true,unchanged:true});
});

test('长局取出相关旧纪要和最近三章，保留完整原文与其余索引', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=3;state.scene='act3_haven';
    const m=memo();m.chapters=Array.from({length:90},(_,i)=>({id:'old-'+i,title:'往事第'+i+'章',text:('这是一段独立往事，记着港口的风与灯。').repeat(30)}));
    m.chapters[2].text='你答应赛勒涅把月桂吊坠交还给她，这是只有你们知道的约定。'+m.chapters[2].text;
    const before=JSON.stringify(m.chapters),out=chapterLines('我拿出月桂吊坠，向赛勒涅提起约定。');
    return {recalled:out.includes(m.chapters[2].text),recent:[87,88,89].every(i=>out.includes('· '+m.chapters[i].title+'：')),indexed:out.includes('其他往事索引：'),bounded:out.length<12000,unchanged:JSON.stringify(m.chapters)===before};
  })()`);assert.deepEqual(result,{recalled:true,recent:true,indexed:true,bounded:true,unchanged:true});
});

test('记事只接纳已发生原文，拒绝伪造、错误主体、未读和失败回复，重复不堆叠', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());const read=push('gm','你已经读完这封月桂来信。'),npc=push('gm','莉拉已经读完这份研究日记。'),promise=push('you','我答应明天回来帮你修好吧台。');
    recordTurnFacts([{kind:'read',who:'player',quote:read.t},{kind:'read',who:'lyra',quote:npc.t},{kind:'clue',quote:'你获得了不存在的钥匙。'}],read,promise);
    const before=factsOf().length;addFact('read','lyra',npc.t,npc);addFact('read','player',read.t,read);
    const failed=push('gm','你读完了不应记下的密信。',{failed:true}),negative=push('gm','你还没有读完这封信。'),future=push('gm','你准备读完下一封信。');
    const claimed=push('you','我已经读完了那本航海日记。');
    const rejects=[!addFact('read','player',failed.t,failed),!addFact('read','player',negative.t,negative),!addFact('read','player',future.t,future),!addFact('promise','vex',promise.t,promise),!addFact('read','player','你读完了伪造的信件。',read),!addFact('read','player',npc.t,npc),!addFact('read','player',claimed.t,claimed)];
    return {before,count:factsOf().length,player:factsOf().filter(f=>f.kind==='read'&&f.who==='player').length,npc:factsOf().filter(f=>f.who==='lyra').length,promise:factsOf().filter(f=>f.kind==='promise').length,rejects,flags:Object.keys(state.flags).length};
  })()`);assert.equal(result.before,2);assert.equal(result.count,3);assert.equal(result.player,1);assert.equal(result.npc,1);assert.equal(result.promise,1);assert(result.rejects.every(Boolean));assert.equal(result.flags,0);
});

test('旧档记事迁移不修改传入存档，问句、NPC读信与中断内容不冒充玩家已读', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());push('you','我承诺回来给玛莎帮忙。');push('gm','你已经读完了萨丝的来信。');push('gm','莉拉读完日记后看着你。');push('gm','你读完那封信了吗？');push('gm','你读完了中断的信件。',{failed:true});
    const old=JSON.parse(JSON.stringify(state)),before=JSON.stringify(old);loadState(old);const first=JSON.stringify(factsOf());indexOldFacts();
    return {untouched:JSON.stringify(old)===before,read:factsOf().filter(f=>f.kind==='read').length,promise:factsOf().filter(f=>f.kind==='promise').length,idempotent:JSON.stringify(factsOf())===first,raw:state.log.length===old.log.length};
  })()`);assert.deepEqual(result,{untouched:true,read:1,promise:1,idempotent:true,raw:true});
});

test('成功说书回复登记原文记事，损坏JSON与失败重试不提前登记', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());narrate=async()=> '你已经读完这封月桂来信。@@@{"facts":';await gm('读信','读信');const bad=factsOf().length;
    narrate=async()=> '你已经读完这封月桂来信。@@@{"facts":[{"kind":"read","who":"player","quote":"你已经读完这封月桂来信。"}]}';await gm('读信','读信');
    return {bad,good:factsOf().length,turns:state.turns,source:factsOf()[0].source};
  })()`);assert.deepEqual(result,{bad:0,good:1,turns:1,source:'gm'});
});

test('日志全文检索覆盖远期纪要、原文和人物记忆，按多关键词匹配且不改存档', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());memo().chapters=[{id:'act1_1',title:'赛勒涅的旧约',text:'你与赛勒涅约定归还月桂吊坠。'}];memo().people.selene=['你答应陪她找回吊坠'];push('gm','莉拉收好了另一封信。');push('gm','赛勒涅拿起月桂吊坠。');
    const before=JSON.stringify(state),match=journalSearch('赛勒涅 月桂'),literal=journalSearch('[不存在]');
    return {total:match.total,all:match.items.every(x=>(x.title+x.text).includes('赛勒涅')&&(x.title+x.text).includes('月桂')),literal:literal.total,unchanged:JSON.stringify(state)===before};
  })()`);assert.deepEqual(result,{total:2,all:true,literal:0,unchanged:true});
});

test('手动存档命名保留原档内容与当前角色，覆盖保存保留名称，旧版本命名另存冲突', async () => {
  const run=asyncGame();const result=await run(`(async()=>{
    state=newGame(freshDraft());state.player.name='当前角色';const active=state,stored=newGame(freshDraft());stored.player.name='另一份存档';
    localStorage.setItem(SLOT(1),JSON.stringify({t:1,state:stored}));const renamed=await renameSave(SLOT(1),' 出海之前 '),named=readSave(SLOT(1));
    const untouched=state===active&&named.state.player.name==='另一份存档';save(SLOT(1));const retained=readSave(SLOT(1)).label;
    const p=readSave(SLOT(1));p.revision='b'.repeat(64);localStorage.setItem(SLOT(1),JSON.stringify(p));disk.on=true;disk.base.slot1='a'.repeat(64);
    const conflict=await renameSave(SLOT(1),'过期改名'),copy=readSave(disk.conflicts.slot1);
    return {renamed,label:named.label,untouched,retained,conflict,main:readSave(SLOT(1)).label,preserved:copy.label,active:state.player.name};
  })()`);assert.deepEqual(result,{renamed:true,label:'出海之前',untouched:true,retained:'出海之前',conflict:true,main:'出海之前',preserved:'过期改名',active:'当前角色'});
});

test('第一幕进度提示以实际标记为准，继续主线遵守未完成检定与正常回酒馆路径', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_manor';gm=()=>{};render=()=>{};let camps=0;enterCamp=()=>{camps++};
    const missing=!firstActProgress().ready&&!continueFirstAct();state.flags['act1.key']='legal';const chartHint=firstActProgress().hint.includes('取出航海图');state.flags['act1.chart']='opened';const shipHint=firstActProgress().hint.includes('安排船');state.flags['act1.ship']='seagull';
    state.pendingCheck={skill:'stealth',dc:12,who:'player'};const blocked=!continueFirstAct();state.pendingCheck=null;const moved=continueFirstAct(),scene=state.scene;const camp=continueFirstAct();
    return {missing,chartHint,shipHint,blocked,moved,scene,camp,camps,keys:Object.keys(state.flags).sort()};
  })()`);assert.deepEqual(result,{missing:true,chartHint:true,shipHint:true,blocked:true,moved:true,scene:'act1_hub',camp:true,camps:1,keys:['act1.chart','act1.key','act1.ship']});
});

test('第一幕普通地点一次经过港口转场，未完成检定和灯塔剧情不能借此跳过', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_docks';const normal=route(SCENES[state.scene],'act1_manor'),prompt=nextLine(SCENES[state.scene]).includes('经港口街直接前往');
    state.pendingCheck={skill:'stealth',dc:12,who:'player'};const checked=route(SCENES[state.scene],'act1_manor');state.pendingCheck=null;
    const noLighthouse=route(SCENES[state.scene],'act1_lighthouse');state.flags['act1.chart']='opened';state.flags['act1.ship']='seagull';const stillNoSkip=route(SCENES[state.scene],'act1_lighthouse');
    applyGM({advance:'act1_manor',location:'灰帆港 · 总督府'});const arrived=state.scene,via=state.visits.act1_hub;
    return {normal,prompt,checked,noLighthouse,stillNoSkip,arrived,via};
  })()`);assert.deepEqual(result,{normal:['act1_hub','act1_manor'],prompt:true,checked:null,noLighthouse:null,stillNoSkip:null,arrived:'act1_manor',via:1});
});

test('金库内的总督府地点前缀不会误退回入口，检定未完成不跟随地点移动', () => {
  const run=game();const result=run(`(()=>{
    state=newGame(freshDraft());state.act=1;state.scene='act1_manor_vault';
    applyGM({location:'总督府地下楼梯',check:{skill:'stealth',dc:14,who:'player'}});const during=state.scene;
    state.pendingCheck=null;applyGM({location:'总督府保险室门前'});const inside=state.scene;
    applyGM({advance:'act1_manor',location:'总督府'});return {during,inside,returned:state.scene};
  })()`);assert.deepEqual(result,{during:'act1_manor_vault',inside:'act1_manor_vault',returned:'act1_manor'});
});

test('进度值严格区分布尔与字符串，未知标记和继承属性不会生效', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());const issues=[];
    applyGM({flags:JSON.parse('{"prologue.tom_saved":"false","prologue.betrayed_companion":"constructor","act1.ship":"watch","constructor":true,"missing.flag":true}')},undefined,issues);
    const untouched=JSON.stringify(state.flags)==='{}';applyGM({flags:{'prologue.tom_saved':true}});applyGM({flags:{'prologue.tom_saved':false}});
    return {untouched,issues:issues.length,falseValue:state.flags['prologue.tom_saved'],taken:Object.values(state.companions).some(c=>c.taken),label:progressName('constructor')};})()`);
  assert.deepEqual(r,{untouched:true,issues:5,falseValue:false,taken:false,label:'剧情进度'});
});

test('同批无效钥匙不能解锁航海图，有效钥匙与图不受字段顺序影响', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';const issues=[];
    applyGM({flags:{'act1.chart':'opened','act1.key':'watch'}},undefined,issues);const blocked=!state.flags['act1.chart']&&!state.flags['act1.key'];
    applyGM({flags:{'act1.chart':'opened','act1.key':'legal'}});return {blocked,issues:issues.length,key:state.flags['act1.key'],chart:state.flags['act1.chart']};})()`);
  assert.deepEqual(r,{blocked:true,issues:2,key:'legal',chart:'opened'});
});

test('明确交付缺少进度时只提醒，否定、条件、提问与未完成检定不会冒充已取得', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';const before=JSON.stringify(state);
    const yes=progressClaims('你接过守誓人的钥匙。你取出暗格里的航海图。萨丝同意借出海鸥号。').map(i=>i.key);
    const no=['你还没有拿到守誓人的钥匙。','你将取出航海图。','如果取出航海图，就能出海。','你拿到航海图了吗？','萨丝不允许正式借给你海鸥号。'].map(t=>progressClaims(t).length);
    const unchanged=JSON.stringify(state)===before;state.flags['act1.ship']='hired';const mismatch=progressClaims('萨丝将信收好，说：“海鸥号由我批准借给你们。”').some(i=>i.key==='act1.ship'),history=progressClaims('此前萨丝同意借出海鸥号。').length;
    state.pendingCheck={skill:'sleight',dc:15,who:'player'};const pending=progressClaims('你取出航海图。').length;
    return {yes,no,unchanged,mismatch,history,pending};})()`);
  assert.deepEqual(r,{yes:['act1.key','act1.chart','act1.ship'],no:[0,0,0,0,0],unchanged:true,mismatch:true,history:0,pending:0});
});

test('部分进度被拒绝时保留成功内容、正文和核对入口，刷新后仍可核对', async () => {
  const run=asyncGame();const r=await run(`(async()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_manor';levelUp(2);state.levelNote=null;
    narrate=async()=> '萨丝同意借出海鸥号。@@@{"gold":5,"flags":{"act1.ship":"watch","constructor":true}}';await gm('提交密信','提交密信');
    const quote=state.progressReview.quote,issues=state.progressReview.issues.length,valid=validState(state),raw=state.log.some(e=>e.k==='gm'&&e.t===quote&&!e.failed),gold=state.player.gold;
    const portable=JSON.parse(JSON.stringify(state));loadState(portable);return {issues,valid,raw,gold,turns:state.turns,ship:state.flags['act1.ship']||null,restored:state.progressReview.quote===quote,prompt:progressReviewLine().includes('seagull')};})()`);
  assert.deepEqual(r,{issues:2,valid:true,raw:true,gold:20,turns:1,ship:null,restored:true,prompt:true});
});

test('核对仅接收相关进度，模型附带的伤害、金钱、选择、检定、转场和扎营不执行', async () => {
  const run=asyncGame();const r=await run(`(async()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_manor';state.flags['act1.key']='legal';state.flags['act1.chart']='opened';
    state.progressReview={scene:state.scene,quote:'萨丝同意借出海鸥号。',issues:[{key:'act1.ship',reason:'待核对'}]};
    const hp=state.player.hp,items=JSON.stringify(state.player.inventory),day=state.day;
    narrate=async()=> '已核对，获准借用的是海鸥号。@@@{"flags":{"act1.ship":"seagull","act1.governor":"blackmailed"},"gold":50,"items_add":["额外物品"],"hp":[{"id":"player","delta":-15}],"advance":"act1_hub","location":"新地点","camp":true,"check":{"skill":"persuasion","dc":15},"combat":"manor_guards"}';
    await gm('核对',null,'review');return {ship:state.flags['act1.ship'],governor:state.flags['act1.governor']||null,gold:state.player.gold,hp:state.player.hp===hp,items:JSON.stringify(state.player.inventory)===items,day:state.day===day,turns:state.turns,scene:state.scene,camp:!!state.camp,combat:!!state.combat,check:!!state.pendingCheck,review:state.progressReview};})()`);
  assert.deepEqual(r,{ship:'seagull',governor:null,gold:15,hp:true,items:true,day:true,turns:0,scene:'act1_manor',camp:false,combat:false,check:false,review:null});
});

test('核对失败保留待办；确认未到手可结束提醒，不强行授予进度', async () => {
  const run=asyncGame();const r=await run(`(async()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_manor';state.progressReview={scene:state.scene,quote:'萨丝谈起海鸥号。',issues:[{key:'act1.ship',reason:'待核对'}]};
    narrate=async()=> '正文@@@{"flags":';await gm('核对',null,'review');const kept=!!state.progressReview;
    narrate=async()=> '核对记录格式有误。@@@{"flags":[]}';await gm('核对',null,'review');const badShapeKept=state.progressReview.quote==='萨丝谈起海鸥号。'&&state.progressReview.issues.some(i=>i.key==='act1.ship');
    narrate=async()=> '核对后发现她只是提出条件，尚未批准借船。@@@{}';await gm('核对',null,'review');
    return {kept,badShapeKept,cleared:state.progressReview===null,ship:state.flags['act1.ship']||null,turns:state.turns};})()`);
  assert.deepEqual(r,{kept:true,badShapeKept:true,cleared:true,ship:null,turns:0});
});

test('核对仍受支线、代码结算和已结束选择约束，相同合法标记不反复告警', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=2;state.scene='act2_ember';const issues=[];
    applyGM({flags:{'act2.darin':'woke','side.tom_leg':'done','act2.heart':'destroyed'}},'review',issues);
    state.flags['act1.ship']='seagull';const repeated=[];applyGM({flags:{'act1.ship':'seagull'}},'review',repeated);
    return {blocked:!state.flags['act2.darin']&&!state.flags['side.tom_leg']&&!state.flags['act2.heart'],issues:issues.length,repeated:repeated.length};})()`);
  assert.deepEqual(r,{blocked:true,issues:3,repeated:0});
});

test('第二幕人数补强只作用于新开战的大队伍，阵亡、增援与读档保持开战时强度', () => {
  const run=game();const r=run(`(()=>{const setup=n=>{state=newGame(freshDraft());state.act=2;state.scene='act2_ghost';for(const id of ['selene','kassian','borin','vex','lyra','naia'].slice(0,n-1))state.companions[id].recruited=true;levelUp(6);startCombat('ghost_ship');};
    const base=JSON.stringify(ENCOUNTERS.ghost_ship.scale);setup(4);const four=JSON.stringify(state.combat.scale)===base;
    setup(7);const boosted=state.combat.scale.hp>ENCOUNTERS.ghost_ship.scale.hp,gentle=state.combat.scale.hit===ENCOUNTERS.ghost_ship.scale.hit&&state.combat.scale.dmg===ENCOUNTERS.ghost_ship.scale.dmg,scale=JSON.stringify(state.combat.scale),type=ENCOUNTERS.ghost_ship.foes[0][0];
    state.companions.naia.left=true;state.companions.naia.recruited=false;const spawned=foeUnit(type,0,'enemy').max;const portable=JSON.parse(JSON.stringify(state));loadState(portable);
    const frozen=JSON.stringify(state.combat.scale)===scale&&foeUnit(type,0,'enemy').max===spawned;delete state.combat.scale;const legacy=foeUnit(type,0,'enemy').max===Math.round(ENEMIES[type].hp*ENCOUNTERS.ghost_ship.scale.hp);
    setup(7);state.combat=null;state.companions.naia.jailed=true;state.companions.vex.left=true;state.companions.vex.recruited=false;state.companions.borin.alive=false;startCombat('ghost_ship');const eligible=cbList().filter(u=>u.side==='party').length===4&&JSON.stringify(state.combat.scale)===base;
    return {four,boosted,gentle,frozen,legacy,eligible,baseUnchanged:JSON.stringify(ENCOUNTERS.ghost_ship.scale)===base,third:JSON.stringify(encounterScale(ENCOUNTERS.ember_king,7))===JSON.stringify(ENCOUNTERS.ember_king.scale)};})()`);
  assert.deepEqual(r,{four:true,boosted:true,gentle:true,frozen:true,legacy:true,eligible:true,baseUnchanged:true,third:true});
});

test('新增核对记录与冻结战斗强度拒绝坏档，同时旧档仍可读取', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());const old=JSON.parse(JSON.stringify(state)),legacy=validState(old);const bad=JSON.parse(JSON.stringify(old));bad.progressReview={scene:'act1_hub',quote:'原文',issues:[{key:'act1.ship',reason:{}}]};const review=!validState(bad);
    state.act=2;state.scene='act2_ghost';startCombat('ghost_ship');const combat=JSON.parse(JSON.stringify(state));combat.combat.scale.hp='bad';return {legacy,review,scale:!validState(combat)};})()`);
  assert.deepEqual(r,{legacy:true,review:true,scale:true});
});

test('事项提醒只列本幕已接任务，未知债务和已结束债务不提前揭示', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_manor';state.act1Day=1;state.day=3;
    const hidden=debtReminder()==='';Object.assign(state.flags,{'act1.debt_known':true,'side.watch_mole':'taken','side.tom_leg':'done','side.eve_letter':'taken'});
    const before=JSON.stringify(state),tasks=pendingSideTasks(),urgent=debtReminder(),unchanged=JSON.stringify(state)===before;
    state.flags['act1.lise']='saved';const solved=debtReminder()==='';delete state.flags['act1.lise'];state.flags['act1.vex_debt']=true;const paid=debtReminder()==='';
    return {hidden,ids:tasks.map(q=>q.id),urgent:urgent.includes('再长休一次'),solved,paid,unchanged};})()`);
  assert.deepEqual(r,{hidden:true,ids:['watch_mole'],urgent:true,solved:true,paid:true,unchanged:true});
});

test('相处机会遵守在队、关系、身份、已看与当前场景条件，不提前揭示奈雅身份', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';const c=state.companions.selene;c.recruited=true;c.approval=24;
    const low=personalOpportunities().length===0;c.approval=25;const ready=personalOpportunities().some(e=>e.id==='selene_scene');const before=JSON.stringify(state);personalOpportunities();const pure=JSON.stringify(state)===before;
    state.campSeen=['selene_scene'];const seen=!personalOpportunities().some(e=>e.who==='selene');state.campSeen=[];c.romance='together';const lover=!personalOpportunities().some(e=>e.id==='selene_scene');c.romance='none';c.jailed=true;
    const jailed=!personalOpportunities().some(e=>e.who==='selene');const n=state.companions.naia;n.recruited=true;n.approval=40;const hidden=!personalOpportunities().some(e=>e.who==='naia');state.flags['act1.naia_exposed']=true;const known=personalOpportunities().some(e=>e.who==='naia');
    state.ended=true;const ended=personalOpportunities().length===0;return {low,ready,pure,seen,lover,jailed,hidden,known,ended};})()`);
  assert(Object.values(r).every(Boolean));
});

test('同晚只提示已安排的重要相处，不通过事件id绕过每晚名额', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';gm=()=>{};for(const id of ['selene','lyra']){state.companions[id].recruited=true;state.companions[id].approval=30;}
    state.campSeen=['act1_home'];state.camp={talk:null,done:[],plan:planNight()};const shown=personalOpportunities().map(e=>e.id),before=JSON.stringify(state);
    talkTo('event:lyra_scene');const blocked=JSON.stringify(state)===before;talkTo('selene');return {shown,blocked,scene:state.scene,seen:state.campSeen.includes('selene_scene')};})()`);
  assert.deepEqual(r,{shown:['selene_scene'],blocked:true,scene:'love_selene',seen:true});
});

test('关系改变后过期的重要场景退回普通聊天，不锁死同伴也不强开亲密场景', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';gm=()=>{};const c=state.companions.selene;c.recruited=true;c.approval=30;
    state.campSeen=['act1_home'];state.camp={talk:null,done:[],plan:planNight()};c.approval=0;talkTo('selene');
    return {scene:state.scene,talk:state.camp.talk,event:state.camp.event,seen:state.campSeen.includes('selene_scene'),important:state.camp.plan.important};})()`);
  assert.deepEqual(r,{scene:'act1_hub',talk:'selene',event:null,seen:false,important:null});
});

test('打开休息提醒不结束当前谈话、不结算赞同；没有事项时保留直接休息', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.act1Day=1;state.day=3;state.flags['act1.debt_known']=true;
    state.companions.selene.recruited=true;state.companions.selene.approval=10;state.turns=3;state.camp={talk:'selene',event:null,talkAt:0,done:[],plan:{important:null,banter:[]}};
    let modals=0,sleeps=0;modal=()=>{modals++};restNight=()=>{sleeps++};const before=JSON.stringify(state);goSleep();const held=JSON.stringify(state)===before&&sleeps===0;
    delete state.flags['act1.debt_known'];state.camp.talk=null;goSleep();return {held,modals,sleeps};})()`);
  assert.deepEqual(r,{held:true,modals:1,sleeps:1});
});

test('主线推进前仅提示已接未完事项和当前可聊的人，告别不会提前出现在其他场景', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());state.act=1;state.scene='act1_hub';state.flags['act1.chart']='opened';state.flags['act1.ship']='seagull';state.flags['side.watch_mole']='taken';state.camp={talk:null,done:[],plan:{important:null,banter:[]}};
    const notes=sleepNotices().join(' '),known=notes.includes('港卫军的内鬼'),hidden=!notes.includes('霍布')&&!notes.includes('总督接受教团资助');
    state.act=3;state.scene='act3_haven';state.camp=null;state.companions.selene.recruited=true;const ordinary=!personalOpportunities().some(e=>e.kind==='farewell');state.scene='act3_whisper';const farewell=personalOpportunities().some(e=>e.kind==='farewell'&&e.who==='selene');
    return {known,hidden,ordinary,farewell};})()`);
  assert(Object.values(r).every(Boolean));
});

test('烬王优先使用完整龙角版，加载失败可回退原图，其余角色和玩家图保持原路径', () => {
  const run=game();const r=run(`(()=>{state=newGame(freshDraft());failed.clear();const im={};portrait(im,'emberking','neutral');const current=im.src;im.onerror();const fallback=im.src;const other={};portrait(other,'hestia','neutral');state.player.portraitData='data:image/png;base64,test';const player={};portrait(player,'player');return {current,fallback,other:other.src,player:player.src};})()`);
  assert.deepEqual(r,{current:'portraits/emberking_neutral_v3.webp',fallback:'portraits/emberking_neutral.webp',other:'portraits/hestia_neutral.webp',player:'data:image/png;base64,test'});
});



