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
    const c=state.combat;for(const u of Object.values(c.units))u.zone=1;
    const a=c.units.cultist1,b=c.units.cultist2,d=c.units.cultist3;
    for(const u of Object.values(c.units))if(u.type==='cultist'&&u!==a&&u!==b&&u!==d)u.out='fled';
    Math.random=()=>0;b.hp=1;d.hp=2;hurt(a,99);
    const chain={secondDead:!!b.dead,thirdHp:d.hp,thirdAlive:!d.dead};
    Math.random=()=>0.5;d.hp=1;c.spare=true;c.res={move:1,action:true,bonus:true};allyTurn(c.units.selene);
    return {chain,captured:d.out,fight:state.flags['prologue.fight_style']};
  })()`);
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
    return {locked,blocked,level,skip,warmed,noTide,heart:state.flags['act2.heart'],taken:state.flags['act2.taken'],gone:!party().includes('kassian'),scene:state.scene};
  })()`);
  assert.deepEqual(result, { locked: 'act2_hub', blocked: 'act2_temple', level: 9, skip: 0, warmed: 2, noTide: null, heart: 'cult', taken: 'kassian', gone: true, scene: 'act2_end' });
});

test('烬卫达林：熔炉给他回血，博林的战歌唤醒他', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};state=newGame(freshDraft());state.act=2;state.scene='act2_ember';levelUp(7);state.companions.borin.recruited=true;
    startCombat('darin_forge');const c=state.combat,d=Object.values(c.units).find(u=>u.type==='darin');
    const forge=Object.values(c.units).find(u=>u.type==='forge');d.hp=90;foeTurn(forge);const healed=d.hp;
    rollD20=()=>20;const b=c.units.borin;for(let i=0;i<3;i++){c.res={move:1,action:true,bonus:true};allyTurn(b);}
    return {healed,out:d.out,flag:state.flags['act2.darin'],result:combatResult()};
  })()`);
  assert.deepEqual(result, { healed: 100, out: 'awakened', flag: 'woke', result: 'victory' });
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
    hurt(k,60);const fallen=!!k.fallen&&!combatResult();hurt(k,500);const result=combatResult();endCombat(result);
    const pending=!!state.pendingFinal;const egg=ENDINGS.egg.need().length>0, crown=ENDINGS.crown.need().length===0;
    chooseEnding('crown');
    return {air,noMelee,fallen,result,pending,egg,crown,scene:state.scene,ending:state.flags['act3.ending']};
  })()`);
  assert.deepEqual(result, { air: { aloft: true, grounded: true, allies: 0 }, noMelee: true, fallen: true, result: 'final', pending: true, egg: true, crown: true, scene: 'act3_end', ending: 'crown' });
});

test('最终战失败就是港口陷落', () => {
  const run = game();
  const result = run(`(() => {
    gm=()=>{};render=()=>{};state=newGame(freshDraft());state.act=3;state.scene='act3_king';levelUp(12);
    startCombat('ember_king');for(const u of Object.values(state.combat.units)) if(u.side==='party'){u.hp=0;u.down=true;}
    endCombat(combatResult());return {ending:state.flags['act3.ending'],scene:state.scene,over:!!state.gameOver};
  })()`);
  assert.deepEqual(result, { ending: 'fall', scene: 'act3_end', over: false });
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
    const bad=CAMP_EVENTS.filter(e=>{try{ if(e.group) e.when(); else if(e.pair) return !e.pair.every(id=>COMPANIONS[id]); else { if(!COMPANIONS[e.who]) return true; e.when(state.companions[e.who]); } return !e.seed||!KIND_ORDER.hasOwnProperty(e.kind)&&e.kind!=='banter'; }catch(x){return true;}}).map(e=>e.id);
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
  assert.deepEqual(result, { looted: { gold: 30, bow: true }, ok: true, noRare: false, sold: true, gold: 100, rare: false, junk: true, dagger: true });
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
    hurt(v,Math.ceil(v.max/2)+1);const started=c.ritualAt;c.turn=c.order.length;for(let i=0;i<3;i++){c.turn=c.order.length-1;nextTurn();}
    const ritual=!!state.flags['act3.ritual'];state.combat=null;
    state.scene='act3_king';startCombat('ember_king');c=state.combat;c.res={move:1,action:true,bonus:true};const k=Object.values(c.units).find(u=>u.type==='ember_king');const bigger=k.max>Math.round(300*1.3);
    for(const u of Object.values(c.units)) if(u.side==='party') u.zone=1;hurt(k,k.hp-Math.floor(k.max/3)+1);
    const zonesBefore=c.zones.filter(z=>!z.gone).length;kingTurn(k);const zonesAfter=c.zones.filter(z=>!z.gone).length;
    return {cp,started:!!started,ritual,bigger,fallen:k.fallen,collapsed:zonesBefore-zonesAfter,partyMoved:Object.values(c.units).filter(u=>u.side==='party').every(u=>!c.zones[u.zone].gone)};
  })()`);
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
    const poor=upgradeTavern('intel');const a=upgradeTavern('rooms'),b=upgradeTavern('barmaid');const gold=state.player.gold;
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
