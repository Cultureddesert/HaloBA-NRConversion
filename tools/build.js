const fs = require('fs'), crypto = require('crypto'), path = require('path');
const O = require('./out.json');
const SRC = fs.readFileSync('data.js', 'utf8');
const OUTDIR = process.env.OUTDIR || '..';
fs.mkdirSync(OUTDIR, { recursive: true });

// ---------- helpers ----------
const used = new Set();
function id(seed) {
  let s = seed, n = 0, h;
  do {
    h = crypto.createHash('sha1').update('haloba|' + s + (n ? '|' + n : '')).digest('hex');
    n++;
  } while (used.has(h.slice(0, 16)) && n < 50);
  const x = h.slice(0, 16);
  used.add(x);
  return `${x.slice(0, 4)}-${x.slice(4, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}`;
}
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (name, attrs, inner) => {
  const a = Object.entries(attrs || {}).filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => ` ${k}="${esc(v)}"`).join('');
  return inner === undefined || inner === '' ? `<${name}${a}/>` : `<${name}${a}>${inner}</${name}>`;
};
const wrap = (name, items) => items.length ? `<${name}>${items.join('')}</${name}>` : '';
const GS_ID = id('gamesystem');
const PTS = 'points';
const STUB = 'No description in the source data. See the Bolt Action 3rd Edition rulebook or add the text here.';

// ---------- rules (shared, in game system) ----------
const wd = O.weaponSpecialDescriptions, ud = O.unitSpecialDescriptions;
const ruleDesc = {};
for (const [k, v] of Object.entries(ud)) ruleDesc[k] = v;
for (const [k, v] of Object.entries(wd)) ruleDesc[k] = v;
const ruleIds = {};          // name -> id
const stubRules = new Set();
function ensureRule(name) {
  name = name.trim();
  if (!ruleIds[name]) {
    ruleIds[name] = id('rule|' + name);
    if (!ruleDesc[name]) { ruleDesc[name] = STUB; stubRules.add(name); }
  }
  return ruleIds[name];
}
for (const k of Object.keys(ruleDesc)) ensureRule(k);

// ---------- weapon profiles (shared) ----------
const wp = O.allWeaponProfiles;
function parseProf(s) {
  const m = /^Range (.+?), Shots (.+?), Pen (.+?), (.*)$/.exec(s);
  if (!m) return { Range: '–', Shots: '–', Pen: '–', Special: s };
  return { Range: m[1], Shots: m[2], Pen: m[3], Special: m[4] };
}
const wpIds = {};
for (const k of Object.keys(wp)) wpIds[k] = id('wprofile|' + k);
const PT_WEAPON = id('ptype|weapon'), PT_UNIT = id('ptype|unit');
const CH = {
  Range: id('ch|range'), Shots: id('ch|shots'), Pen: id('ch|pen'), Special: id('ch|special'),
  Type: id('ch|type'), Models: id('ch|models'), DV: id('ch|dv'), Transport: id('ch|transport'), Veterancy: id('ch|vet'),
};
function weaponProfileXml(pid, name, p) {
  return tag('profile', { id: pid, name, hidden: 'false', typeId: PT_WEAPON, typeName: 'Weapon' },
    wrap('characteristics', ['Range', 'Shots', 'Pen', 'Special'].map(c =>
      tag('characteristic', { name: c === 'Special' ? 'Special Rules' : c, typeId: CH[c] }, esc(p[c])))));
}

// port of getBaseWeaponName
function baseWeapon(label) {
  let s = String(label).trim().replace(/^\s*\d+\s*x?\s*/i, '').replace(/[“”]/g, '"').replace(/[’]/g, "'");
  [/\bcasement[- ]mounted\b/ig, /\bforward[- ]facing\b/ig, /\bhull[- ]mounted\b/ig, /\bturret[- ]mounted\b/ig,
    /\bpintle[- ]mounted\b/ig, /\bsponson[- ]mounted\b/ig, /\bco[- ]axial\b/ig, /\bcoaxial\b/ig, /\bquad[- ]linked\b/ig,
    /\btriple[- ]linked\b/ig, /\btwin[- ]linked\b/ig, /\bdual[- ]?\b/ig, /\brear[- ]?\b/ig, /\bside[- ]mounted\b/ig,
    /\bmounted\b/ig, /\bpaired\b/ig, /\bcovering\b/ig, /\bfront arc\b/ig, /\bleft arc\b/ig, /\bright arc\b/ig,
    /\brear arc\b/ig, /\b360°\s*arc\s*of\s*fire\b/ig].forEach(r => { s = s.replace(r, ' '); });
  s = s.replace(/\bcannons\b/ig, 'cannon').replace(/\s+/g, ' ').trim();
  if (wp[s]) return s;
  const words = s.split(' ').filter(Boolean);
  for (let span = Math.min(words.length, 6); span >= 1; span--)
    for (let i = 0; i <= words.length - span; i++) {
      const t = words.slice(i, i + span).join(' ');
      if (wp[t]) return t;
      if (t.endsWith('s') && wp[t.slice(0, -1)]) return t.slice(0, -1);
    }
  const lower = s.toLowerCase();
  for (const key of Object.keys(wp)) { const k = key.toLowerCase(); if (k.includes(lower) || lower.includes(k)) return key; }
  return null;
}
const unmatchedWeapons = new Set();

