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
    nextAct();const start={act:state.act,scene:state.scene,level:state.player.level};
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
    applyGM({flags:{'act2.heart':'destroyed'}});const noTide=state.flags['act2.heart']??null;
    applyGM({advance:'act2_end'});
    return {locked,level,skip,warmed,noTide,heart:state.flags['act2.heart'],taken:state.flags['act2.taken'],gone:!party().includes('kassian'),scene:state.scene};
  })()`);
  assert.deepEqual(result, { locked: 'act2_hub', level: 9, skip: 0, warmed: 2, noTide: null, heart: 'cult', taken: 'kassian', gone: true, scene: 'act2_end' });
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
    hurt(k,60);const result=combatResult();endCombat(result);
    const pending=!!state.pendingFinal;const egg=ENDINGS.egg.need().length>0, crown=ENDINGS.crown.need().length===0;
    chooseEnding('crown');
    return {air,noMelee,result,pending,egg,crown,scene:state.scene,ending:state.flags['act3.ending']};
  })()`);
  assert.deepEqual(result, { air: { aloft: true, grounded: true, allies: 0 }, noMelee: true, result: 'final', pending: true, egg: true, crown: true, scene: 'act3_end', ending: 'crown' });
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