// ---------- sections (categories) ----------
const sectionOf = {};
{
  let arr = null, sec = '';
  for (const line of SRC.split('\n')) {
    let m = /^const (\w+(?:_UNITS|_VEHICLES)) = \[/.exec(line);
    if (m) { arr = m[1]; sec = ''; continue; }
    if (!arr) continue;
    m = /^\s*\/\/\s*(.*)$/.exec(line);
    if (m && /headquarters|infantry squads|teams|leaders|tanks|tank destroyers|walkers|self-propelled|anti-aircraft|armoured cars|aircraft|transports/i.test(m[1])) sec = m[1].toLowerCase();
    m = /^\s*name:\s*"(.+)",?\s*$/.exec(line);
    if (m) sectionOf[arr + '|' + m[1]] = sec;
  }
}
const CATS = ['Army Setup', 'Army Leader', 'Headquarters', 'Infantry', 'Teams & Artillery', 'Attached Leaders',
  'Tanks & Tank Destroyers', 'Walkers', 'Artillery & Anti-Aircraft Vehicles', 'Armoured Cars & Transports', 'Aircraft'];
const catId = {}; CATS.forEach(c => catId[c] = id('cat|' + c));
function categoryFor(arr, u) {
  const sec = sectionOf[arr + '|' + u.name] || '';
  if (/headquarters/.test(sec)) return 'Headquarters';
  if (/leaders/.test(sec)) return 'Attached Leaders';
  if (/self-propelled|anti-aircraft/.test(sec)) return 'Artillery & Anti-Aircraft Vehicles';
  if (u.type === 'Infantry') return 'Infantry';
  if (u.type === 'Team') return 'Teams & Artillery';
  if (u.type === 'Tank') return 'Tanks & Tank Destroyers';
  if (u.type === 'Walker') return 'Walkers';
  if (u.type === 'Aircraft') return 'Aircraft';
  return 'Armoured Cars & Transports';
}

// ---------- gst ----------
function buildGst() {
  const costTypes = wrap('costTypes', [tag('costType', { id: PTS, name: 'pts', defaultCostLimit: '-1.0', hidden: 'false' })]);
  const profileTypes = wrap('profileTypes', [
    tag('profileType', { id: PT_WEAPON, name: 'Weapon' }, wrap('characteristicTypes', [
      tag('characteristicType', { id: CH.Range, name: 'Range' }),
      tag('characteristicType', { id: CH.Shots, name: 'Shots' }),
      tag('characteristicType', { id: CH.Pen, name: 'Pen' }),
      tag('characteristicType', { id: CH.Special, name: 'Special Rules' })])),
    tag('profileType', { id: PT_UNIT, name: 'Unit' }, wrap('characteristicTypes', [
      tag('characteristicType', { id: CH.Type, name: 'Type' }),
      tag('characteristicType', { id: CH.Models, name: 'Models' }),
      tag('characteristicType', { id: CH.DV, name: 'Damage Value' }),
      tag('characteristicType', { id: CH.Transport, name: 'Transport' })]))]);
  const categoryEntries = wrap('categoryEntries', [...CATS.map(c => tag('categoryEntry', { id: catId[c], name: c, hidden: 'false' })), ...validationCategoryEntries()]);
  const cl = CATS.map(c => {
    const cons = c === 'Army Leader' ? wrap('constraints', [tag('constraint', { type: 'max', value: '1', field: 'selections', scope: 'parent', shared: 'true', id: id('forcecon|leader') })]) : '';
    return tag('categoryLink', { id: id('forcecl|' + c), name: c, hidden: 'false', targetId: catId[c], primary: 'false' }, cons);
  });
  const forceEntries = wrap('forceEntries', [tag('forceEntry', { id: id('force|army'), name: 'Halo: Bolt Action Army', hidden: 'false' }, wrap('categoryLinks', [...cl, ...validationForceLinks()]))]);
  const sharedRules = wrap('sharedRules', Object.keys(ruleIds).sort().map(n =>
    tag('rule', { id: ruleIds[n], name: n, hidden: 'false' }, tag('description', {}, esc(ruleDesc[n])))));
  const sharedProfiles = wrap('sharedProfiles', Object.keys(wp).map(k => weaponProfileXml(wpIds[k], k, parseProf(wp[k]))));
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    tag('gameSystem', { id: GS_ID, name: 'Halo: Bolt Action', revision: '1', battleScribeVersion: '2.03', authorName: 'Halo: Bolt Action', xmlns: 'http://www.battlescribe.net/schema/gameSystemSchema' },
      costTypes + profileTypes + categoryEntries + forceEntries + sharedRules + sharedProfiles) + '\n';
}

// ---------- catalogue helpers ----------
let CUR = '';
const cid = (s) => id(CUR + '|' + s);
const con = (type, value, scope = 'parent', seed) => tag('constraint', { type, value: String(value), field: 'selections', scope, shared: 'true', id: cid('con|' + seed + type + value) });
const costXml = v => wrap('costs', [tag('cost', { name: 'pts', typeId: PTS, value: Number(v).toFixed(1) })]);
const ruleLink = (n, seed) => tag('infoLink', { id: cid('rl|' + seed + '|' + n), name: n, hidden: 'false', targetId: ensureRule(n), type: 'rule' });
const condAtLeast = (childId, scope, type = 'atLeast') => tag('condition', { type, value: '1', field: 'selections', scope, childId, shared: 'true', includeChildSelections: 'true', includeChildForces: 'false' });
const modSet = (field, value, conds) => tag('modifier', { type: 'set', field, value: String(value) }, wrap('conditions', conds));
const hideWhen = (conds) => modSet('hidden', 'true', conds);

let KIDS = null;
function entry(type, name, ident, o = {}) {
  if (KIDS) KIDS.push({ name, id: ident, desc: o.desc || '' });
  const parts = [];
  if (o.desc) parts.push(tag('comment', {}, esc(o.desc)));
  if (o.constraints?.length) parts.push(wrap('constraints', o.constraints));
  if (o.profiles?.length) parts.push(wrap('profiles', o.profiles));
  if (o.rules?.length) parts.push(wrap('rules', o.rules));
  if (o.infoLinks?.length) parts.push(wrap('infoLinks', o.infoLinks));
  if (o.modifiers?.length) parts.push(wrap('modifiers', o.modifiers));
  if (o.categoryLinks?.length) parts.push(wrap('categoryLinks', o.categoryLinks));
  if (o.entries?.length) parts.push(wrap('selectionEntries', o.entries));
  if (o.groups?.length) parts.push(wrap('selectionEntryGroups', o.groups));
  if (o.links?.length) parts.push(wrap('entryLinks', o.links));
  if (o.cost !== undefined) parts.push(costXml(o.cost));
  return tag('selectionEntry', { id: ident, name, hidden: 'false', collective: 'false', import: 'true', type }, parts.join(''));
}
function group(name, ident, o = {}) {
  const parts = [];
  if (o.constraints?.length) parts.push(wrap('constraints', o.constraints));
  if (o.entries?.length) parts.push(wrap('selectionEntries', o.entries));
  if (o.modifiers?.length) parts.push(wrap('modifiers', o.modifiers));
  return tag('selectionEntryGroup', { id: ident, name, hidden: 'false', collective: 'false', import: 'true', defaultSelectionEntryId: o.def }, parts.join(''));
}
function ruleXml(name, desc, seed) {
  return tag('rule', { id: cid('r|' + seed + '|' + name), name, hidden: 'false' }, tag('description', {}, esc(desc)));
}


// grantsRule handling: object -> inline rule; weapon name -> profile link; "Name: text" -> inline rule; else rule link
function grant(r, seed) {
  if (r && typeof r === 'object') return { rule: ruleXml(r.name, r.description || STUB, seed) };
  const i = r.indexOf(':');
  if (wp[r]) return { link: tag('infoLink', { id: cid('gl|' + seed + '|' + r), name: r, hidden: 'false', targetId: wpIds[r], type: 'profile' }) };
  if (i > 0 && i < 60) return { rule: ruleXml(r.slice(0, i).trim(), r.slice(i + 1).trim(), seed) };
  return { link: ruleLink(r, seed) };
}

// parse armyRulesText into [{name, text}]
function parseArmyRules(text) {
  const lines = text.split('\n'), out = []; let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i], nextNonBlank = lines.slice(i + 1).find(x => x.trim());
    if (l.trim() && !l.trim().startsWith('-') && nextNonBlank && /^-\s*Effect/i.test(nextNonBlank.trim()) && !/^(Reminder|Example)/i.test(l.trim())) {
      cur = { name: l.trim(), lines: [] }; out.push(cur); continue;
    }
    if (cur) cur.lines.push(l);
  }
  return out.map(r => ({ name: r.name, text: r.lines.join('\n').replace(/^\s*-\s*Effect:\s*/i, '').trim() }));
}
// leader requirement text from source
function leaderReqs(idStr) {
  const start = SRC.indexOf(`id: "${idStr}"`);
  if (start < 0) return [];
  const rest = SRC.slice(start + 5);
  const nx = rest.search(/\n\s*id:\s*"/);
  const block = rest.slice(0, nx < 0 ? 4000 : nx);
  const out = [];
  const re = /issues\.push\(\s*([`"'])((?:\\.|(?!\1)[^\\])*)\1\s*\)/g; let m;
  while ((m = re.exec(block))) out.push(m[2].replace(/\s*Current:\s*\$\{[^}]*\}/g, '').replace(/\$\{[^}]*\}/g, '?').replace(/\\"/g, '"'));
  return out;
}


// ---------- armoury ----------
const ARM = {}; for (const f of Object.keys(O.ARMOURY_DEFS)) for (const d of O.ARMOURY_DEFS[f]) (ARM[f] = ARM[f] || {})[d.id] = d;
const hasRuleName = (u, n) => u.specialRules.some(r => (typeof r === 'string' ? r.split(':')[0].trim() : r.name) === n);
const lc = x => String(x || '').toLowerCase().replace(/[’‘]/g, "'");
const inList = (u) => u.type === 'Infantry' || u.type === 'Team' || u.type === 'Artillery';
const armouryReport = [];
function armouryFor(fac, arr, u, k) {
  const A = ARM[fac]; if (!A) return [];
  const { uid, vets, vetIds, extraId, baseMen, maxMen, docIds, perModelMods, ctx } = k;
  const isUnit = u.baseMen !== undefined;
  const links = [];
  const existing = new Set(Object.keys((u.options || {}).squadUpgrades || {}).concat(Object.keys((u.options || {}).weaponUpgrades || {})));
  const notVet = (v) => vets.includes(v) ? [hideWhen([condAtLeast(vetIds[v], uid, 'lessThan')])] : null; // hide unless vet chosen
  const need = (idv, type = 'lessThan') => hideWhen([condAtLeast(idv, uid, type)]);
  const add = (def, { mods = [], perModel = false, extraDesc = '', extraRules = [], extraLinks = [] }) => {
    if (existing.has(def.label)) { armouryReport.push(`${fac}: ${u.name} already has "${def.label}" upgrade, armoury copy skipped`); return; }
    const eid = cid('arm|' + def.id + '|' + uid);
    const il = (def.grantsRules || []).map(r => grant(r, eid).link).filter(Boolean).concat(extraLinks);
    const all = [...mods];
    if (perModel) all.push(...perModelMods(def.cost));
    k.entries.push(entry('upgrade', def.label, eid, {
      cost: perModel ? def.cost * baseMen : def.cost, modifiers: all, infoLinks: il, rules: extraRules,
      constraints: [con('max', 1, 'parent', 'arm' + eid)],
      desc: `Armoury item. ${perModel ? def.cost + ' pts per model.' : 'Flat ' + def.cost + ' pts.'} ${extraDesc}`.trim()
    }));
    return eid;
  };
  const doctrineGate = (dn) => docIds[dn] ? [need(docIds[dn])] : null;

  if (fac === 'UNSC') {
    const d = A.mjolnirSystems;
    if (inList(u) && isUnit) {
      if (lc(u.name).includes('spartan')) add(d, { perModel: true });
      else if (docIds.Spartan) add(d, { perModel: true, mods: doctrineGate('Spartan') });
    }
    const x = A.xm20pGrenades;
    if (u.name === 'Grenade Launcher Team') {
      const eid = cid('arm|' + x.id + '|' + uid), conId = cid('xm20pmax');
      const cmds = O.UNSC_UNITS.filter(c => /platoon commander/i.test(c.name) || hasRuleName(c, 'Platoon Commander'));
      const mods = cmds.map(c => tag('modifier', { type: 'increment', field: conId, value: '1' },
        wrap('repeats', [tag('repeat', { value: '1', repeats: '1', field: 'selections', scope: 'force', childId: ctx.uids['UNSC_UNITS|' + c.name], shared: 'true', roundUp: 'false', includeChildSelections: 'false', includeChildForces: 'false' })])));
      k.entries.push(entry('upgrade', x.label, eid, {
        cost: x.cost, modifiers: mods, infoLinks: (x.grantsRules || []).map(r => grant(r, eid).link),
        constraints: [tag('constraint', { type: 'max', value: '0', field: 'selections', scope: 'force', shared: 'true', id: conId })],
        desc: 'Armoury item. Flat 5 pts. Limit: one per Platoon Commander in the army.'
      }));
    }
  }
  if (fac === 'Covenant') {
    const r = A.sacredRelic;
    const eliteByName = /elite|honou?r guard/.test(lc(u.name));
    if (isUnit && vets.includes('Veteran') && maxMen > 1 && (eliteByName || docIds.Elite)) {
      const mods = [need(vetIds.Veteran)];
      if (!eliteByName) mods.push(need(docIds.Elite));
      if (baseMen === 1) mods.push(need(k.extraId, 'lessThan'));
      links.push(tag('entryLink', { id: cid('arml|relic|' + uid), name: r.label, hidden: 'false', collective: 'false', import: 'true', targetId: ctx.relicId, type: 'selectionEntry' }, wrap('modifiers', mods)));
    }
    const b = A.swordsBansheeShieldedHull;
    if (u.name === 'Type-26 Banshee') add(b, { mods: [hideWhen([condAtLeast(ctx.variantIds['Swords of Sanghelios'], 'force', 'lessThan')])] });
    const p = A.plasmaCapacitorCells;
    if (isUnit && inList(u) && u.type !== 'Artillery' && vets.includes('Veteran') && !hasRuleName(u, 'Team Weapon')) add(p, { perModel: true, mods: [need(vetIds.Veteran)] });
  }
  if (fac === 'Banished') {
    const m = /(\d+)\+/.exec(u.damageValue || '');
    if (!isUnit && m && +m[1] >= 7 && u.type !== 'Walker' && u.type !== 'Aircraft') add(A.scrapArmourScreens, {});
    if (isUnit && u.type === 'Infantry' && vets.includes('Veteran')) {
      const bn = /brute|atriox/.test(lc(u.name));
      if (bn) add(A.trophyPlateHarness, { perModel: true, mods: [need(vetIds.Veteran)] });
      else if (docIds.Brute) add(A.trophyPlateHarness, { perModel: true, mods: [need(vetIds.Veteran), need(docIds.Brute)] });
    }
    if (u.name === 'Grenade Launcher Team') {
      if (docIds.Brute) add(A.bruteGrenadiers, { mods: [need(docIds.Brute)] });
      else armouryReport.push('Banished Grenade Launcher Team has no Brute doctrine; Brute Grenadiers skipped');
    }
  }
  if (fac === 'Flood') {
    if (u.name === 'Carrier Form Team') {
      const d = A.volatileBiomass, eid = cid('arm|' + d.id + '|' + uid);
      const vb = tag('infoLink', { id: cid('arml|vbprof|' + uid), name: 'Volatile Biomass', hidden: 'false', targetId: wpIds['Volatile Biomass'], type: 'profile' });
      const rules = [
        ruleXml('Volatile Biomass', "If this model is destroyed, the enemy unit it is fighting in close quarters suffers a HE (2\") hit. Being Down does not halve hits for this attack.", eid),
        ruleXml('Suicide Charge', "If this model successfully assaults an enemy unit, it is immediately destroyed, and Volatile Biomass takes effect. Additionally, while this unit is on Ambush, if an enemy Infantry or Artillery unit ends a movement within 6\" and line of sight of it, instead of firing, you may immediately flip its Ambush order to Run and declare an assault against that enemy unit before it has a chance to fire.", eid)];
      k.entries.push(entry('upgrade', d.label, eid, { cost: d.cost, infoLinks: [vb], rules, constraints: [con('max', 1, 'parent', 'arm' + eid)], desc: 'Armoury item. Flat 5 pts. Replaces the Explosive Biomass weapon profile and rule (HE 1" becomes HE 2") and the Suicide Charge text. If taken, use these in place of the base versions.' }));
    }
    if (isUnit && inList(u)) add(A.sporeCloud, { perModel: true });
    if (isUnit && u.type === 'Infantry' && String(u.name).includes('Officer')) add(A.burrowingTendrils, { perModel: true });
  }
  if (fac === 'Forerunner') {
    if (isUnit && hasRuleName(u, 'Composed Beings')) add(A.reconstructionMatrix, { perModel: true });
    if (isUnit && (u.type === 'Infantry' || u.type === 'Team')) add(A.hardLightCalibration, { perModel: true, extraDesc: 'While taken, all of this unit\'s weapons gain the Cover Piercing weapon rule (except melee/unarmed).' });
    if (isUnit && (hasRuleName(u, 'Automaton') || hasRuleName(u, 'Composed Beings') || hasRuleName(u, 'Composed Being'))) add(A.translocationDeployment, { perModel: true });
  }
  return links;
}


// ---------- army validation ----------
const legalSkirmisher = n => { n = lc(n); return n.includes('officer - platoon commander') || n.includes('forward observer') || n === 'sniper team'; };
const legalRecon = n => ['engineer squad', 'anti tank team', 'anti-tank team', 'machine gun team', 'grenade launcher team'].includes(lc(n));

const ROLE_NAMES = {
  PC: 'Platoon Commander', RINF: 'Rifle Platoon Infantry', RIFLE: 'Transport Allowance Unit', TRANS: 'Transport',
  CV: 'Combat Vehicle', CMDV: 'Command Vehicle', MEDIC: 'Medic', OBS: 'Forward Observer / Watcher', SPIRIT: 'Chaplain / Bloodhandler',
  COCMD: 'Company Commander', DEACON: 'Deacon', CHAMP: 'Champion', KNIGHT: 'Knight Commander', JKM: 'Juggernaut Key Mind',
  SKIRM: 'Skirmisher Doctrine Unit', RECON: 'Recon Doctrine Unit', JSKIRM: 'Jackal Skirmishers',
  ODST_INF: 'ODST Infantry', ODST_PC: 'ODST Platoon Commander', TM_INF: 'Trooper or Marine Infantry', TM_PC: 'Trooper or Marine Platoon Commander',
  NFT: 'Ground Transport Vehicle', NFT7: 'Ground Transport Vehicle (DV 7+)', MAR_INF: 'Marine Infantry', MAR_PC: 'Marine Platoon Commander',
  SPARTAN: 'Spartan Unit', SPARTAN_CC: 'Spartan Company Commander', LINF: 'Infantry or Team', ELITE_INF: 'Elite Infantry', ELITE_PC: 'Elite Platoon Commander',
  BRUTE_INF: 'Brute Infantry', BRUTE_PC: 'Brute Platoon Commander', GRUNT_INF: 'Grunt Infantry', JACKAL_INF: 'Jackal Infantry',
  GRUNT_CC: 'Grunt Company Commander', NONGRUNT: 'Non-Grunt Infantry or Artillery', OTHER: 'Grunt, Jackal or Elite Infantry',
  CFODDER: 'Caste System: Cannon Fodder', HUNTER4: 'Hunter Pack of 4', SKITTER: 'Skitterer',
  FSPECIAL: 'Tank Form Pack, Spawner Form or Stalker Form Swarm', FFORBID: 'Unit Barred by Feral Outbreak',
  COMPOSED: 'Composed Beings Infantry', WARPROM: 'Warrior-Servant or Promethean Soldier', MONCC: 'Monitor Company Commander',
  AUTOM: 'Automaton Infantry', FLAME: 'Flamethrower Unit'
};
const MEMO = {};
const stableId = key => MEMO[key] || (MEMO[key] = id(key));
const roleId = k => stableId('role|' + k);
const leaderCatId = (army, lid) => stableId('leadercat|' + army + '|' + lid);
const CORE_ROLES = ['PC', 'RINF', 'RIFLE', 'TRANS', 'CV', 'CMDV', 'MEDIC', 'OBS', 'SPIRIT', 'COCMD', 'DEACON', 'CHAMP', 'KNIGHT', 'JKM', 'SKIRM', 'RECON', 'JSKIRM'];
// leader requirements, ported from the HTML's LEADER_DEFS validate functions
const LEADER_REQS = {
  cutter: [['ODST_INF', 'min', 4], ['ODST_PC', 'min', 1]],
  forge: [['TM_INF', 'min', 4], ['TM_PC', 'min', 1], ['NFT', 'min', 2], ['NFT7', 'min', 1]],
  johnson: [['MAR_INF', 'min', 4], ['MAR_PC', 'min', 1]],
  jerome: [['SPARTAN', 'min', 2], ['SPARTAN_CC', 'min', 1], ['MAR_INF', 'min', { per: 'SPARTAN', offset: -2 }]],
  regret: [['LINF', 'min', 3], ['ELITE_PC', 'min', 1], ['GRUNT_INF', 'min', 1], ['JACKAL_INF', 'min', 1]],
  ripa: [['ELITE_INF', 'min', 4], ['ELITE_PC', 'min', 1], ['BRUTE_INF', 'max', 0]],
  tartarus: [['BRUTE_INF', 'min', 4], ['BRUTE_PC', 'min', 1], ['ELITE_INF', 'max', 0]],
  yapyap: [['CFODDER', 'min', 1], ['GRUNT_INF', 'min', 4], ['GRUNT_CC', 'min', 1], ['DEACON', 'min', 1], ['NONGRUNT', 'max', 0]],
  atriox: [['LINF', 'min', 4], ['BRUTE_PC', 'min', 1], ['OTHER', 'min', 1]],
  colony: [['HUNTER4', 'min', 1], ['SKITTER', 'min', 2]],
  jega: [['ELITE_INF', 'min', 3], ['ELITE_PC', 'min', 1], ['BRUTE_INF', 'max', { per: 'ELITE_INF', offset: 0 }]],
  decimus: [['BRUTE_INF', 'min', 4], ['BRUTE_PC', 'min', 1], ['ELITE_INF', 'max', { per: 'BRUTE_INF', offset: 0 }]],
  gravemind: [['COCMD', 'min', 1], ['FSPECIAL', 'min', 2]],
  feralOutbreak: [['COCMD', 'max', 0], ['FFORBID', 'max', 0]],
  didact: [['COMPOSED', 'min', 4], ['KNIGHT', 'min', 1], ['WARPROM', 'min', 1]],
  guiltySpark: [['KNIGHT', 'max', 0], ['MONCC', 'min', 1], ['AUTOM', 'min', 3]],
  kinsano: [['LINF', 'min', 4], ['FLAME', 'min', 2]],
  thelVadam: [['ELITE_INF', 'min', 3], ['ELITE_PC', 'min', 1]],
};
const FAC_ARMIES = { UNSC: ['UNSC', 'Insurrection'], Covenant: ['Covenant', 'Swords of Sanghelios'], Banished: ['Banished'], Forerunner: ['Forerunner'], Flood: ['Flood'] };
const FAC_ROLES = {};
for (const [fac, armies] of Object.entries(FAC_ARMIES)) {
  const set = new Set(CORE_ROLES);
  for (const a of armies) for (const L of (O.LEADER_DEFS[a] || [])) for (const [r, , v] of (LEADER_REQS[L.id] || [])) { set.add(r); if (v && v.per) set.add(v.per); }
  FAC_ROLES[fac] = set;
}
const unknownLeaders = [];
for (const a of Object.keys(O.LEADER_DEFS)) for (const L of O.LEADER_DEFS[a]) if (!LEADER_REQS[L.id]) unknownLeaders.push(a + '/' + L.id);

// boolean expressions over selections -> BattleScribe conditions
const XT = { t: 1 }, XF = { f: 1 };
const xb = v => v ? XT : XF;
const xa = c => ({ a: c });
function xand(...xs) { xs = xs.flat(); if (xs.some(x => x === XF)) return XF; xs = xs.filter(x => x !== XT); if (!xs.length) return XT; return xs.length === 1 ? xs[0] : { and: xs }; }
function xor(...xs) { xs = xs.flat(); if (xs.some(x => x === XT)) return XT; xs = xs.filter(x => x !== XF); if (!xs.length) return XF; return xs.length === 1 ? xs[0] : { or: xs }; }
function xnot(x) {
  if (x === XT) return XF; if (x === XF) return XT;
  if (x.a) return xa({ ...x.a, type: x.a.type === 'atLeast' ? 'lessThan' : 'atLeast' });
  if (x.and) return xor(...x.and.map(xnot));
  return xand(...x.or.map(xnot));
}
const condXml = c => tag('condition', { type: c.type, value: String(c.value), field: 'selections', scope: c.scope, childId: c.childId, shared: 'true', includeChildSelections: c.ics, includeChildForces: 'false' });
function groupXml(x) {
  const items = x.and || x.or;
  return tag('conditionGroup', { type: x.and ? 'and' : 'or' }, wrap('conditions', items.filter(i => i.a).map(i => condXml(i.a))) + wrap('conditionGroups', items.filter(i => !i.a).map(groupXml)));
}
const condsXml = x => x.a ? wrap('conditions', [condXml(x.a)]) : wrap('conditionGroups', [groupXml(x)]);

function unitRoles(fac, u, k) {
  const { uid, kids, docIds, extraId, baseMen, maxMen } = k;
  const nm = lc(u.name), has = t => nm.includes(t);
  const rule = n => hasRuleName(u, n);
  const sel = i => xa({ type: 'atLeast', value: 1, childId: i, scope: uid, ics: 'true' });
  const kid = re => xor(...kids.filter(c => re.test(c.name)).map(c => sel(c.id)));
  const doc = n => docIds[n] ? sel(docIds[n]) : XF;
  const menAtLeast = n => baseMen >= n ? XT : (extraId && maxMen >= n ? xa({ type: 'atLeast', value: n - baseMen, childId: extraId, scope: uid, ics: 'false' }) : XF);
  const type = u.type, slot = String(u.forceOrgSlot || '').toLowerCase();
  const infU = xb(type === 'Infantry' || type === 'Team');
  const art = xb(type === 'Artillery');
  const vehicle = !['Infantry', 'Team', 'Artillery'].includes(type);

  const DEACON = xor(xb(has('deacon') || rule('Deacon')), kid(/Deacon/));
  const CHAMP = xor(xb(has('champion') || rule('Champion')), kid(/Champion/));
  const KNIGHT = xor(xb(has('knight commander') || rule('Knight Commander')), kid(/Knight Commander/));
  const JKM = xor(xb(rule('Juggernaut Key Mind')), kid(/^Juggernaut Key Mind$/));
  const PC = xand(xnot(DEACON), xnot(CHAMP), xor(xb(rule('Platoon Commander') || /^platoon[-_ ]?commander$/.test(slot)), KNIGHT, JKM));
  const supportHQ = ['HQ Choice', 'Company Commander', 'Medic', 'Forward Observer', 'Chaplain', 'Bloodhandler', 'Watcher'].some(rule) ||
    ['company commander', 'medic', 'forward observer', 'observer', 'chaplain', 'bloodhandler', 'watcher', 'attached leader'].some(has);
  const TRANS = xb(slot === 'transport');
  const COCMD = xb(rule('Company Commander') || has('company commander'));
  const R = {
    PC, DEACON, CHAMP, KNIGHT, JKM, TRANS, COCMD,
    RINF: xand(xb(type === 'Infantry' && !supportHQ), xnot(PC)),
    RIFLE: xand(xnot(TRANS), xb(!supportHQ), xor(PC, xb(['Infantry', 'Team', 'Artillery'].includes(type)))),
    CV: xand(xb(vehicle), xnot(TRANS), xnot(JKM)),
    MEDIC: xb(rule('Medic') || has('medic')),
    OBS: xb(rule('Forward Observer') || rule('Watcher') || has('forward observer') || has('observer') || has('watcher')),
    SPIRIT: xb(rule('Chaplain') || rule('Bloodhandler') || has('chaplain') || has('bloodhandler')),
    SKIRM: doc('Skirmisher'), RECON: doc('Recon'),
    JSKIRM: u.name === 'Jackal Squad' ? kid(/^Skirmishers$/) : XF,
  };
  R.CMDV = xand(R.CV, xor(xb(rule('Command Vehicle')), kid(/^Command Vehicle$/)));
  // leader roles
  const defaultDoc = docIds._default ? sel(docIds._default) : XT;   // "no doctrine chosen"
  R.LINF = infU;
  R.ODST_INF = xand(infU, xor(doc('ODST'), xb(has('odst'))));
  R.ODST_PC = xand(R.ODST_INF, PC);
  R.MAR_INF = xand(infU, xor(doc('Marine'), xb(has('marine'))));
  R.MAR_PC = xand(R.MAR_INF, PC);
  R.TM_INF = xand(infU, xor(defaultDoc, doc('Marine'), xb(has('marine'))));
  R.TM_PC = xand(PC, xor(docIds._default ? sel(docIds._default) : XF, doc('Marine'), xb(has('marine') || has('platoon commander'))));
  const capacity = Number(u.transportCapacity || 0) > 0;
  const flying = type === 'Aircraft' || ['banshee', 'phantom', 'falcon', 'pelican', 'aircraft'].some(has);
  const dv = Number((/(\d+)\+/.exec(u.damageValue || '') || [])[1] || 0);
  R.NFT = xb(vehicle && !flying && capacity);
  R.NFT7 = xb(vehicle && !flying && capacity && dv >= 7);
  R.SPARTAN = xand(infU, xor(doc('Spartan'), xb(has('spartan'))));
  R.SPARTAN_CC = xand(R.SPARTAN, COCMD);
  R.ELITE_INF = xand(infU, xor(doc('Elite'), xb(has('elite') || has('honor guard') || has('honour guard'))));
  R.ELITE_PC = xand(R.ELITE_INF, PC);
  R.BRUTE_INF = xand(infU, xor(doc('Brute'), xb(has('brute') || has('atriox'))));
  R.BRUTE_PC = xand(R.BRUTE_INF, PC);
  const gruntText = /grunt|jackal|skirmisher/.test((u.name + ' ' + JSON.stringify(u.specialRules)).toLowerCase());
  const covDoc = (fac === 'Covenant' || fac === 'Banished') && docIds._default;
  R.GRUNT_INF = xand(infU, xor(xb(gruntText), covDoc ? sel(docIds._default) : XF, doc('Skirmisher')));
  R.JACKAL_INF = xand(infU, xb(has('jackal')));
  R.GRUNT_CC = xand(R.GRUNT_INF, COCMD);
  R.NONGRUNT = xand(xor(infU, art), xnot(R.GRUNT_INF), xb(!has('grunt')));
  R.OTHER = xor(R.GRUNT_INF, R.JACKAL_INF, R.ELITE_INF);
  R.HUNTER4 = has('hunter pack') ? menAtLeast(4) : XF;
  R.SKITTER = xb(has('skitterer'));
  R.FSPECIAL = xb(['tank form pack', 'spawner form', 'stalker form swarm'].some(has));
  R.FFORBID = xb(['tank form pack', 'spawner form', 'stalker form swarm', 'juggernaut', 'abomination'].some(has));
  R.COMPOSED = xand(infU, xb(rule('Composed Beings') || has('warrior-servant') || has('promethean')));
  R.WARPROM = xb(has('warrior-servant') || has('promethean soldier'));
  R.MONCC = xand(COCMD, xb(has('monitor') || has('company commander')));
  R.AUTOM = xand(infU, xb(rule('Automaton') || has('sentinel') || has('crawler')));
  const flameStatic = /flamethrower/i.test(JSON.stringify([u.weapons, u.specialRules]));
  R.FLAME = xor(xb(flameStatic), ...kids.filter(c => /flamethrower/i.test(c.name + ' ' + c.desc)).map(c => sel(c.id)));

  const links = [], mods = [];
  for (const key of FAC_ROLES[fac]) {
    if (key === 'CFODDER') continue;
    const x = R[key];
    if (!x) throw new Error('no role expr ' + key);
    if (x === XF) continue;
    if (x === XT) links.push(tag('categoryLink', { id: cid('rl|' + uid + '|' + key), name: ROLE_NAMES[key], hidden: 'false', targetId: roleId(key), primary: 'false' }));
    else mods.push(tag('modifier', { type: 'add', field: 'category', value: roleId(key) }, condsXml(x)));
  }
  return { links, mods };
}

// "Limited" special rules -> constraints on the unit itself
const limitedReport = [];
function limitedConstraints(u, uid) {
  const texts = u.specialRules.map(r => typeof r === 'string' ? r : (r.name + (r.description ? ': ' + r.description : '')))
    .filter(t => /^Limited\b/i.test(t) || /\bLimited:/i.test(t))
    .filter(t => !/Knight Commander|Juggernaut Key Mind|Deacon|Champion/i.test(t));
  let armyMax = null, platMax = null;
  for (const t of texts) {
    const tm = t.match(/only\s+(?:up to\s+)?(\d+)\s+in total per army/i) || t.match(/only\s+(?:up to\s+)?(\d+).*per army/i);
    if (tm) armyMax = armyMax === null ? +tm[1] : Math.min(armyMax, +tm[1]);
    let pm = t.match(/only\s+(?:up to\s+)?(\d+).*per platoon/i);
    const pv = pm ? +pm[1] : (/per platoon/i.test(t) ? 1 : null);
    if (pv !== null) platMax = platMax === null ? pv : Math.min(platMax, pv);
  }
  const out = [];
  if (armyMax !== null) out.push(tag('constraint', { type: 'max', value: String(armyMax), field: 'selections', scope: 'force', shared: 'true', id: cid('limarmy|' + uid), includeChildSelections: 'false', includeChildForces: 'false' }));
  if (platMax !== null) {
    const cidp = cid('limplat|' + uid);
    out.push(tag('constraint', { type: 'max', value: '0', field: 'selections', scope: 'force', shared: 'true', id: cidp, includeChildSelections: 'false', includeChildForces: 'false' }));
    KIDS_MODS_FOR[uid] = [perPC(cidp, platMax, 'force'), unlimitedIfNoPC(cidp, 'force')];
  }
  if (armyMax !== null || platMax !== null) limitedReport.push(`${u.name}: ${armyMax !== null ? 'max ' + armyMax + ' per army' : ''}${armyMax !== null && platMax !== null ? ', ' : ''}${platMax !== null ? 'max ' + platMax + ' per Platoon Commander' : ''}`);
  return out;
}
const KIDS_MODS_FOR = {};
const catRepeat = (catKey, every = 1, roundUp = false) => tag('repeat', { value: String(every), repeats: '1', field: 'selections', scope: 'force', childId: roleId(catKey), shared: 'true', roundUp: String(roundUp), includeChildSelections: 'false', includeChildForces: 'false' });
const catCond = (catIdv, type = 'atLeast', value = 1) => tag('condition', { type, value: String(value), field: 'selections', scope: 'force', childId: catIdv, shared: 'true', includeChildSelections: 'false', includeChildForces: 'false' });
const perPC = (field, n) => tag('modifier', { type: 'increment', field, value: String(n) }, wrap('repeats', [catRepeat('PC')]));
const unlimitedIfNoPC = (field) => tag('modifier', { type: 'set', field, value: '-1' }, wrap('conditions', [catCond(roleId('PC'), 'lessThan', 1)]));

// force-level categories and constraints (game system)
function validationCategoryEntries() {
  const out = Object.keys(ROLE_NAMES).map(k => tag('categoryEntry', { id: roleId(k), name: ROLE_NAMES[k], hidden: 'false' }));
  for (const a of Object.keys(O.LEADER_DEFS)) for (const L of O.LEADER_DEFS[a]) out.push(tag('categoryEntry', { id: leaderCatId(a, L.id), name: 'Leader: ' + L.name, hidden: 'false' }));
  return out;
}
function validationForceLinks() {
  const cons = {}; // role -> [constraint xml]
  const add = (k, xml) => (cons[k] = cons[k] || []).push(xml);
  const C = (k, type, value, mods = []) => {
    const cidv = id('vcon|' + k + '|' + type + '|' + value + '|' + (cons[k] || []).length);
    let xml = tag('constraint', { type, value: String(value), field: 'selections', scope: 'parent', shared: 'true', id: cidv, includeChildSelections: 'false', includeChildForces: 'false' });
    add(k, { xml, id: cidv, mods: typeof mods === 'function' ? mods(cidv) : mods });
  };
  C('PC', 'min', 1);
  C('RINF', 'min', 2, f => [perPC(f, 2), tag('modifier', { type: 'decrement', field: f, value: '2' }, wrap('conditions', [catCond(roleId('PC'), 'atLeast', 1)]))]);
  C('TRANS', 'max', 0, f => [tag('modifier', { type: 'increment', field: f, value: '1' }, wrap('repeats', [catRepeat('RIFLE')]))]);
  C('CV', 'min', 0, f => [tag('modifier', { type: 'set', field: f, value: '2' }, wrap('conditions', [catCond(roleId('CV'), 'atLeast', 1)]))]);
  C('CMDV', 'min', 0, f => [tag('modifier', { type: 'increment', field: f, value: '1' }, wrap('repeats', [catRepeat('CV', 5, true)]))]);
  for (const k of ['DEACON', 'CHAMP', 'KNIGHT', 'JKM', 'COCMD']) C(k, 'max', 1);
  for (const k of ['MEDIC', 'OBS', 'SPIRIT']) C(k, 'max', 0, f => [perPC(f, 1), unlimitedIfNoPC(f)]);
  C('SKIRM', 'max', 4);
  C('SKIRM', 'max', 0, f => [perPC(f, 2), unlimitedIfNoPC(f)]);
  C('RECON', 'max', 2);
  C('JSKIRM', 'max', 2);
  for (const a of Object.keys(O.LEADER_DEFS)) for (const L of O.LEADER_DEFS[a]) {
    const lc_ = leaderCatId(a, L.id);
    const when = catCond(lc_);
    for (const [k, type, v] of (LEADER_REQS[L.id] || [])) {
      if (typeof v === 'number') {
        C(k, type, type === 'min' ? 0 : -1, f => [tag('modifier', { type: 'set', field: f, value: String(v) }, wrap('conditions', [when]))]);
      } else {
        C(k, type, type === 'min' ? 0 : -1, f => [
          ...(type === 'max' ? [tag('modifier', { type: 'set', field: f, value: '0' }, wrap('conditions', [when]))] : []),
          tag('modifier', { type: 'increment', field: f, value: '1' }, wrap('repeats', [catRepeat(v.per)]) + wrap('conditions', [when])),
          ...(v.offset ? [tag('modifier', { type: v.offset < 0 ? 'decrement' : 'increment', field: f, value: String(Math.abs(v.offset)) }, wrap('conditions', [when]))] : [])
        ]);
      }
    }
  }
  return Object.keys(ROLE_NAMES).map(k => {
    const list = cons[k] || [];
    const mods = list.flatMap(c => c.mods);
    return tag('categoryLink', { id: id('vcl|' + k), name: ROLE_NAMES[k], hidden: 'false', targetId: roleId(k), primary: 'false' },
      wrap('constraints', list.map(c => c.xml)) + wrap('modifiers', mods));
  });
}

// ---------- unit builder ----------
const TRIGGER = { UNSC: 'For Humanity’s Survival!', Covenant: 'For The Great Journey!', Banished: 'Forged In Chains' };
const DOCT = { UNSC: O.UNSC_DOCTRINES, Covenant: O.COVENANT_DOCTRINES, Banished: O.BANISHED_DOCTRINES };

function buildUnit(fac, arr, u, ctx) {
  KIDS = [];
  const uid = ctx.uids[arr + '|' + u.name] || cid('unit|' + arr + '|' + u.name);
  const isInf = u.baseMen !== undefined;
  const vets = u.allowedVeterancy;
  const baseMen = u.baseMen ?? 1, maxMen = u.maxMen ?? baseMen;
  const o = u.options || {};
  const notes = [];
  // veterancy
  const vetIds = {};
  const vetEntries = vets.map(v => { vetIds[v] = cid(`vet|${uid}|${v}`); return entry('upgrade', v, vetIds[v], { cost: u.costs[v], constraints: [con('max', 1, 'parent', 'vet' + uid + v)] }); });
  const groups = [group('Veterancy', cid('g|vet|' + uid), { entries: vetEntries, def: vetIds[vets.includes('Regular') ? 'Regular' : vets[0]], constraints: [con('min', 1, 'parent', 'vmin' + uid), con('max', 1, 'parent', 'vmax' + uid)] })];
  const entries = [];
  // extra men
  let extraId = null;
  if (isInf && maxMen > baseMen && o.extraMenCost) {
    extraId = cid('extra|' + uid);
    const ec = o.extraMenCost, first = vets[0];
    const mods = vets.slice(1).map(v => modSet(PTS, ec[v], [condAtLeast(vetIds[v], uid)]));
    entries.push(entry('upgrade', 'Additional Models', extraId, {
      cost: ec[first], modifiers: mods, constraints: [con('max', maxMen - baseMen, 'parent', 'extra' + uid)],
      desc: `Add up to ${maxMen - baseMen} extra models (unit starts with ${baseMen}, max ${maxMen}).`
    }));
  }
  const perModelMods = (per) => extraId ? [tag('modifier', { type: 'increment', field: PTS, value: String(per) }, wrap('repeats', [tag('repeat', { value: '1', repeats: '1', field: 'selections', scope: uid, childId: extraId, shared: 'true', roundUp: 'false', includeChildSelections: 'true', includeChildForces: 'false' })]))] : [];

  // rules & weapons
  const rules = [], links = [], profiles = [], linkedRules = new Set(), seenW = new Set();
  const addRuleLink = n => { n = n.trim(); if (!linkedRules.has(n)) { linkedRules.add(n); links.push(ruleLink(n, uid)); } };
  const addWeapon = (label, target = { profiles, links }, ent = null) => {
    if (seenW.has(label)) return; seenW.add(label);
    const exact = wp[label];
    if (exact) {
      target.links.push(tag('infoLink', { id: cid('wl|' + uid + '|' + label + (ent || '')), name: label, hidden: 'false', targetId: wpIds[label], type: 'profile' }));
      linkWeaponSpecials(exact);
    } else {
      const b = baseWeapon(label);
      if (!b) { unmatchedWeapons.add(label); target.profiles.push(weaponProfileXml(cid('wp|' + uid + '|' + label + (ent || '')), label, { Range: '–', Shots: '–', Pen: '–', Special: 'Close combat weapon' })); return; }
      target.profiles.push(weaponProfileXml(cid('wp|' + uid + '|' + label + (ent || '')), label, parseProf(wp[b])));
      linkWeaponSpecials(wp[b]);
    }
  };
  const linkWeaponSpecials = (p) => {
    const sp = parseProf(p).Special;
    sp.split(/,(?![^(]*\))/).map(t => t.trim().replace(/\s*\(.*\)$/, '')).forEach(t => { if (t && t !== '–' && wd[t]) addRuleLink(t); });
  };
  for (const w of u.weapons) addWeapon(w.name);
  const addUnitRule = (r) => {
    if (typeof r === 'object') { rules.push(ruleXml(r.name, r.description || STUB, uid)); return; }
    const i = r.indexOf(':');
    if (i > 0 && i < 60) rules.push(ruleXml(r.slice(0, i).trim(), r.slice(i + 1).trim(), uid)); else addRuleLink(r);
  };
  u.specialRules.forEach(addUnitRule);

  // unit profile
  const prof = tag('profile', { id: cid('up|' + uid), name: u.name, hidden: 'false', typeId: PT_UNIT, typeName: 'Unit' },
    wrap('characteristics', [
      tag('characteristic', { name: 'Type', typeId: CH.Type }, esc(u.type)),
      tag('characteristic', { name: 'Models', typeId: CH.Models }, isInf ? (maxMen > baseMen ? `${baseMen}–${maxMen}` : String(baseMen)) : '1'),
      tag('characteristic', { name: 'Damage Value', typeId: CH.DV }, esc(u.damageValue || '–')),
      tag('characteristic', { name: 'Transport', typeId: CH.Transport }, u.transportCapacity ? String(u.transportCapacity) : '–')]));
  profiles.unshift(prof);

  // doctrines
  const docIds = {}, suIds = {}, docUpIds = [];
  const trig = TRIGGER[fac];
  if (trig && u.specialRules.includes(trig) && DOCT[fac]) {
    const D = DOCT[fac];
    const dEntries = [], defId = cid('doc|default|' + uid);
    dEntries.push(entry('upgrade', D._defaultLabel || 'Default', defId, { cost: 0 }));
    for (const [dn, d] of Object.entries(D)) {
      if (dn === '_defaultLabel') continue;
      if (!d.allowedVeterancy.some(v => vets.includes(v))) continue;
      const did = cid('doc|' + dn + '|' + uid); docIds[dn] = did;
      const excl = vets.filter(v => !d.allowedVeterancy.includes(v)).map(v => condAtLeast(vetIds[v], uid));
      const mods = [...perModelMods(d.baseCostPerModel)];
      excl.forEach(c => mods.push(hideWhen([c])));
      const vis = ctx.doctrineHide?.[dn]; if (vis) mods.push(hideWhen([condAtLeast(vis, 'force')]));
      const dr = [], dl = [];
      (d.specialRules || []).forEach(n => dl.push(ruleLink(n, did)));
      const upg = (d.upgrades || []).map(up => {
        const uidd = cid('docup|' + dn + '|' + up.name + '|' + uid); docUpIds.push({ dn, up, id: uidd });
        const per = up.costPerModel;
        const flat = up.cost ?? up.costFlat ?? 0;
        return entry('upgrade', up.name, uidd, {
          cost: per ? per * baseMen : flat, modifiers: per ? perModelMods(per) : [],
          constraints: [con('max', 1, 'parent', 'du' + uidd)], infoLinks: up.grantsRule ? [grant(up.grantsRule, uidd).link].filter(Boolean) : [], rules: up.grantsRule ? [grant(up.grantsRule, uidd).rule].filter(Boolean) : [],
          desc: up.ncoOnly ? 'NCO/Officer only.' : up.replacesRule ? `Replaces ${up.replacesRule}.` : undefined
        });
      });
      const illegal = (dn === 'Skirmisher' && !legalSkirmisher(u.name)) || (dn === 'Recon' && !legalRecon(u.name));
      dEntries.push(entry('upgrade', illegal ? (d.illegalLabel || '(Illegal) ' + dn) : (d.label || dn), did, {
        cost: d.baseCostPerModel * baseMen, modifiers: mods, infoLinks: dl, entries: upg,
        constraints: [con('max', illegal ? 0 : 1, 'parent', 'd' + did)],
        desc: `Doctrine: +${d.baseCostPerModel} pts per model.` + (illegal ? (dn === 'Skirmisher' ? ' Not legal for this unit: Skirmisher is limited to Platoon Commander, Forward Observer and Sniper Team.' : ' Not legal for this unit: Recon is limited to Engineer Squad, Anti Tank Team, Machine Gun Team and Grenade Launcher Team.') : '')
      }));
    }
    if (dEntries.length > 1) docIds._default = defId;
    if (dEntries.length > 1) groups.push(group('Doctrine', cid('g|doc|' + uid), { entries: dEntries, def: defId, constraints: [con('min', 1, 'parent', 'dmin' + uid), con('max', 1, 'parent', 'dmax' + uid)] }));
  }

  // squad upgrades
  for (const [label, d] of Object.entries(o.squadUpgrades || {})) {
    const eid = cid('su|' + uid + '|' + label); suIds[label] = eid;
    const mods = [], desc = [];
    if (d.perModel) mods.push(...perModelMods(d.cost));
    if (d.allowedVeterancy) vets.filter(v => !d.allowedVeterancy.includes(v)).forEach(v => mods.push(hideWhen([condAtLeast(vetIds[v], uid)])));
    if (d.note) desc.push(d.note);
    if (d.condition) desc.push('Condition: ' + d.condition);
    if (d.replacesWeapon) desc.push('Replaces: ' + d.replacesWeapon);
    if (d.replacesRule) desc.push('Replaces rule: ' + (typeof d.replacesRule === 'object' ? JSON.stringify(d.replacesRule) : d.replacesRule));
    if (d.addMan) desc.push(`Adds ${d.addMan} model(s).`);
    if (d.requiresUpgrade) desc.push('Requires: ' + d.requiresUpgrade);
    if (d.requiresNoDoctrine) desc.push('Only available to units without a doctrine.');
    if (d.conflictsWith) desc.push('Cannot be combined with: ' + (Array.isArray(d.conflictsWith) ? d.conflictsWith.join(', ') : JSON.stringify(d.conflictsWith)));
    if (d.perModel) desc.push(`Costs ${d.cost} pts per model.`);
    const il = [], pr = [];
    const gr = d.grantsRule;
    const rr = [];
    if (gr) { const g = grant(gr, eid); if (g.rule) rr.push(g.rule); if (g.link) il.push(g.link); }
    entries.push(entry('upgrade', label, eid, { cost: d.perModel ? d.cost * baseMen : d.cost, modifiers: mods, infoLinks: il, rules: rr, constraints: [con('max', 1, 'parent', 'su' + eid)], desc: desc.join(' ') || undefined }));
  }
  // weapon replacements
  for (const [label, d] of Object.entries(o.weaponReplacements || {})) {
    const eid = cid('wr|' + uid + '|' + label);
    const t = { profiles: [], links: [] };
    if (d.grants) { if (wp[d.grants]) { t.links.push(tag('infoLink', { id: cid('wrl|' + eid), name: d.grants, hidden: 'false', targetId: wpIds[d.grants], type: 'profile' })); } }
    const desc = `Replace ${d.replaces} with ${d.grants}${d.requiresUpgrade ? ' (requires ' + d.requiresUpgrade + ')' : ''}. Up to ${d.max} per unit.`;
    entries.push(entry('upgrade', label, eid, { cost: d.cost, constraints: [con('max', d.max, 'parent', 'wr' + eid)], infoLinks: t.links, desc }));
  }
  // NCO replacement (+ M301 packages and leader melee combos)
  {
    let nco = o.ncoReplacement ? { options: [...o.ncoReplacement.options], costs: { ...(o.ncoReplacement.costs || {}) } } : null;
    const origRepl = o.weaponReplacements || {};
    const extraNco = [];
    const profLink = (w, seed) => tag('infoLink', { id: cid('pl|' + seed + '|' + w), name: w, hidden: 'false', targetId: wpIds[w], type: 'profile' });
    const andHide = (conds) => tag('modifier', { type: 'set', field: 'hidden', value: 'true' }, wrap('conditionGroups', [tag('conditionGroup', { type: 'and' }, wrap('conditions', conds))]));
    const baseOf = n => baseWeapon(n) || n;
    const linkIfRule = (n, seed) => ruleDesc[n] && !stubRules.has(n) ? [ruleLink(n, seed)] : [];

    // ---- M301 (UNSC Marine / ODST / Spartan infantry) ----
    if (fac === 'UNSC' && isInf && u.type === 'Infantry' && Math.floor(maxMen / 4) >= 1) {
      const byName = /marine|odst|spartan/.test(lc(u.name));
      const docElig = ['Marine', 'ODST', 'Spartan'].filter(d => docIds[d]);
      if (byName || docElig.length) {
        const hideM = byName ? [] : [andHide(docElig.map(d => condAtLeast(docIds[d], uid, 'lessThan')))];
        // NCO M301 needs at least 4 models in the unit
        const ncoM = [...hideM];
        if (baseMen < 4 && extraId) ncoM.push(hideWhen([tag('condition', { type: 'lessThan', value: String(4 - baseMen), field: 'selections', scope: uid, childId: extraId, shared: 'true', includeChildSelections: 'false', includeChildForces: 'false' })]));
        const chooseAny = Object.keys(origRepl).length === 0 && u.weapons.length > 1;
        const defaultBase = baseOf(u.weapons[0].name);
        const replCost = (w) => {
          if (defaultBase === w) return 0;
          for (const sp of Object.values(origRepl)) if (baseOf(sp.grants) === w) return Number(sp.cost) || 0;
          if (u.weapons.some(x => baseOf(x.name) === w)) return 0;
          return null;
        };
        const carriers = ['Assault Rifle', 'Battle Rifle', 'Infantry Flamethrower'];
        for (const w of carriers) {
          const bc = replCost(w); if (bc === null) continue;
          const label = `${w} + M301 Grenade Launcher`, eid = cid('m301|' + uid + '|' + w), conId = cid('m301con|' + eid);
          const mods = [...hideM];
          const baseMax = extraId ? Math.floor(baseMen / 4) : Math.floor(maxMen / 4);
          if (extraId) for (let t = (Math.floor(baseMen / 4) + 1) * 4; t <= maxMen; t += 4)
            mods.push(tag('modifier', { type: 'increment', field: conId, value: '1' }, wrap('conditions', [tag('condition', { type: 'atLeast', value: String(t - baseMen), field: 'selections', scope: uid, childId: extraId, shared: 'true', includeChildSelections: 'false', includeChildForces: 'false' })])));
          entries.push(entry('upgrade', label, eid, {
            cost: bc + 22, modifiers: mods,
            constraints: [tag('constraint', { type: 'max', value: String(baseMax), field: 'selections', scope: 'parent', shared: 'true', id: conId })],
            infoLinks: [profLink(w, eid), profLink('M301 Grenade Launcher', eid), ...linkIfRule('M301 Grenade Launcher', eid)],
            desc: `M301 package: one model carries ${w} plus an M301 Grenade Launcher (fires one or the other). +22 pts over the base weapon. Limit 1 per 4 models in the unit.`
          }));
        }
        const ncoDesc = 'NCO carries an M301 Grenade Launcher in addition to the listed weapon (+22 pts). Needs 4+ models in the unit.';
        if (nco) {
          for (const w of carriers) if (nco.options.includes(w)) extraNco.push({ label: `${w} + M301 Grenade Launcher`, cost: (nco.costs[w] || 0) + 22, mods: ncoM, profs: [w, 'M301 Grenade Launcher'], rules: ['M301 Grenade Launcher'], desc: ncoDesc });
        } else if (chooseAny) {
          nco = { options: [], costs: {} };
          u.weapons.forEach(x => { const b = baseOf(x.name); if (!nco.options.includes(b)) { nco.options.push(b); nco.costs[b] = 0; } });
          for (const w of carriers) { const bc = replCost(w); if (bc === null) continue; extraNco.push({ label: `${w} + M301 Grenade Launcher`, cost: bc + 22, mods: ncoM, profs: [w, 'M301 Grenade Launcher'], rules: ['M301 Grenade Launcher'], desc: ncoDesc }); }
        }
      }
    }

    // ---- Leader melee combos (Covenant / Banished Elite & Brute) ----
    if ((fac === 'Covenant' || fac === 'Banished') && isInf && u.type === 'Infantry') {
      const isMelee = n => n === 'Melee Weapon' || n === 'Melee Weapons';
      const gname = r => typeof r === 'string' ? r.split(':')[0].trim() : (r && r.name);
      const grantsMelee = d => [].concat(d.grantsRule || [], d.grantsRules || []).some(r => isMelee(gname(r)));
      const staticMelee = u.specialRules.some(r => isMelee(gname(r)));
      const meleeSrc = [];
      for (const [label, d] of Object.entries(o.squadUpgrades || {})) if (grantsMelee(d) && suIds[label]) meleeSrc.push(suIds[label]);
      for (const x of docUpIds) if (grantsMelee(x.up)) meleeSrc.push(x.id);
      if (staticMelee || meleeSrc.length) {
        const meleeHide = staticMelee ? [] : [andHide(meleeSrc.map(i => condAtLeast(i, uid, 'lessThan')))];
        const doctrineBased = Object.keys(docIds).length > 0;
        const casteOf = (c) => {
          if (doctrineBased) return docIds[c] ? [hideWhen([condAtLeast(docIds[c], uid, 'lessThan')])] : null;
          const nm = lc(u.name);
          if (c === 'Elite') return /elite|honou?r guard/.test(nm) ? [] : null;
          return /brute|atriox/.test(nm) ? [] : null;
        };
        const elite = casteOf('Elite'), brute = casteOf('Brute');
        const disc = hasRuleName(u, 'Tough Fighters') ? 1 : 0;
        const leaderStyle = /Officer|Forward Observer|Medic|Chaplain|Bloodhandler|Attached Leader/i.test(u.name);
        if (!nco && !leaderStyle) {
          const opts = [], costs = {};
          const addBase = (w, c) => { const b = baseOf(w); if (!b || b === 'Unarmed' || /^Melee Weapons?$/.test(b)) return; if (!opts.includes(b)) { opts.push(b); costs[b] = c; } };
          u.weapons.forEach(x => addBase(x.name, 0));
          Object.values(origRepl).forEach(r => { const g = r.grants && baseOf(r.grants); if (['Plasma Rifle', 'Needler', 'Spiker'].includes(g)) addBase(g, Number(r.cost) || 0); });
          if (opts.length) nco = { options: opts, costs };
        }
        if (nco) {
          if (elite) for (const w of ['Plasma Rifle', 'Needler']) if (nco.options.includes(w))
            extraNco.push({ label: `${w} + Plasma Sword`, cost: (nco.costs[w] || 0) + 5 - disc, mods: [...elite, ...meleeHide], profs: [w, 'Plasma Sword'], rules: ['Plasma Sword'], desc: `Leader melee upgrade: ${w} plus Plasma Sword (+5 pts over the ranged weapon${disc ? ', -1 for Tough Fighters' : ''}).` });
          if (brute && (nco.options.includes('Spiker') || nco.options.includes('Plasma Rifle')) && !nco.options.includes('Gravity Hammer'))
            extraNco.push({ label: 'Gravity Hammer', cost: 0 - disc, mods: [...brute, ...meleeHide], profs: ['Gravity Hammer'], rules: ['Gravity Hammer'], desc: 'Leader melee upgrade: replaces the Spiker/Plasma Rifle.' });
        } else if (leaderStyle) {
          const cur = u.weapons.length === 1 ? u.weapons[0].name : null;
          const curBase = cur ? baseOf(cur) : null, noRanged = cur && (curBase === 'Unarmed' || /melee weapon/i.test(cur));
          const canChoose = w => u.weapons.some(x => baseOf(x.name) === w);
          const lm = [];
          const addLm = (label, cost, casteMods, profs, desc) => { const eid = cid('lm|' + uid + '|' + label); lm.push(entry('upgrade', label, eid, { cost, modifiers: [...casteMods, ...meleeHide], constraints: [con('max', 1, 'parent', 'lm' + eid)], infoLinks: [...profs.map(w => profLink(w, eid)), ...profs.flatMap(w => linkIfRule(w, eid))], desc })); };
          if (elite) {
            if (noRanged) addLm('Plasma Sword, no ranged weapon', 6 - disc, elite, ['Plasma Sword'], 'Leader melee upgrade (Elite).');
            else if (curBase === 'Plasma Rifle' || curBase === 'Needler') addLm(`${curBase} + Plasma Sword`, 5 - disc, elite, [curBase, 'Plasma Sword'], 'Leader melee upgrade (Elite).');
            else if (!cur) { if (canChoose('Plasma Rifle')) addLm('Plasma Rifle + Plasma Sword', 5 - disc, elite, ['Plasma Rifle', 'Plasma Sword'], 'Leader melee upgrade (Elite).'); if (canChoose('Needler')) addLm('Needler + Plasma Sword', 5 - disc, elite, ['Needler', 'Plasma Sword'], 'Leader melee upgrade (Elite).'); }
          }
          if (brute) {
            if (noRanged) addLm('Gravity Hammer, no ranged weapon', 8 - disc, brute, ['Gravity Hammer'], 'Leader melee upgrade (Brute).');
            else if (curBase === 'Spiker' || curBase === 'Plasma Rifle') addLm(`Replace ${curBase} with Gravity Hammer`, 0 - disc, brute, ['Gravity Hammer'], 'Leader melee upgrade (Brute).');
            else if (!cur && (canChoose('Spiker') || canChoose('Plasma Rifle'))) addLm('Replace Spiker/Plasma Rifle with Gravity Hammer', 0 - disc, brute, ['Gravity Hammer'], 'Leader melee upgrade (Brute). The model gives up its Spiker or Plasma Rifle.');
          }
          if (lm.length) groups.push(group('Leader Melee Upgrade', cid('g|lm|' + uid), { entries: lm, constraints: [con('max', 1, 'parent', 'lmmax' + uid)] }));
        }
      }
    }

    if (nco) {
      const gid = cid('g|nco|' + uid);
      const ne = nco.options.map(w => {
        const eid = cid('nco|' + uid + '|' + w);
        return entry('upgrade', w, eid, { cost: (nco.costs && nco.costs[w]) || 0, constraints: [con('max', 1, 'parent', 'nco' + eid)], infoLinks: wp[w] ? [tag('infoLink', { id: cid('ncol|' + eid), name: w, hidden: 'false', targetId: wpIds[w], type: 'profile' })] : [] });
      });
      for (const x of extraNco) {
        const eid = cid('ncox|' + uid + '|' + x.label);
        ne.push(entry('upgrade', x.label, eid, {
          cost: x.cost, modifiers: x.mods, constraints: [con('max', 1, 'parent', 'ncox' + eid)],
          infoLinks: [...x.profs.filter(w => wp[w]).map(w => profLink(w, eid)), ...x.rules.flatMap(r => linkIfRule(r, eid))], desc: x.desc
        }));
      }
      groups.push(group('NCO Weapon', gid, { entries: ne, constraints: [con('max', 1, 'parent', 'ncomax' + uid)] }));
    }
  }
  // vehicle weapon upgrades
  const wu = Object.entries(o.weaponUpgrades || {});
  if (wu.length) {
    const wEntries = [], rEntries = [];
    for (const [label, d] of wu) {
      const eid = cid('wu|' + uid + '|' + label);
      const t = { profiles: [], links: [] }, desc = [];
      const rr = [];
      if (d.addsWeapon) {
        const b = baseWeapon(d.addsWeapon);
        if (b) { t.profiles.push(weaponProfileXml(cid('wup|' + eid), d.addsWeapon, parseProf(wp[b]))); } else unmatchedWeapons.add(d.addsWeapon);
      }
      if (d.grantsRule) { const g = grant(d.grantsRule, eid); if (g.rule) rr.push(g.rule); if (g.link) t.links.push(g.link); }
      if (d.grantsRules) d.grantsRules.forEach(r => { const g = grant(r, eid); if (g.rule) rr.push(g.rule); if (g.link) t.links.push(g.link); });
      if (d.slot) desc.push('Mount: ' + d.slot);
      if (d.replaces) desc.push('Replaces: ' + (typeof d.replaces === 'object' ? JSON.stringify(d.replaces) : d.replaces));
      if (d.requires) desc.push('Requires: ' + (typeof d.requires === 'object' ? JSON.stringify(d.requires) : d.requires));
      const e = entry('upgrade', label, eid, { cost: d.cost, constraints: [con('max', 1, 'parent', 'wu' + eid)], profiles: t.profiles, infoLinks: t.links, rules: rr, desc: desc.join(' ') || undefined });
      (d.addsWeapon && o.maxWeaponUpgrades ? wEntries : rEntries).push(e);
    }
    entries.push(...rEntries);
    if (wEntries.length) groups.push(group('Weapon Upgrades', cid('g|wu|' + uid), { entries: wEntries, constraints: [con('max', o.maxWeaponUpgrades, 'parent', 'wumax' + uid)] }));
  }
  if (o.optionNotes) notes.push(String(typeof o.optionNotes === 'string' ? o.optionNotes : JSON.stringify(o.optionNotes)));
  if (u.requiresArmyBonus) notes.push('Requires army option: ' + u.requiresArmyBonus);
  if (u.forceOrgSlot) notes.push('Force org slot: ' + u.forceOrgSlot);


  // armoury items
  const ar = armouryFor(fac, arr, u, { uid, vets, vetIds, extraId, baseMen, maxMen, docIds, perModelMods, ctx, entries });
  // visibility modifiers
  const mods = [];
  if (u.requiresArmyBonus && ctx.variantIds[u.requiresArmyBonus]) mods.push(hideWhen([condAtLeast(ctx.variantIds[u.requiresArmyBonus], 'force', 'lessThan')]));

  // forced Command Vehicle (+10 pts)
  if (!isInf && u.type !== 'Aircraft' && !['Infantry', 'Team', 'Artillery'].includes(u.type) && String(u.forceOrgSlot || '').toLowerCase() !== 'transport'
      && !hasRuleName(u, 'Command Vehicle') && !(o.weaponUpgrades || {})['Command Vehicle']) {
    const eid = cid('forcedcv|' + uid);
    const jk = KIDS.filter(k => k.name === 'Juggernaut Key Mind').map(k => k.id);
    entries.push(entry('upgrade', 'Command Vehicle', eid, {
      cost: 10, constraints: [con('max', 1, 'parent', 'fcv' + eid)], infoLinks: [ruleLink('Command Vehicle', eid)],
      modifiers: jk.map(j => hideWhen([condAtLeast(j, uid)])),
      desc: 'Designate this vehicle as a Command Vehicle (+10 pts). Not allowed on a Juggernaut Key Mind.'
    }));
  }
  const kids = KIDS.slice(); KIDS = null;
  const R = unitRoles(fac, u, { uid, kids, docIds, extraId, baseMen, maxMen, isInf });
  const lim = limitedConstraints(u, uid);
  const cat = categoryFor(arr, u);
  return entry('unit', u.name, uid, {
    profiles, rules, infoLinks: links, entries, groups, modifiers: [...mods, ...R.mods, ...(KIDS_MODS_FOR[uid] || [])], links: ar,
    constraints: lim, desc: notes.join(' ') || undefined,
    categoryLinks: [tag('categoryLink', { id: cid('cl|' + uid), name: cat, hidden: 'false', targetId: catId[cat], primary: 'true' }), ...R.links]
  });
}

// ---------- catalogue builder ----------
const FACS = {
  UNSC: { name: 'UNSC', unitsKey: 'UNSC_UNITS', vehKey: 'UNSC_VEHICLES', variants: [{ n: 'UNSC', army: 'UNSC' }, { n: 'Insurrection', army: 'Insurrection' }], castes: false },
  Covenant: { name: 'Covenant', unitsKey: 'COVENANT_UNITS', vehKey: 'COVENANT_VEHICLES', variants: [{ n: 'Covenant', army: 'Covenant' }, { n: 'Swords of Sanghelios', army: 'Swords of Sanghelios' }], castes: ['Commanding Presence', 'Cannon Fodder', 'Wall of Deflection', 'Fury Unleashed'] },
  Banished: { name: 'Banished', unitsKey: 'BANISHED_UNITS', vehKey: 'BANISHED_VEHICLES', variants: [{ n: 'Banished', army: 'Banished' }] },
  Forerunner: { name: 'Forerunner', unitsKey: 'FORERUNNER_UNITS', vehKey: 'FORERUNNER_VEHICLES', variants: [{ n: 'Forerunner', army: 'Forerunner' }] },
  Flood: { name: 'Flood', unitsKey: 'FLOOD_UNITS', vehKey: 'FLOOD_VEHICLES', variants: [{ n: 'Flood', army: 'Flood' }] },
};

function buildCat(fac) {
  CUR = fac;
  const F = FACS[fac];
  const setupId = cid('setup');
  const variantIds = {}, ctx = { variantIds, doctrineHide: {}, shared: [], relicId: null, uids: {} };
  for (const key of [F.unitsKey, F.vehKey]) for (const uu of O[key]) ctx.uids[key + '|' + uu.name] = cid('unit|' + key + '|' + uu.name);
  if (fac === 'Covenant') {
    const d = O.ARMOURY_DEFS.Covenant.find(x => x.id === 'sacredRelic'); ctx.relicId = cid('shared|relic');
    ctx.shared.push(entry('upgrade', d.label, ctx.relicId, { cost: d.cost, infoLinks: [grant('Sacred Relic', ctx.relicId).link], constraints: [con('max', 1, 'force', 'relic')], desc: 'Armoury item. Flat 15 pts. Limit one per army. Needs a Veteran Elite squad with at least one model besides the Officer/NCO.' }));
  }
  // army rules per variant
  const variantEntries = F.variants.map(v => {
    const vid = cid('variant|' + v.n); variantIds[v.n] = vid;
    const rules = parseArmyRules(O.armyRulesText[v.army] || '').map(r => ruleXml(r.name, r.text, vid));
    return entry('upgrade', 'Army: ' + v.n, vid, { rules, constraints: [con('max', 1, 'parent', 'var' + vid)] });
  });
  const setupGroups = [];
  if (variantEntries.length > 1) setupGroups.push(group('Army', cid('g|army'), { entries: variantEntries, def: variantIds[F.variants[0].n], constraints: [con('min', 1, 'parent', 'amin'), con('max', 1, 'parent', 'amax')] }));
  const setupEntries = variantEntries.length > 1 ? [] : variantEntries;
  if (F.castes) {
    const none = cid('caste|none');
    const ce = [entry('upgrade', 'None', none, { cost: 0 })];
    F.castes.forEach(c => { const e = cid('caste|' + c); variantIds[c] = e; ce.push(entry('upgrade', c, e, { cost: 0, constraints: [con('max', 1, 'parent', 'c' + e)] })); });
    setupGroups.push(group('Caste System', cid('g|caste'), { entries: ce, def: none, constraints: [con('min', 1, 'parent', 'cmin'), con('max', 1, 'parent', 'cmax')] }));
    ctx.doctrineHide = { Brute: variantIds['Swords of Sanghelios'] };
  }
  if (fac === 'UNSC') ctx.doctrineHide = { Spartan: variantIds['Insurrection'] };
  // base army rules for the main variant live on setup entry if group exists
  const setupMods = [];
  if (variantIds['Cannon Fodder'] && FAC_ROLES[fac].has('CFODDER'))
    setupMods.push(tag('modifier', { type: 'add', field: 'category', value: roleId('CFODDER') }, wrap('conditions', [condAtLeast(variantIds['Cannon Fodder'], setupId)])));
  const setupXml = entry('upgrade', 'Army Setup', setupId, {
    entries: setupEntries, groups: setupGroups, modifiers: setupMods,
    constraints: [con('min', 1, 'parent', 'setupmin'), con('max', 1, 'parent', 'setupmax')],
    categoryLinks: [tag('categoryLink', { id: cid('cl|setup'), name: 'Army Setup', hidden: 'false', targetId: catId['Army Setup'], primary: 'true' })]
  });
  const out = [setupXml];
  for (const [arr, key] of [[F.unitsKey, F.unitsKey], [F.vehKey, F.vehKey]]) for (const u of O[key]) out.push(buildUnit(fac, arr, u, ctx));
  // leaders
  const variantsForLeaders = F.variants.map(v => v.army);
  for (const army of variantsForLeaders) {
    for (const L of (O.LEADER_DEFS[army] || [])) {
      const lid = cid('leader|' + army + '|' + L.id);
      const req = leaderReqs(L.id);
      const mods = [];
      const main = F.variants[0].n, vid = variantIds[army];
      if (army === main && F.variants.length > 1) mods.push(hideWhen(F.variants.slice(1).map(v => condAtLeast(variantIds[v.n], 'force'))).replace('<conditions>', '<conditionGroups><conditionGroup type="or"><conditions>').replace('</conditions>', '</conditions></conditionGroup></conditionGroups>'));
      if (army !== main) mods.push(hideWhen([condAtLeast(vid, 'force', 'lessThan')]));
      out.push(entry('upgrade', L.name, lid, {
        cost: L.cost, modifiers: mods, rules: [ruleXml(L.ruleName, L.ruleText.trim(), lid)],
        desc: req.length ? 'Requirements: ' + req.join(' ') : undefined,
        constraints: [con('max', 1, 'parent', 'lead' + lid)],
        categoryLinks: [tag('categoryLink', { id: cid('cl|' + lid), name: 'Army Leader', hidden: 'false', targetId: catId['Army Leader'], primary: 'true' }),
          tag('categoryLink', { id: cid('lcl|' + lid), name: 'Leader: ' + L.name, hidden: 'false', targetId: leaderCatId(army, L.id), primary: 'false' })]
      }));
    }
  }
  const catId_ = id('catalogue|' + fac);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    tag('catalogue', { id: catId_, name: 'Halo - ' + F.name, revision: '1', battleScribeVersion: '2.03', library: 'false', gameSystemId: GS_ID, gameSystemRevision: '1', xmlns: 'http://www.battlescribe.net/schema/catalogueSchema' },
      wrap('selectionEntries', out) + wrap('sharedSelectionEntries', ctx.shared)) + '\n';
}

const catXml = {};
for (const f of Object.keys(FACS)) catXml[f] = buildCat(f);
fs.writeFileSync(path.join(OUTDIR, 'Halo Bolt Action.gst'), buildGst());
for (const f of Object.keys(FACS)) fs.writeFileSync(path.join(OUTDIR, `Halo - ${FACS[f].name}.cat`), catXml[f]);
console.log('armoury notes:', armouryReport);
console.log('limited rules:', limitedReport);
console.log('leaders without requirement mapping:', unknownLeaders);
console.log('stub rules (no description in source):', [...stubRules]);
console.log('unmatched weapons:', [...unmatchedWeapons]);
