// ============================================================
// CONSTANTS & STAT KEYS
// ============================================================


// ============================================================
// LOCAL STATE (fallback when not connected to Supabase)
// ============================================================
let state = { characters: [], activeCharIdx: 0, maps: [], activePinMode: false, pendingPin: null, editingPinIdx: null, currentSearchContext: null, currentEquipSlot: null, customSkillContext: null };

// Core stats — editable in Character tab
const CORE_STAT_KEYS   = ['str','agi','end','int'];
const CORE_ID_MAP      = { str:'core-str', agi:'core-agi', end:'core-end', int:'core-int' };

// Derived stats (Stats tab only — calculated in renderStats)
// Qi Strength  = (str + end) / 2  × qiLevel   × equipBonus
// Qi Defense   = (end + agi) / 2  × qiLevel   × equipBonus
// Soul Strength= (int + str) / 2  × soulLevel × equipBonus
// Soul Defense = (int + end) / 2  × soulLevel × equipBonus
const EQUIP_ICONS = { weapon:'⚔️', armor:'🛡️', soul:'💜', flame:'🔥', core:'⚡' };

function newCharacter(name) {
  return {
    name, qiStage:'Mortal', qiSublevel:'Early', qi:100, soulStage:'Mortal', soulSublevel:'Early', soul:100, qiPillPts:0, soulPillPts:0,
    coreStats:{ str:10,agi:10,end:10,int:10 },
    equipment:{ weapon:null,armor:null,soul:null,flame:null,core:null },
    combatSkills:[], cultSkills:[], items:[], companions:[],
    maps:[], activePinMode:false
  };
}

function getChar() { return state.characters[state.activeCharIdx] ?? null; }

// Cache state locally (Supabase is the source of truth when logged in)
function saveState() { try { localStorage.setItem('daoChronicle_v2', JSON.stringify(state)); } catch(e) {} }

// Load from localStorage cache (fallback when Supabase hasn't loaded yet)
function loadState() {
  try {
    const raw = localStorage.getItem('daoChronicle_v2');
    if (raw) { state = JSON.parse(raw); if (!state.characters) state.characters = []; }
  } catch(e) {}
  if (!state.characters.length) { state.characters.push(newCharacter('Cultivator')); state.activeCharIdx = 0; }
  if (!state.maps) state.maps = [];
}

// ============================================================
// TABS
// ============================================================
function switchTab(name, btn) {
  // Cancel pin mode when leaving the map tab
  if (pinModeActive) {
    pinModeActive = false;
    const pBtn = document.getElementById('pin-mode-btn');
    if (pBtn) { pBtn.style.background = ''; pBtn.style.borderColor = ''; pBtn.textContent = '📍 Add Pin'; }
    const overlay = document.getElementById('map-svg-overlay');
    if (overlay) { overlay.classList.remove('drawing'); overlay.onclick = null; }
  }
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  // Scroll active tab into view on mobile
  btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  if (name === 'stats') renderStats();
  if (name === 'combat') renderSkills();
  if (name === 'inventory') renderInventory();
  if (name === 'map') renderMap();
  if (name === 'lore')    { if (!allPlaques.length) loadPlaques(); else filterPlaques(); }
  if (name === 'shop')    {
    if (!allShopIngredients.length) loadShopData();
    else filterShop();
    loadCharIngredients().then(() => { renderIngredientPouch(); filterShop(); });
  }
  if (name === 'alchemy') {
    if (!allRecipes.length) loadShopData().then(() => { renderIngredientPouch(); filterRecipes(); });
    else { renderIngredientPouch(); filterRecipes(); }
    loadCharIngredients().then(renderIngredientPouch);
  }
}

function switchSubTab(name, btn) {
  document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('subtab-items').style.display = name === 'items' ? '' : 'none';
  document.getElementById('subtab-companions').style.display = name === 'companions' ? '' : 'none';
}

// ============================================================
// CHARACTER MANAGEMENT
// ============================================================
function renderCharSwitcher() {
  const wrap = document.getElementById('charSwitcher');
  wrap.querySelectorAll('.char-pill').forEach(p => p.remove());
  const addBtn = wrap.querySelector('.btn-add-char');
  state.characters.forEach((c, i) => {
    const pill = document.createElement('button');
    pill.className = 'char-pill' + (i === state.activeCharIdx ? ' active' : '');
    if (i === state.activeCharIdx && state.characters.length > 1) {
      pill.innerHTML = (c.name || 'Character ' + (i+1)) +
        '<span class="pill-delete" title="Delete character" onclick="event.stopPropagation();confirmDeleteChar(' + i + ')"> ✕</span>';
    } else {
      pill.textContent = c.name || 'Character ' + (i+1);
    }
    pill.onclick = () => { state.activeCharIdx = i; saveState(); loadCharToUI(); renderCharSwitcher(); };
    wrap.insertBefore(pill, addBtn);
  });
}

function confirmDeleteChar(idx) {
  state.pendingDeleteIdx = idx;
  const name = state.characters[idx] ? state.characters[idx].name || 'this character' : 'this character';
  document.getElementById('delete-char-name').textContent = name;
  openModal('modal-delete-char');
}

function deleteCharacter() {
  const idx = state.pendingDeleteIdx;
  if (idx === null || idx === undefined || state.characters.length <= 1) {
    closeModal('modal-delete-char'); return;
  }
  state.characters.splice(idx, 1);
  state.activeCharIdx = Math.min(state.activeCharIdx, state.characters.length - 1);
  state.pendingDeleteIdx = null;
  saveState(); loadCharToUI(); renderCharSwitcher();
  closeModal('modal-delete-char');
}

function openAddCharModal() { document.getElementById('new-char-name').value = ''; openModal('modal-add-char'); }

function createCharacter() {
  const name = document.getElementById('new-char-name').value.trim() || 'New Cultivator';
  state.characters.push(newCharacter(name));
  state.activeCharIdx = state.characters.length - 1;
  saveState(); loadCharToUI(); renderCharSwitcher();
  closeModal('modal-add-char');
}

function loadCharToUI() {
  const c = getChar();
  if (!c) return;
  document.getElementById('char-name').value = c.name || '';
  document.getElementById('qi-stage').value = c.qiStage || 'Mortal';
  document.getElementById('qi-sublevel').value = c.qiSublevel || 'Early';
  document.getElementById('char-qi').value = c.qi || 0;
  document.getElementById('soul-stage').value = c.soulStage || 'Mortal';
  document.getElementById('soul-sublevel').value = c.soulSublevel || 'Early';
  document.getElementById('char-soul').value = c.soul || 0;
  CORE_STAT_KEYS.forEach(k => {
    const el = document.getElementById(CORE_ID_MAP[k]);
    if (el) el.value = (c.coreStats && c.coreStats[k]) || 10;
  });
  updateCultDisplay();
  renderEquipSlots();
  if (document.getElementById('char-sub-dao') && document.getElementById('char-sub-dao').classList.contains('active')) renderDaoPanel();
}

// Saves form fields into local state cache (synced to Supabase via loadCharacterFromDB)
function saveChar() {
  const c = getChar(); if (!c) return;
  c.name = document.getElementById('char-name').value;
  c.qiStage = document.getElementById('qi-stage').value;
  c.qiSublevel = document.getElementById('qi-sublevel').value;
  c.qi = parseInt(document.getElementById('char-qi').value) || 0;
  c.soulStage = document.getElementById('soul-stage').value;
  c.soulSublevel = document.getElementById('soul-sublevel').value;
  c.soul = parseInt(document.getElementById('char-soul').value) || 0;
  if (!c.coreStats) c.coreStats = {};
  CORE_STAT_KEYS.forEach(k => {
    const el = document.getElementById(CORE_ID_MAP[k]);
    if (el) c.coreStats[k] = parseInt(el.value) || 10;
  });
  const pills = document.querySelectorAll('.char-pill');
  if (pills[state.activeCharIdx]) pills[state.activeCharIdx].textContent = c.name || 'Character';
  saveState();
}

const STAGE_ORDER = ['Mortal','Beginner','Veteran','Master','Expert','Sage','Lord','Monarch','Immortal','Saint','Earth God','Sky God','Dao Completion'];
const SUBLEVEL_ORDER = ['Early','Mid','Late','Peak'];

// Stage base values double each rank: Mortal=1, Beginner=2, Veteran=4 ... Dao Completion=4096
// Sublevels add: Early+0, Mid+0.25, Late+0.5, Peak+0.75
// type: 'qi' or 'soul'
// ============================================================
// SUPABASE — CONFIG, AUTH & API HELPERS
// ============================================================
const SUPABASE_URL = 'https://snsmynjntczztclwhkeh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc215bmpudGN6enRjbHdoa2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzI1NDEsImV4cCI6MjA5NDI0ODU0MX0.YTeOfU2XQq_NBjrT95Dcqano-H4-uvIcIudIDW4mixY';

// Supabase JS client (loaded via CDN)
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Current session state
let currentUser    = null;   // auth.User object
let currentProfile = null;   // profiles row
let isAdmin        = false;
let currentCharId  = null;   // UUID of the active character in Supabase

// Populated by initApp() on page load
let SKILLS_DATA_EN     = [];
let SKILLS_DATA_DE     = [];
let SKILLS_DATA        = [];
let ITEMS_DATA         = [];
let COMPANIONS_DATA_EN = [];
let COMPANIONS_DATA_DE = [];
let COMPANIONS_DATA    = [];

const STAGE_BASE = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096];
const SUBLEVEL_ADD = { Early: 0, Mid: 0.25, Late: 0.5, Peak: 0.75 };

function getStageLevel(c, type) {
  if (!c) c = getChar();
  if (!c) return 1;
  const stage    = type === 'soul' ? (c.soulStage    || 'Mortal') : (c.qiStage    || 'Mortal');
  const sublevel = type === 'soul' ? (c.soulSublevel || 'Early')  : (c.qiSublevel || 'Early');
  const si  = Math.max(0, STAGE_ORDER.indexOf(stage));
  const add = SUBLEVEL_ADD[sublevel] !== undefined ? SUBLEVEL_ADD[sublevel] : 0;
  return STAGE_BASE[si] + add;
}

function updateCultDisplay() {
  const c = getChar(); if (!c) return;
  const qiLvlRaw   = getStageLevel(c, 'qi');
  const soulLvlRaw = getStageLevel(c, 'soul');
  const fmtLvl = v => Number.isInteger(v) ? v : v.toFixed(2);
  const qiLvl   = fmtLvl(qiLvlRaw);
  const soulLvl = fmtLvl(soulLvlRaw);
  // Qi track
  document.getElementById('disp-qi-stage').textContent = c.qiStage || 'Mortal';
  document.getElementById('disp-qi-sublevel').textContent = (c.qiSublevel || 'Early') + ' Stage · Lv. ' + qiLvl;
  // Soul track
  document.getElementById('disp-soul-stage').textContent = c.soulStage || 'Mortal';
  document.getElementById('disp-soul-sublevel').textContent = (c.soulSublevel || 'Early') + ' Stage · Lv. ' + soulLvl;
  // Power bars
  const maxPower = 10000;
  document.getElementById('qi-bar').style.width = Math.min(100, ((c.qi || 0) / maxPower) * 100) + '%';
  document.getElementById('soul-bar').style.width = Math.min(100, ((c.soul || 0) / maxPower) * 100) + '%';
  document.getElementById('qi-val-disp').textContent = (c.qi || 0).toLocaleString();
  document.getElementById('soul-val-disp').textContent = (c.soul || 0).toLocaleString();
  recalcStats();
}

// ============================================================
// EQUIPMENT
// ============================================================
function renderEquipSlots() {
  const c = getChar(); if (!c) return;
  document.querySelectorAll('.equip-slot').forEach(slot => {
    const key = slot.dataset.slot;
    const item = c.equipment && c.equipment[key];
    slot.innerHTML = '';
    if (item) {
      slot.classList.add('filled');
      const rankSpan = document.createElement('span');
      rankSpan.className = 'equip-slot-rank rank-' + (item.rank || 'C');
      rankSpan.textContent = item.rank || '';
      slot.appendChild(rankSpan);
      const icon = document.createElement('span');
      icon.className = 'equip-slot-icon';
      icon.textContent = EQUIP_ICONS[key];
      slot.appendChild(icon);
      const nameEl = document.createElement('span');
      nameEl.className = 'equip-slot-name';
      nameEl.textContent = item.name;
      slot.appendChild(nameEl);
    } else {
      slot.classList.remove('filled');
      const icon = document.createElement('span');
      icon.className = 'equip-slot-icon';
      icon.textContent = EQUIP_ICONS[key];
      slot.appendChild(icon);
      const label = document.createElement('span');
      label.textContent = key.charAt(0).toUpperCase() + key.slice(1);
      slot.appendChild(label);
    }
  });
}

function openEquipSlot(slot) {
  state.currentEquipSlot = slot;
  document.getElementById('equip-modal-title').textContent = 'Equip ' + slot.charAt(0).toUpperCase() + slot.slice(1);
  document.getElementById('equip-search-input').value = '';
  runEquipSearch();
  openModal('modal-equip-search');
}

// Strict slot → item type mapping. Only matching types show when equipping.
// Artifact / Utility Item / Cultivation Pill are inventory-only — never equippable.
const SLOT_TYPE_MAP = {
  weapon: ['Weapon'],
  armor:  ['Armor'],
  soul:   ['Soul'],
  flame:  ['Flame'],
  core:   ['Core']
};
// Inventory-only types (cannot be equipped to any slot)
const INVENTORY_ONLY_TYPES = new Set(['Artifact','Utility Item','Cultivation Pill']);

function runEquipSearch() {
  const q    = document.getElementById('equip-search-input').value.toLowerCase();
  const res  = document.getElementById('equip-search-results');
  const slot = state.currentEquipSlot;
  const c    = getChar();
  const inventory = (c && c.items) ? c.items : [];
  const validTypes = SLOT_TYPE_MAP[slot] || [];
  const equippedName = c && c.equipment && c.equipment[slot] ? c.equipment[slot].name : null;

  // Only show items matching this slot's exact type (inventory-only types are never shown)
  let items = inventory.filter(i => validTypes.includes(i.type) && !INVENTORY_ONLY_TYPES.has(i.type));

  if (q) items = items.filter(i =>
    (i.name||'').toLowerCase().includes(q) ||
    (i.subtype||'').toLowerCase().includes(q) ||
    (i.rank||'').toLowerCase().includes(q) ||
    (i.energy||'').toLowerCase().includes(q)
  );

  // Deduplicate by name for display (show each unique item once)
  const seen = new Set();
  items = items.filter(i => { if (seen.has(i.name)) return false; seen.add(i.name); return true; });

  if (!items.length) {
    const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
    const needed = (SLOT_TYPE_MAP[slot] || [slot]).join(' or ');
    res.innerHTML = `<div class="empty-state" style="padding:24px;">
      ${inventory.length === 0
        ? 'Your inventory is empty. Add items in the <strong>Inventory</strong> tab first.'
        : `No <strong>${slotLabel}</strong> items found. Only <strong>${needed}</strong>-type items can go in this slot.`}
    </div>`;
    return;
  }

  res.innerHTML = items.map(item => {
    const isEquipped = item.name === equippedName;
    const bonuses = item.bonuses || {};
    const bonusStr = Object.entries(bonuses).slice(0,3).map(([k,v]) => {
      const short = {strength:'STR',agility:'AGI',endurance:'END',intelligence:'INT',attack:'ATK',defense:'DEF',qiStrength:'QiSTR',qiDefense:'QiDEF',soulStrength:'SoulSTR',soulDefense:'SoulDEF'}[k]||k;
      return `<span style="color:${v>=0?'var(--jade)':'#f87171'}">${short} ${v>=0?'+':''}${v}</span>`;
    }).join(' · ');
    return `<div class="search-result" onclick="equipItem(${JSON.stringify(item).replace(/"/g,'&quot;')})" style="${isEquipped ? 'opacity:0.5;pointer-events:none;' : ''}">
      <div class="search-result-name">
        ${item.name}
        
        ${item.subtype ? `<span class="badge badge-qi">${item.subtype}</span>` : ''}
        ${item.energy ? `<span class="badge badge-soul">${item.energy}</span>` : ''}
        ${isEquipped ? `<span class="badge" style="color:#9ca3af;border-color:rgba(156,163,175,0.3);">Equipped</span>` : ''}
      </div>
      ${bonusStr ? `<div style="font-size:0.78rem;margin-top:4px;">${bonusStr}</div>` : ''}
    </div>`;
  }).join('');
}

function equipItem(item) {
  const c = getChar(); if (!c || !state.currentEquipSlot) return;
  if (!c.equipment) c.equipment = {};

  // If something is already in this slot, put it back into inventory first
  const existing = c.equipment[state.currentEquipSlot];
  if (existing) {
    if (!c.items) c.items = [];
    c.items.push(existing);
  }

  // Remove the newly equipped item from inventory (first matching entry)
  const invIdx = c.items.findIndex(i => i.name === item.name);
  if (invIdx >= 0) c.items.splice(invIdx, 1);

  c.equipment[state.currentEquipSlot] = item;
  saveState(); renderEquipSlots(); recalcStats();
  if (document.getElementById('tab-inventory').classList.contains('active')) renderItemList(c.items);
  closeModal('modal-equip-search');
}

function unequipSlot() {
  const c = getChar(); if (!c || !state.currentEquipSlot) return;
  if (!c.equipment) c.equipment = {};

  // Return the item to inventory
  const item = c.equipment[state.currentEquipSlot];
  if (item) {
    if (!c.items) c.items = [];
    c.items.push(item);
  }

  c.equipment[state.currentEquipSlot] = null;
  saveState(); renderEquipSlots(); recalcStats();
  if (document.getElementById('tab-inventory').classList.contains('active')) renderItemList(c.items);
  closeModal('modal-equip-search');
}

// ============================================================
// STATS
// ============================================================
// Maps stat keys to bonus fields in the new item structure
const STAT_BONUS_MAP = {
  str:     ['strength'],
  agi:     ['agility'],
  end:     ['endurance'],
  int:     ['intelligence'],
  qiStr:   ['qiStrength',  'attack'],
  qiDef:   ['qiDefense',   'defense'],
  soulStr: ['soulStrength','attack'],
  soulDef: ['soulDefense', 'defense'],
};

function getEquipBonus(stat, c) {
  // Returns flat additive bonus (not multiplier) from all equipped items
  let flat = 0;
  if (!c.equipment) return flat;
  const fields = STAT_BONUS_MAP[stat] || [];
  Object.values(c.equipment).forEach(item => {
    if (!item || !item.bonuses) return;
    fields.forEach(f => { if (item.bonuses[f]) flat += item.bonuses[f]; });
  });
  return flat;
}

function recalcStats() { if (document.getElementById('tab-stats').classList.contains('active')) renderStats(); }


// ============================================================
// DAO STAT CONTRIBUTIONS & MILESTONES
// ============================================================

// Each Dao contributes flat bonuses per level to specific stats.
// These are ADDITIVE and shown in the Stats tab under "Dao Bonuses".
const DAO_STAT_CONTRIBUTIONS = {
  fire:    { qiStrength: 3, strength: 2 },
  water:   { soulDefense: 3, endurance: 2 },
  earth:   { qiDefense: 3, endurance: 3 },
  wind:    { agility: 5, qiStrength: 1 },
  thunder: { qiStrength: 4, agility: 2 },
  void:    { soulStrength: 4, soulDefense: 2 },
  life:    { endurance: 4, soulStrength: 2 },
  death:   { soulStrength: 3, qiStrength: 2 },
  space:   { agility: 3, intelligence: 3 },
  time:    { intelligence: 4, soulDefense: 2 },
  grand:   { strength: 5, agility: 5, endurance: 5, intelligence: 5, qiStrength: 8, qiDefense: 8, soulStrength: 8, soulDefense: 8 },
};

// Milestone effects shown as text at levels 3, 5, 7, 10
const DAO_MILESTONES = {
  fire: [
    { level:3,  effect:'Flame Awakening — Qi attacks carry a burning aura. Fire immunity +20%.' },
    { level:5,  effect:'Inferno Body — Physical defense ignores 10% of all incoming Qi damage.' },
    { level:7,  effect:'Phoenix Seed — Once per day, revive from death with 30% HP.' },
    { level:10, effect:'Eternal Flame — All fire-type abilities double in power. Body becomes immune to all natural flames.' },
  ],
  water: [
    { level:3,  effect:'Flow State — Dodging costs 30% less stamina. Movement speed slightly increased.' },
    { level:5,  effect:'Tide Sense — Cannot be surprised or ambushed; always act first in combat.' },
    { level:7,  effect:'Endless Depth — HP regenerates 5% per turn outside of combat.' },
    { level:10, effect:'True Water Form — Can liquify body for 3 seconds; become untargetable. Cooldown: once per battle.' },
  ],
  earth: [
    { level:3,  effect:'Stone Skin — Reduce all physical damage received by 8%.' },
    { level:5,  effect:'Mountain Stance — Cannot be knocked back, stunned, or displaced.' },
    { level:7,  effect:'Tectonic Roots — When hit below 30% HP, all damage is halved for 2 turns.' },
    { level:10, effect:'World Pillar — Defense stat counts double. Become immovable: no knockback from any source.' },
  ],
  wind: [
    { level:3,  effect:'Wind Steps — Movement speed increases by 25%. Evasion raised.' },
    { level:5,  effect:'Gust Form — First attack each battle is always a critical hit.' },
    { level:7,  effect:'Tempest Aura — Enemies within range lose 15% agility.' },
    { level:10, effect:'Storm Sovereign — Can move through any physical barrier. Speed becomes uncounterable.' },
  ],
  thunder: [
    { level:3,  effect:'Static Charge — Attacks build up charge; every 5th strike releases a thunder burst.' },
    { level:5,  effect:'Heaven\'s Conductor — All lightning-type damage dealt increased by 30%.' },
    { level:7,  effect:'Judgment Field — Enemies who attack you are struck by a reflex lightning bolt.' },
    { level:10, effect:'Divine Thunderclap — Once per battle: paralyze all enemies for 1 turn with a heaven-shaking clap.' },
  ],
  void: [
    { level:3,  effect:'Spatial Sense — Can detect hidden enemies and see through illusions.' },
    { level:5,  effect:'Void Step — Once per battle: teleport up to 50 meters instantly.' },
    { level:7,  effect:'Nothingness Cloak — Can become invisible for 5 seconds. Cooldown: 1 minute.' },
    { level:10, effect:'Void Sovereign — Soul cannot be detected, sealed, or dominated by any entity below God rank.' },
  ],
  life: [
    { level:3,  effect:'Life Pulse — Passively heal 3% of maximum HP every turn in battle.' },
    { level:5,  effect:'Growth Aura — Companions within range regenerate health and gain +10% to all stats.' },
    { level:7,  effect:'Vital Overflow — When HP drops below 20%, instantly recover 40% HP once per battle.' },
    { level:10, effect:'Eternal Life — Cannot be killed by instant-death effects. Always survive with at least 1 HP.' },
  ],
  death: [
    { level:3,  effect:'Death Touch — Attacks apply a necrotic stack. At 5 stacks, target is weakened.' },
    { level:5,  effect:'Soul Reaper — Each defeated enemy restores 10% of your maximum Soul Power.' },
    { level:7,  effect:'Grim Presence — Enemies within 10m suffer -20% to attack and defense.' },
    { level:10, effect:'Death God\'s Form — Once per battle: enter a death state for 3 turns — immune to all damage and effects.' },
  ],
  space: [
    { level:3,  effect:'Space Fold — Reduce all ranged attack distances by half. Your own ranged attacks ignore distance.' },
    { level:5,  effect:'Dimensional Pocket — Can store items in a personal pocket dimension; retrieve instantly.' },
    { level:7,  effect:'Spatial Lock — Once per battle: freeze one enemy in space for 2 turns.' },
    { level:10, effect:'Space Master — Freely manipulate space within 100m. Create barriers, redirect attacks, open rifts.' },
  ],
  time: [
    { level:3,  effect:'Temporal Sight — Can perceive 1 second into the future; +15% dodge rate.' },
    { level:5,  effect:'Time Dilate — Once per battle: slow all enemies to half speed for 2 turns.' },
    { level:7,  effect:'Rewind — Once per day: revert your own HP and status to what they were 30 seconds ago.' },
    { level:10, effect:'Chrono Sovereign — Stop time for 3 seconds once per battle. Act freely while time is frozen.' },
  ],
  grand: [
    { level:3,  effect:'Dao Perception — Understand the true nature of all things. Cannot be deceived by any technique.' },
    { level:5,  effect:'Harmony of All — All Dao bonuses increase by 50%. Skills cost half their normal resource.' },
    { level:7,  effect:'Beyond Rank — Stats can exceed all normal caps. No upper limit applies to the Dao-comprehender.' },
    { level:10, effect:'One With the Dao — Transcend mortality itself. All stats permanently doubled. Cannot be killed by anyone below Dao Completion rank.' },
  ],
};

// Returns total flat Dao bonus for a given stat key (e.g. 'qiStrength')
function getDaoBonus(statKey, c) {
  const daos = c.daos;
  if (!daos) return 0;
  let total = 0;
  // Map renderStats keys to DAO_STAT_CONTRIBUTIONS keys
  const statMap = {
    str: 'strength', agi: 'agility', end: 'endurance', int: 'intelligence',
    qiStr: 'qiStrength', qiDef: 'qiDefense', soulStr: 'soulStrength', soulDef: 'soulDefense'
  };
  const field = statMap[statKey] || statKey;
  Object.entries(DAO_STAT_CONTRIBUTIONS).forEach(([daoId, bonuses]) => {
    const level = daos[daoId] || 0;
    if (level > 0 && bonuses[field]) {
      total += bonuses[field] * level;
    }
  });
  return total;
}

// Get active milestone effects for display
function getActiveMilestones(c) {
  const daos = c.daos; if (!daos) return [];
  const active = [];
  const allDaos = [...DAO_DEFINITIONS, GRAND_DAO];
  allDaos.forEach(dao => {
    const level = daos[dao.id] || 0;
    if (level === 0) return;
    const milestones = DAO_MILESTONES[dao.id] || [];
    milestones.forEach(m => {
      if (level >= m.level) {
        active.push({ dao, milestone: m, daoLevel: level });
      }
    });
  });
  return active;
}
function renderStats() {
  const c = getChar(); if (!c) return;
  const qiLevel   = getStageLevel(c, 'qi');
  const soulLevel = getStageLevel(c, 'soul');
  const core = c.coreStats || {};
  const grid = document.getElementById('stats-display');

  // ── Qi/Soul power multipliers ───────────────────────────────────────────────
  // Power ranges 0–10000. Bonus multiplier: 1.0 at 0 power → 2.0 at 10000 power
  const MAX_POWER   = 10000;
  const qiPower     = Math.min(MAX_POWER, c.qi   || 0);
  const soulPower   = Math.min(MAX_POWER, c.soul || 0);
  const qiPowerMult   = 1 + (qiPower   / MAX_POWER); // 1.0 → 2.0
  const soulPowerMult = 1 + (soulPower / MAX_POWER); // 1.0 → 2.0

  // ── Helper to build a stat row ──────────────────────────────────────────────
  function statRow(name, final, formula, trackHtml, isDerived = false) {
    return `<div class="stat-row${isDerived ? ' derived' : ''}">
      <div class="stat-row-left">
        <div class="stat-row-name">${name}</div>
        <div class="stat-row-sub">${trackHtml}</div>
      </div>
      <div class="stat-row-right">
        <div class="stat-row-value">${final.toLocaleString()}</div>
        <div class="stat-row-formula">${formula}</div>
      </div>
    </div>`;
  }

  const fmtMult = v => v.toFixed(2) + 'x';
  const qiTrack   = `<span style="color:var(--qi-light);">⚡ Qi Lv.${fmtLvl(qiLevel)} · ${fmtMult(qiPowerMult)} power</span>`;
  const soulTrack = `<span style="color:var(--soul-light);">💜 Soul Lv.${fmtLvl(soulLevel)} · ${fmtMult(soulPowerMult)} power</span>`;

  // ── Core stats (Strength, Agility, Endurance, Intelligence) × Qi Level ──────
  const corePairs = [
    [t('stat_strength'),     'str'],
    [t('stat_agility'),      'agi'],
    [t('stat_endurance'),    'end'],
    [t('stat_intelligence'), 'int'],
  ];
  const coreHtml = `<div class="stat-section-label">⚡ <span data-i18n="section_basestats">Base Stats</span></div>` +
    corePairs.map(([label, k]) => {
      const base     = core[k] || 10;
      const equipB   = getEquipBonus(k, c);
      const isSoul   = k === 'int';
      const lvl      = isSoul ? soulLevel    : qiLevel;
      const pMult    = isSoul ? soulPowerMult : qiPowerMult;
      const track    = isSoul ? soulTrack     : qiTrack;
      const total    = base + equipB;
      const final    = Math.round(total * lvl * pMult);
      const formula  = `${total} × ${fmtLvl(lvl)} × ${fmtMult(pMult)}`;
      return statRow(label, final, formula, track);
    }).join('');

  // ── Derived stats (Stats tab only) ─────────────────────────────────────────
  // Qi Strength   = (Strength  + Endurance)   / 2 × Qi Level
  // Qi Defense    = (Endurance + Agility)      / 2 × Qi Level
  // Soul Strength = (Intelligence + Strength)  / 2 × Soul Level
  // Soul Defense  = (Intelligence + Endurance) / 2 × Soul Level
  const qiStrBase   = ((core.str || 10) + (core.end || 10)) / 2;
  const qiDefBase   = ((core.end || 10) + (core.agi || 10)) / 2;
  const soulStrBase = ((core.int || 10) + (core.str || 10)) / 2;
  const soulDefBase = ((core.int || 10) + (core.end || 10)) / 2;

  const derivedRows = [
    { label:t('stat_qiStr'),   base: qiStrBase,   level: qiLevel,   track: qiTrack,   key:'qiStr'   },
    { label:t('stat_qiDef'),   base: qiDefBase,   level: qiLevel,   track: qiTrack,   key:'qiDef'   },
    { label:t('stat_soulStr'), base: soulStrBase, level: soulLevel, track: soulTrack, key:'soulStr' },
    { label:t('stat_soulDef'), base: soulDefBase, level: soulLevel, track: soulTrack, key:'soulDef' },
  ];
  const derivedHtml = `<div class="stat-section-label">✦ <span data-i18n="section_derivedstats">Derived Stats</span></div>` +
    derivedRows.map(d => {
      const equipB  = getEquipBonus(d.key, c);
      const total   = d.base + equipB;
      const pMult   = (d.key === 'soulStr' || d.key === 'soulDef') ? soulPowerMult : qiPowerMult;
      const final   = Math.round(total * d.level * pMult);
      const formula = `${Math.round(total)} × ${fmtLvl(d.level)} × ${fmtMult(pMult)}`;
      return statRow(d.label, final, formula, d.track, true);
    }).join('');

  // ── Qi / Soul Power display rows ───────────────────────────────────────────
  const powerHtml = `<div class="stat-section-label">⚡💜 Qi &amp; Soul Power</div>` +
    `<div class="stat-row">
      <div class="stat-row-left">
        <div class="stat-row-name" style="color:var(--qi-light);">Qi Power</div>
        <div class="stat-row-sub"><span style="color:var(--qi-light);">+${((qiPowerMult-1)*100).toFixed(0)}% to all Qi stats</span></div>
      </div>
      <div class="stat-row-right">
        <div class="stat-row-value" style="color:var(--qi-light);">${qiPower.toLocaleString()}</div>
        <div class="stat-row-formula">${fmtMult(qiPowerMult)} multiplier</div>
      </div>
    </div>` +
    `<div class="stat-row">
      <div class="stat-row-left">
        <div class="stat-row-name" style="color:var(--soul-light);">Soul Power</div>
        <div class="stat-row-sub"><span style="color:var(--soul-light);">+${((soulPowerMult-1)*100).toFixed(0)}% to all Soul stats</span></div>
      </div>
      <div class="stat-row-right">
        <div class="stat-row-value" style="color:var(--soul-light);">${soulPower.toLocaleString()}</div>
        <div class="stat-row-formula">${fmtMult(soulPowerMult)} multiplier</div>
      </div>
    </div>`;

  // ── Dao stat bonuses section ──────────────────────────────────────────────
  const daos = c.daos || {};
  const hasDaoProgress = Object.entries(daos).some(([k,v]) => k !== 'custom' && v > 0);

  // Build Dao bonus rows — one per Dao that has any level
  let daoStatHtml = '';
  if (hasDaoProgress) {
    const allDaosList = [...DAO_DEFINITIONS];
    if ((daos.grand || 0) > 0) allDaosList.push(GRAND_DAO);

    // Collect per-stat totals from Daos
    const statKeys = ['str','agi','end','int','qiStr','qiDef','soulStr','soulDef'];
    const statNames = { str:t('stat_strength'), agi:t('stat_agility'), end:t('stat_endurance'), int:t('stat_intelligence'), qiStr:t('stat_qiStr'), qiDef:t('stat_qiDef'), soulStr:t('stat_soulStr'), soulDef:t('stat_soulDef') };
    const daoTotals = {};
    statKeys.forEach(k => { daoTotals[k] = getDaoBonus(k, c); });

    const daoSummaryRows = statKeys.filter(k => daoTotals[k] > 0).map(k =>
      `<div class="stat-row" style="border-color:rgba(201,168,76,0.2);">
        <div class="stat-row-left">
          <div class="stat-row-name">${statNames[k]} <span style="font-size:0.65rem;color:var(--gold-dim);">(+Dao)</span></div>
          <div class="stat-row-sub"><span style="color:var(--gold-dim);font-size:0.72rem;">∞ Dao Comprehension</span></div>
        </div>
        <div class="stat-row-right">
          <div class="stat-row-value" style="color:var(--gold);">+${daoTotals[k].toLocaleString()}</div>
          <div class="stat-row-formula">flat bonus</div>
        </div>
      </div>`
    ).join('');

    daoStatHtml = `<div class="stat-section-label">∞ Dao Bonuses</div>${daoSummaryRows}`;
  }

  // ── Active Milestones ───────────────────────────────────────────────────────
  const activeMilestones = getActiveMilestones(c);
  let milestonesHtml = '';
  if (activeMilestones.length) {
    const rows = activeMilestones.map(({dao, milestone}) =>
      `<div style="padding:9px 12px;margin-bottom:6px;background:rgba(255,255,255,0.025);border:1px solid ${dao.color}33;border-radius:8px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <span style="font-size:0.9rem;">${dao.icon}</span>
          <span style="font-family:'Cinzel',serif;font-size:0.72rem;color:${dao.color};">${dao.name}</span>
          <span style="font-family:'Cinzel',serif;font-size:0.62rem;color:var(--gold-dim);margin-left:auto;">Lv.${milestone.level}</span>
        </div>
        <div style="font-size:0.82rem;color:var(--text-dim);line-height:1.4;">${milestone.effect}</div>
      </div>`
    ).join('');
    milestonesHtml = `<div class="stat-section-label">✦ Active Dao Effects</div>${rows}`;
  }

  grid.innerHTML = powerHtml + coreHtml + derivedHtml + daoStatHtml + milestonesHtml;

  // Equip bonuses
  const bonusList = document.getElementById('equip-bonus-list');
  const equipped = Object.entries(c.equipment || {}).filter(([k,v]) => v);
  if (!equipped.length) {
    bonusList.innerHTML = '<div class="empty-state">No equipment equipped.</div>';
  } else {
    bonusList.innerHTML = equipped.map(([slot, item]) => {
      const bonuses = item.bonuses || {};
      const bonusLine = Object.entries(bonuses).map(([k,v]) => {
        const short = {strength:'STR',agility:'AGI',endurance:'END',intelligence:'INT',attack:'ATK',defense:'DEF',qiStrength:'Qi STR',qiDefense:'Qi DEF',soulStrength:'Soul STR',soulDefense:'Soul DEF',critChance:'Crit%'}[k]||k;
        return `<span style="color:${v>=0?'var(--jade)':'#f87171'}">${short} ${v>=0?'+':''}${v}</span>`;
      }).join(' · ');
      const abilities = (item.abilities||[]).map(a => `<div style="font-size:0.75rem;color:var(--text-dim);margin-top:2px;"><span style="color:var(--gold-dim)">${a.name}:</span> ${a.description}</div>`).join('');
      return `<div style="padding:10px 0; border-bottom:1px solid var(--border);">
        <div style="font-family:'Cinzel',serif;font-size:0.75rem;color:var(--gold-dim);margin-bottom:4px;">${EQUIP_ICONS[slot]} ${slot.toUpperCase()} — <span style="color:var(--text)">${item.name}</span></div>
        ${bonusLine ? `<div style="font-size:0.8rem;margin-bottom:3px;">${bonusLine}</div>` : ''}
        ${abilities}
      </div>`;
    }).join('');
  }
}

// ============================================================
// SKILLS
// ============================================================
function renderSkills() {
  const c = getChar(); if (!c) return;
  renderSkillList('combat-skills-list', c.combatSkills || [], 'combat');
  renderSkillList('cult-skills-list', c.cultSkills || [], 'cultivation');
}

function renderSkillList(containerId, skills, context) {
  const el = document.getElementById(containerId);
  if (!skills.length) { el.innerHTML = '<div class="empty-state">No skills yet.</div>'; return; }
  el.innerHTML = skills.map((s, i) => {
    // Always look up the live translation from the current language data
    const live = SKILLS_DATA.find(d => d.name === s.name);
    const display = live || s; // fall back to stored data for custom skills
    const typeClass = (display.type || '').includes('Soul') ? 'badge-soul' : (display.type || '').includes('Cult') ? 'badge-cult' : 'badge-qi';
    const rarClass = display.rarity === 'God' ? 'badge-god' : display.rarity === 'Dao' ? 'badge-dao' : display.rarity === 'Mythic' ? 'badge-mythic' : display.rarity === 'Legendary' ? 'badge-legendary' : display.rarity === 'Immortal' ? 'badge-immortal' : display.rarity === 'Saint' ? 'badge-soul' : 'badge-rare';
    return `<div class="skill-card">
      <button class="remove-btn" onclick="removeSkill('${context}',${i})" title="Remove">✕</button>
      <div class="skill-name">
        ${display.name}
        <span class="badge ${typeClass}">${display.type||''}</span>
        ${display.rarity ? `<span class="badge ${rarClass}">${display.rarity}</span>` : ''}
      </div>
      <div class="skill-desc">${display.description||''}</div>
      ${display.effect ? `<div class="skill-effect">↳ ${display.effect}</div>` : ''}
    </div>`;
  }).join('');
}

function removeSkill(context, idx) {
  const c = getChar(); if (!c) return;
  if (context === 'combat') c.combatSkills.splice(idx, 1);
  else c.cultSkills.splice(idx, 1);
  saveState(); renderSkills();
}

// ============================================================
// INVENTORY
// ============================================================
function renderInventory() {
  const c = getChar(); if (!c) return;
  renderItemList(c.items || []);
  renderCompanionList(c.companions || []);
}

function bonusColor(val) { return val >= 0 ? 'var(--jade)' : '#f87171'; }
function bonusSign(val)  { return val >= 0 ? '+' + val : '' + val; }

const TYPE_ORDER   = ['Weapon','Armor','Flame','Soul','Core','Artifact','Utility Item','Cultivation Pill'];
const TYPE_ICON    = {Weapon:'⚔️',Armor:'🛡️',Flame:'🔥',Soul:'💜',Core:'⚡',Artifact:'🔮','Utility Item':'📜','Cultivation Pill':'💊'};
const TYPE_I18N    = {Weapon:'type_weapon',Armor:'type_armor',Flame:'type_flame',Soul:'type_soul',Core:'type_core',Artifact:'type_artifact','Utility Item':'type_utility','Cultivation Pill':'type_pill'};

function renderItemList(items) {
  const el = document.getElementById('items-list');
  if (!items.length) { el.innerHTML = '<div class="empty-state">Your inventory is empty.</div>'; return; }
  const c = getChar(); // needed for equipped-item checks
  // Stack by name
  const groups = {};
  items.forEach((it, i) => {
    if (!groups[it.name]) groups[it.name] = { item: it, indices: [] };
    groups[it.name].indices.push(i);
  });
  // Group stacks by type
  const byType = {};
  Object.values(groups).forEach(g => {
    const t = g.item.type || 'Other';
    if (!byType[t]) byType[t] = [];
    byType[t].push(g);
  });
  const orderedTypes = TYPE_ORDER.filter(t => byType[t]).concat(Object.keys(byType).filter(t => !TYPE_ORDER.includes(t)));
  el.innerHTML = orderedTypes.map(type => {
    const icon = TYPE_ICON[type] || '📦';
    const sectionLabel = `<div class="stat-section-label">${icon} ${t(TYPE_I18N[type] || '') || type}</div>`;
    const cards = byType[type].map(g => {
    const it = g.item;
    const count = g.indices.length;
    const firstIdx = g.indices[0];
    const bonuses = it.bonuses || {};
    const bonusHtml = Object.entries(bonuses).map(([k, v]) => {
      const label = {strength:'STR',agility:'AGI',endurance:'END',intelligence:'INT',attack:'ATK',defense:'DEF',qiStrength:'Qi STR',qiDefense:'Qi DEF',soulStrength:'Soul STR',soulDefense:'Soul DEF',critChance:'Crit%'}[k] || k;
      return `<span style="font-size:0.72rem;color:${bonusColor(v)};background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:4px;padding:1px 6px;">${label} ${bonusSign(v)}</span>`;
    }).join('');
    const abilitiesHtml = (it.abilities || []).map(a =>
      `<div style="margin-top:5px;font-size:0.8rem;"><span style="color:var(--gold-dim);font-family:'Cinzel',serif;font-size:0.65rem;">${a.name}:</span> <span style="color:var(--text-dim)">${a.description}</span></div>`
    ).join('');
    const imgHtml = it.image
      ? `<img src="${it.image}" style="width:100%;max-height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;border:1px solid var(--border);">`
      : '';
    return `<div class="item-card">
      ${(() => {
        const equippedNames = Object.values(c.equipment || {}).filter(Boolean).map(e => e.name);
        const isEquipped = equippedNames.includes(it.name);
        return isEquipped
          ? `<span class="remove-btn" title="Unequip from equipment slot first" style="cursor:default;opacity:0.4;">🔒</span>`
          : `<button class="remove-btn" onclick="removeItem(${firstIdx})" title="Remove one">✕</button>`;
      })()}
      ${imgHtml}
      <div class="item-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="item-name">${it.name}${count > 1 ? ` <span style="color:var(--gold);font-family:'Cinzel',serif;font-size:0.75rem;">×${count}</span>` : ''}</div>
        ${it.custom ? `<label title="Add/change image" style="cursor:pointer;color:var(--text-dim);font-size:0.85rem;flex-shrink:0;">
          📷<input type="file" accept="image/*" style="display:none" onchange="setItemImage(${firstIdx}, event)">
        </label>` : ''}
      </div>
      <div class="item-badges" style="margin:6px 0 ${bonusHtml ? '7px' : '0'};">
        
        ${it.subtype ? `<span class="badge badge-qi">${it.subtype}</span>` : ''}
        ${it.energy ? `<span class="badge badge-soul">${it.energy}</span>` : ''}
        ${it.specialization ? `<span class="badge badge-cult">${it.specialization}</span>` : ''}
        ${it.growth ? `<span class="badge badge-legendary">Lv.${it.growth.level}/${it.growth.maxLevel}</span>` : ''}
      </div>
      ${bonusHtml ? `<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;">${bonusHtml}</div>` : ''}
      ${abilitiesHtml}
      ${it.effect ? `<div style="font-size:0.8rem;color:var(--jade);font-style:italic;margin-top:4px;">↳ ${it.effect}</div>` : ''}
      ${it.type === 'Cultivation Pill' ? `
        <div style="margin-top:10px;">
          <button onclick="consumePill('${it.name.replace(/'/g,"\\'")}');event.stopPropagation();"
            style="width:100%;padding:6px;background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.3);border-radius:6px;color:var(--soul-light);font-family:'Cinzel',serif;font-size:0.65rem;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;"
            onmouseover="this.style.background='rgba(139,92,246,0.22)'" onmouseout="this.style.background='rgba(139,92,246,0.1)'">
            ${t('consume_pill')}
          </button>
        </div>` : ''}
    </div>`;
    }).join('');
    return sectionLabel + cards;
  }).join('');
}

function setItemImage(idx, event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const c = getChar(); if (!c || !c.items[idx]) return;
    // Apply image to all items with the same name (stacked)
    const name = c.items[idx].name;
    c.items.forEach(it => { if (it.name === name) it.image = e.target.result; });
    saveState(); renderItemList(c.items);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function removeItem(idx) {
  const c = getChar(); if (!c) return;
  const item = c.items[idx];
  if (!item) return;

  // Prevent removing an item that is currently equipped
  const equippedNames = Object.values(c.equipment || {}).filter(Boolean).map(e => e.name);
  if (equippedNames.includes(item.name)) {
    // Flash the equip slot to indicate it's in use — just silently ignore
    return;
  }

  c.items.splice(idx, 1);
  saveState(); renderItemList(c.items);
}

function renderCompanionList(companions) {
  const el = document.getElementById('companions-list');
  if (!companions.length) { el.innerHTML = '<div class="empty-state">No companions bound yet.</div>'; return; }
  el.innerHTML = companions.map((cp, i) => {
    // Look up live translation from current language data
    const live = COMPANIONS_DATA.find(d => d.name === cp.name);
    const display = live || cp; // fall back to stored data for custom companions
    return `<div class="companion-card">
      <button class="remove-btn" onclick="removeCompanion(${i})" title="Remove">✕</button>
      <div class="companion-name">
        ${display.name}
        <span class="badge badge-cult">${display.category||''}</span>
      </div>
      <div class="companion-desc">${display.description||''}</div>
      <div class="companion-abilities">
        ${(display.abilities||[]).map(a => `<span class="ability-tag">${typeof a === 'string' ? a : a.name}</span>`).join('')}
      </div>
      ${display.evolution ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text-dim);">Evolution: ${display.evolution.join(' → ')}</div>` : ''}
    </div>`;
  }).join('');
}

function removeCompanion(idx) {
  const c = getChar(); if (!c) return;
  c.companions.splice(idx, 1);
  saveState(); renderCompanionList(c.companions);
}

// ============================================================
// SEARCH MODAL
// ============================================================
let searchData = [];

function openSearchModal(type, subtype) {
  state.currentSearchContext = { type, subtype };
  let title = 'Search';
  if (type === 'skill' && subtype === 'combat') { title = 'Search Combat Skills'; searchData = SKILLS_DATA.filter(s => s.type !== 'Cultivation Technique'); }
  else if (type === 'skill' && subtype === 'cultivation') { title = 'Search Cultivation Techniques'; searchData = SKILLS_DATA.filter(s => s.type === 'Cultivation Technique'); }
  else if (type === 'item') { title = 'Search Items'; searchData = ITEMS_DATA; }
  else if (type === 'companion') { title = 'Search Companions'; searchData = COMPANIONS_DATA; }
  document.getElementById('search-modal-title').textContent = title;
  document.getElementById('search-input').value = '';
  runSearch();
  openModal('modal-search');
}

function runSearch() {
  const q = document.getElementById('search-input').value.toLowerCase();
  const ctx = state.currentSearchContext;
  const c = getChar();
  let data = searchData;
  if (q) data = data.filter(d => (d.name||'').toLowerCase().includes(q) || (d.type||'').toLowerCase().includes(q) || (d.rank||'').toLowerCase().includes(q) || (d.description||'').toLowerCase().includes(q) || (d.category||'').toLowerCase().includes(q) || (d.rarity||'').toLowerCase().includes(q));
  data = data.slice(0, 25);
  const res = document.getElementById('search-results');
  if (!data.length) { res.innerHTML = '<div class="empty-state">No results found.</div>'; return; }
  if (ctx.type === 'companion') {
    res.innerHTML = data.map(d => `
      <div class="search-result" onclick='addCompanionFromSearch(${JSON.stringify(d).replace(/'/g,"&#39;")})'>
        <div class="search-result-name">${d.name} <span class="badge badge-cult">${d.category||''}</span></div>
        <div class="search-result-desc">${d.description||''}</div>
        ${d.element ? `<div style="margin-top:4px;font-size:0.75rem;color:var(--qi-light);">${Array.isArray(d.element)?d.element.join(', '):d.element}</div>` : ''}
      </div>
    `).join('');
  } else if (ctx.type === 'item') {
    res.innerHTML = data.map(d => {
      const bonuses = d.bonuses || {};
      const bonusStr = Object.entries(bonuses).slice(0,4).map(([k,v]) => {
        const short = {strength:'STR',agility:'AGI',endurance:'END',intelligence:'INT',attack:'ATK',defense:'DEF',qiStrength:'Qi STR',qiDefense:'Qi DEF',soulStrength:'Soul STR',soulDefense:'Soul DEF',critChance:'Crit%'}[k]||k;
        return `<span style="color:${v>=0?'var(--jade)':'#f87171'};font-size:0.75rem;">${short} ${v>=0?'+':''}${v}</span>`;
      }).join(' · ');
      const alreadyOwned = (c && c.items && c.items.some(i => i.name === d.name));
      const isEquipSlot = ['Weapon','Armor','Flame','Soul','Core'].includes(d.type);
      const blocked = alreadyOwned && isEquipSlot;
      return `<div class="search-result" onclick='addItemFromSearch(${JSON.stringify(d).replace(/'/g,"&#39;")})' style="${blocked ? 'opacity:0.5;pointer-events:none;' : ''}">
        <div class="search-result-name">
          ${d.name}
          
          <span class="badge badge-qi">${d.type||''}${d.subtype?' · '+d.subtype:''}</span>
          ${d.energy ? `<span class="badge badge-soul">${d.energy}</span>` : ''}
          ${blocked ? `<span class="badge" style="color:#9ca3af;border-color:rgba(156,163,175,0.3);">Owned</span>` : ''}
        </div>
        ${bonusStr ? `<div style="margin-top:4px;">${bonusStr}</div>` : ''}
      </div>`;
    }).join('');
  } else {
    res.innerHTML = data.map(d => {
      const typeClass = (d.type||'').includes('Soul') ? 'badge-soul' : (d.type||'').includes('Cult') ? 'badge-cult' : 'badge-qi';
      const rarClass = d.rarity === 'God' ? 'badge-god' : d.rarity === 'Dao' ? 'badge-dao' : d.rarity === 'Mythic' ? 'badge-mythic' : d.rarity === 'Legendary' ? 'badge-legendary' : d.rarity === 'Immortal' ? 'badge-immortal' : d.rarity === 'Saint' ? 'badge-soul' : 'badge-rare';
      return `<div class="search-result" onclick='addSkillFromSearch(${JSON.stringify(d).replace(/'/g,"&#39;")})'>
        <div class="search-result-name">
          ${d.name}
          <span class="badge ${typeClass}">${d.type||''}</span>
          ${d.rarity?`<span class="badge ${rarClass}">${d.rarity}</span>`:''}
        </div>
        <div class="search-result-desc">${d.description||''}</div>
        ${d.effect?`<div style="color:var(--jade);font-size:0.8rem;margin-top:3px;font-style:italic;">↳ ${d.effect}</div>`:''}
      </div>`;
    }).join('');
  }
}

function addSkillFromSearch(skill) {
  const c = getChar(); if (!c) return;
  const ctx = state.currentSearchContext;
  if (ctx.subtype === 'combat') { if (!c.combatSkills) c.combatSkills = []; c.combatSkills.push(skill); }
  else { if (!c.cultSkills) c.cultSkills = []; c.cultSkills.push(skill); }
  saveState(); renderSkills(); closeModal('modal-search');
}

function addItemFromSearch(item) {
  const c = getChar(); if (!c) return;
  if (!c.items) c.items = [];
  const UNIQUE_TYPES = new Set(['Weapon','Armor','Flame','Soul','Core']); // equippable slots — allow only one per name
  if (UNIQUE_TYPES.has(item.type)) {
    // Only one copy of each unique equippable — prevent duplicates
    if (c.items.some(i => i.name === item.name)) {
      // Already owned — do nothing, could show a toast but just silently ignore
      closeModal('modal-search');
      return;
    }
  }
  c.items.push(item);
  saveState(); renderItemList(c.items); closeModal('modal-search');
}

function addCompanionFromSearch(companion) {
  const c = getChar(); if (!c) return;
  if (!c.companions) c.companions = [];
  c.companions.push(companion);
  saveState(); renderCompanionList(c.companions); closeModal('modal-search');
}

// ============================================================
// CUSTOM SKILL / ITEM
// ============================================================
function openAddCustomSkill(context) {
  state.customSkillContext = context;
  ['csk-name','csk-desc','csk-effect'].forEach(id => document.getElementById(id).value = '');
  openModal('modal-custom-skill');
}

function saveCustomSkill() {
  const skill = {
    name: document.getElementById('csk-name').value.trim() || 'Custom Skill',
    type: document.getElementById('csk-type').value,
    rank: document.getElementById('csk-rank').value,
    rarity: document.getElementById('csk-rarity').value,
    description: document.getElementById('csk-desc').value,
    effect: document.getElementById('csk-effect').value
  };
  const c = getChar(); if (!c) return;
  if (state.customSkillContext === 'combat') { if (!c.combatSkills) c.combatSkills = []; c.combatSkills.push(skill); }
  else { if (!c.cultSkills) c.cultSkills = []; c.cultSkills.push(skill); }
  saveState(); renderSkills(); closeModal('modal-custom-skill');
}

let _customItemImg = null;

function previewCustomItemImg(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    _customItemImg = e.target.result;
    document.getElementById('citm-img-thumb').src = _customItemImg;
    document.getElementById('citm-img-preview').style.display = '';
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function clearCustomItemImg() {
  _customItemImg = null;
  document.getElementById('citm-img-preview').style.display = 'none';
  document.getElementById('citm-img-thumb').src = '';
}

function openAddCustomItem() {
  _customItemImg = null;
  document.getElementById('citm-name').value = '';
  document.getElementById('citm-img-preview').style.display = 'none';
  document.getElementById('citm-img-thumb').src = '';
  ['citm-b-attack','citm-b-defense','citm-b-strength','citm-b-agility','citm-b-endurance','citm-b-intelligence']
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = 0; });
  openModal('modal-custom-item');
}

function saveCustomItem() {
  const bonusFields = {
    attack:       parseInt(document.getElementById('citm-b-attack').value)||0,
    defense:      parseInt(document.getElementById('citm-b-defense').value)||0,
    strength:     parseInt(document.getElementById('citm-b-strength').value)||0,
    agility:      parseInt(document.getElementById('citm-b-agility').value)||0,
    endurance:    parseInt(document.getElementById('citm-b-endurance').value)||0,
    intelligence: parseInt(document.getElementById('citm-b-intelligence').value)||0,
  };
  // Only keep non-zero bonuses
  const bonuses = Object.fromEntries(Object.entries(bonusFields).filter(([,v]) => v !== 0));
  const item = {
    name:   document.getElementById('citm-name').value.trim() || 'Custom Item',
    type:   document.getElementById('citm-type').value,
    rank:   document.getElementById('citm-rank').value,
    energy: document.getElementById('citm-energy').value,
    bonuses,
    image:  _customItemImg || null,
    custom: true,
  };
  const c = getChar(); if (!c) return;
  if (!c.items) c.items = [];
  c.items.push(item);
  saveState(); renderItemList(c.items); closeModal('modal-custom-item');
}


// ============================================================
// MAP
// ============================================================
let mapPins = []; // [{x,y,title,note,color,id}] per char+map
let currentMapKey = null;

function getMapStore() {
  const c = getChar(); if (!c) return null;
  if (!c.maps) c.maps = {};
  return c.maps;
}

function renderMap() {
  const maps = state.maps || [];
  const c = getChar();
  if (!c) return;
  if (!c.mapData) c.mapData = {};

  // Show current map
  if (currentMapKey && c.mapData[currentMapKey]) {
    showMapImage(c.mapData[currentMapKey].src);
    mapPins = c.mapData[currentMapKey].pins || [];
  } else {
    const keys = Object.keys(c.mapData || {});
    if (keys.length) {
      currentMapKey = keys[0];
      showMapImage(c.mapData[currentMapKey].src);
      mapPins = c.mapData[currentMapKey].pins || [];
    } else {
      document.getElementById('map-img').style.display = 'none';
      document.getElementById('map-no-img').style.display = '';
      document.getElementById('map-svg-overlay').innerHTML = '';
      mapPins = [];
    }
  }
  renderPins();
  renderMapNotes();
}

function showMapImage(src) {
  const img = document.getElementById('map-img');
  const noImg = document.getElementById('map-no-img');
  img.src = src;
  img.style.display = '';
  noImg.style.display = 'none';
}

function handleMapUpload(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const src = e.target.result;
    const key = 'map_' + Date.now();
    currentMapKey = key;
    const c = getChar(); if (!c) return;
    if (!c.mapData) c.mapData = {};
    c.mapData[key] = { src, name: file.name, pins: [] };
    mapPins = [];
    saveState();
    showMapImage(src);
    document.getElementById('map-no-img').style.display = 'none';
    renderPins();
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function openMapSwitcher() {
  const c = getChar(); if (!c || !c.mapData) return;
  const keys = Object.keys(c.mapData);
  if (!keys.length) { alert('No maps saved yet.'); return; }
  const list = document.getElementById('map-switcher-list');
  list.innerHTML = keys.map(k => `
    <div class="search-result" style="cursor:pointer;" onclick="switchToMap('${k}')">
      <div class="search-result-name">${c.mapData[k].name || k}</div>
      <div class="search-result-desc">${(c.mapData[k].pins || []).length} markers</div>
    </div>
  `).join('');
  openModal('modal-map-switcher');
}

function switchToMap(key) {
  currentMapKey = key;
  renderMap();
  closeModal('modal-map-switcher');
}

let pinModeActive = false;
function togglePinMode() {
  // Block pin mode if no map is loaded
  const img = document.getElementById('map-img');
  const noMap = !currentMapKey || !img || img.style.display === 'none' || !img.src || img.src === window.location.href;
  if (noMap) {
    const btn = document.getElementById('pin-mode-btn');
    btn.style.animation = 'none';
    btn.textContent = t('no_map_loaded');
    setTimeout(() => { btn.textContent = '📍 Add Pin'; }, 1800);
    return;
  }

  pinModeActive = !pinModeActive;
  const btn = document.getElementById('pin-mode-btn');
  const overlay = document.getElementById('map-svg-overlay');
  if (pinModeActive) {
    btn.style.background = 'rgba(201,168,76,0.25)';
    btn.style.borderColor = 'var(--gold)';
    btn.textContent = t('cancel_pin');
    overlay.classList.add('drawing');
    overlay.onclick = handleMapClick;
  } else {
    btn.style.background = '';
    btn.style.borderColor = '';
    document.querySelectorAll('[data-i18n="btn_addpin"]').forEach(el => el.textContent = t('btn_addpin'));
    overlay.classList.remove('drawing');
    overlay.onclick = null;
  }
}

function handleMapClick(e) {
  const svg = document.getElementById('map-svg-overlay');
  const rect = svg.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * 100;
  const py = ((e.clientY - rect.top) / rect.height) * 100;
  state.pendingPin = { x: px, y: py };
  state.editingPinIdx = null;
  document.getElementById('pin-title').value = '';
  document.getElementById('pin-note').value = '';
  document.getElementById('delete-pin-btn').style.display = 'none';
  openModal('modal-pin');
  togglePinMode();
}

function savePin() {
  const title = document.getElementById('pin-title').value || 'Location';
  const note = document.getElementById('pin-note').value;
  const color = document.getElementById('pin-color').value;

  const c = getChar(); if (!c || !currentMapKey) return;
  if (!c.mapData[currentMapKey].pins) c.mapData[currentMapKey].pins = [];

  if (state.editingPinIdx !== null) {
    c.mapData[currentMapKey].pins[state.editingPinIdx] = { ...c.mapData[currentMapKey].pins[state.editingPinIdx], title, note, color };
  } else if (state.pendingPin) {
    c.mapData[currentMapKey].pins.push({ ...state.pendingPin, title, note, color, id: Date.now() });
  }
  mapPins = c.mapData[currentMapKey].pins;
  saveState(); renderPins(); renderMapNotes();
  closeModal('modal-pin');
}

function deletePin() {
  const c = getChar(); if (!c || !currentMapKey || state.editingPinIdx === null) return;
  c.mapData[currentMapKey].pins.splice(state.editingPinIdx, 1);
  mapPins = c.mapData[currentMapKey].pins;
  saveState(); renderPins(); renderMapNotes();
  closeModal('modal-pin');
}

function renderPins() {
  const svg = document.getElementById('map-svg-overlay');
  const img = document.getElementById('map-img');
  svg.innerHTML = '';
  if (!mapPins.length || img.style.display === 'none') return;
  mapPins.forEach((pin, i) => {
    const cx = pin.x + '%', cy = pin.y + '%';
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'map-pin');
    g.setAttribute('transform', `translate(0,0)`);
    g.onclick = (e) => { e.stopPropagation(); editPin(i); };
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx); circle.setAttribute('cy', cy);
    circle.setAttribute('r', '1.5%'); circle.setAttribute('fill', pin.color || '#c9a84c');
    circle.setAttribute('stroke', 'rgba(0,0,0,0.6)'); circle.setAttribute('stroke-width', '0.3%');
    circle.setAttribute('opacity', '0.9');
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', cx); text.setAttribute('y', `calc(${cy} - 2%)`);
    text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', pin.color || '#c9a84c');
    text.setAttribute('font-size', '1.5%'); text.setAttribute('font-family', 'Cinzel, serif');
    text.textContent = pin.title;
    g.appendChild(circle); g.appendChild(text);
    svg.appendChild(g);
  });
}

function editPin(idx) {
  const pin = mapPins[idx];
  state.editingPinIdx = idx;
  state.pendingPin = null;
  document.getElementById('pin-title').value = pin.title || '';
  document.getElementById('pin-note').value = pin.note || '';
  document.getElementById('pin-color').value = pin.color || '#c9a84c';
  document.getElementById('delete-pin-btn').style.display = '';
  openModal('modal-pin');
}

function renderMapNotes() {
  const list = document.getElementById('map-notes-list');
  if (!mapPins.length) { list.innerHTML = ''; return; }
  list.innerHTML = mapPins.map((pin, i) => `
    <div class="map-note" onclick="editPin(${i})" style="cursor:pointer;border-color:${pin.color || 'var(--border)'}33;">
      <div class="map-note-header"><span style="color:${pin.color||'var(--gold)'}">📍 ${pin.title || 'Marker'}</span><span style="font-size:0.7rem;">${Math.round(pin.x)}%, ${Math.round(pin.y)}%</span></div>
      ${pin.note ? `<div>${pin.note}</div>` : ''}
    </div>
  `).join('');
}

function exportMap() {
  const c = getChar();
  if (!c || !currentMapKey || !c.mapData || !c.mapData[currentMapKey]) { alert('No map to export.'); return; }
  const data = JSON.stringify(c.mapData[currentMapKey]);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = (c.mapData[currentMapKey].name || 'map') + '_export.json';
  a.click(); URL.revokeObjectURL(url);
}

function importMapData() { document.getElementById('map-import-input').click(); }

function handleMapImport(event) {
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      const key = 'map_' + Date.now();
      const c = getChar(); if (!c) return;
      if (!c.mapData) c.mapData = {};
      c.mapData[key] = data;
      currentMapKey = key;
      mapPins = data.pins || [];
      saveState(); renderMap();
    } catch (err) { alert('Invalid map file.'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }

// Close on bg click
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); });
});


// ============================================================
// INTERNATIONALISATION (i18n)
// ============================================================
const UI_STRINGS = {
  en: {
    tab_character:     'Character',
    tab_stats:         'Stats',
    tab_map:           'Map',
    tab_combat:        'Combat',
    tab_inventory:     'Inventory',
    subtab_items:      'Items',
    subtab_companions: 'Companions',
    panel_cultivation: 'Cultivation',
    panel_identity:    'Identity',
    panel_corestats:   'Core Stats (Base Values)',
    panel_equipment:   'Equipment Slots',
    panel_compstats:   'Computed Stats',
    panel_equipbonus:  'Equipment Bonuses',
    panel_map:         'Map',
    panel_combat:      'Combat Skills',
    panel_culttechs:   'Cultivation Techniques',
    panel_inventory:   'Inventory',
    panel_companions:  'Spirit Companions',
    lbl_charname:      'Character Name',
    lbl_qi_cult:       'Qi Cultivation',
    lbl_soul_cult:     'Soul Cultivation',
    lbl_stage:         'Stage',
    lbl_sublevel:      'Sub-Level',
    lbl_qipower:       'Qi Power',
    lbl_soulpower:     'Soul Power',
    lbl_str:           'Strength',
    lbl_agi:           'Agility',
    lbl_end:           'Endurance',
    lbl_int:           'Intelligence',
    btn_uploadmap:     'Upload Map',
    btn_switchmap:     '🔄 Switch Map',
    btn_addpin:        '📍 Add Pin',
    btn_export:        '⬇ Export',
    btn_import:        '⬆ Import',
    btn_searchskills:  '🔍 Search Skills',
    btn_addcustskill:  '＋ Add Custom Skill',
    btn_searchtechs:   '🔍 Search Techniques',
    btn_addcustom:     '＋ Add Custom',
    btn_searchitems:   '🔍 Search Items',
    btn_addcustitem:   '＋ Add Custom Item',
    btn_searchcomp:    '🔍 Search Companions',
    btn_exportitems:   'Export Items',
    btn_importitems:   'Import Items',
    section_basestats:    'Base Stats',
    section_derivedstats: 'Derived Stats',
    // Item type labels
    type_weapon:        'Weapon',
    type_armor:         'Armor',
    type_flame:         'Flame',
    type_soul:          'Soul',
    type_core:          'Core',
    type_artifact:      'Artifact',
    type_utility:       'Utility Item',
    type_pill:          'Cultivation Pill',
    // Stat labels
    stat_strength:    'Strength',
    stat_agility:     'Agility',
    stat_endurance:   'Endurance',
    stat_intelligence:'Intelligence',
    stat_qiStr:       'Qi Strength',
    stat_qiDef:       'Qi Defense',
    stat_soulStr:     'Soul Strength',
    stat_soulDef:     'Soul Defense',
    // Modal titles
    modal_createchar:   'Create Character',
    modal_search:       'Search',
    modal_equip:        'Equip',
    modal_savedmaps:    'Saved Maps',
    modal_mapmarker:    'Map Marker',
    modal_addskill:     'Add Custom Skill',
    modal_additem:      'Add Custom Item',
    modal_settings:     'Settings',
    modal_deletechar:   'Delete Character',
    // Misc
    consume_pill:       '✦ Consume Pill',
    no_map_loaded:      '⚠ No Map Loaded',
    cancel_pin:         '✕ Cancel Pin',
  },
  de: {
    tab_character:     'Charakter',
    tab_stats:         'Werte',
    tab_map:           'Karte',
    tab_combat:        'Kampf',
    tab_inventory:     'Inventar',
    subtab_items:      'Gegenstände',
    subtab_companions: 'Begleiter',
    panel_cultivation: 'Kultivierung',
    panel_identity:    'Identität',
    panel_corestats:   'Kernwerte (Basiswerte)',
    panel_equipment:   'Ausrüstungsplätze',
    panel_compstats:   'Berechnete Werte',
    panel_equipbonus:  'Ausrüstungsboni',
    panel_map:         'Karte',
    panel_combat:      'Kampffähigkeiten',
    panel_culttechs:   'Kultivierungstechniken',
    panel_inventory:   'Inventar',
    panel_companions:  'Geistbegleiter',
    lbl_charname:      'Charaktername',
    lbl_qi_cult:       'Qi-Kultivierung',
    lbl_soul_cult:     'Seelen-Kultivierung',
    lbl_stage:         'Stufe',
    lbl_sublevel:      'Unterstufe',
    lbl_qipower:       'Qi-Kraft',
    lbl_soulpower:     'Seelenkraft',
    lbl_str:           'Stärke',
    lbl_agi:           'Agilität',
    lbl_end:           'Ausdauer',
    lbl_int:           'Intelligenz',
    btn_uploadmap:     'Karte hochladen',
    btn_switchmap:     '🔄 Karte wechseln',
    btn_addpin:        '📍 Markierung setzen',
    btn_export:        '⬇ Exportieren',
    btn_import:        '⬆ Importieren',
    btn_searchskills:  '🔍 Fähigkeiten suchen',
    btn_addcustskill:  '＋ Eigene Fähigkeit',
    btn_searchtechs:   '🔍 Techniken suchen',
    btn_addcustom:     '＋ Hinzufügen',
    btn_searchitems:   '🔍 Gegenstände suchen',
    btn_addcustitem:   '＋ Eigener Gegenstand',
    btn_searchcomp:    '🔍 Begleiter suchen',
    btn_exportitems:   'Gegenstände exportieren',
    btn_importitems:   'Gegenstände importieren',
    section_basestats:    'Basiswerte',
    section_derivedstats: 'Abgeleitete Werte',
    type_weapon:        'Waffe',
    type_armor:         'Rüstung',
    type_flame:         'Flamme',
    type_soul:          'Seele',
    type_core:          'Kern',
    type_artifact:      'Artefakt',
    type_utility:       'Nützlicher Gegenstand',
    type_pill:          'Kultivierungspille',
    stat_strength:    'Stärke',
    stat_agility:     'Agilität',
    stat_endurance:   'Ausdauer',
    stat_intelligence:'Intelligenz',
    stat_qiStr:       'Qi-Stärke',
    stat_qiDef:       'Qi-Verteidigung',
    stat_soulStr:     'Seelensstärke',
    stat_soulDef:     'Seelenverteidigung',
    modal_createchar:   'Charakter erstellen',
    modal_search:       'Suchen',
    modal_equip:        'Ausrüsten',
    modal_savedmaps:    'Gespeicherte Karten',
    modal_mapmarker:    'Kartenmarkierung',
    modal_addskill:     'Eigene Fähigkeit hinzufügen',
    modal_additem:      'Eigenen Gegenstand hinzufügen',
    modal_settings:     'Einstellungen',
    modal_deletechar:   'Charakter löschen',
    consume_pill:       '✦ Pille einnehmen',
    no_map_loaded:      '⚠ Keine Karte geladen',
    cancel_pin:         '✕ Markierung abbrechen',
  }
};

let currentLang = 'en';

function t(key) {
  return (UI_STRINGS[currentLang] || UI_STRINGS.en)[key] || (UI_STRINGS.en[key] || key);
}

function applyI18n() {
  // Update all data-i18n tagged elements
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val) el.textContent = val;
  });

  // Update placeholders
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.placeholder = currentLang === 'de' ? 'Nach Name, Typ suchen...' : 'Search by name, type, rank...';

  // Update modal titles
  const modalTitles = {
    'modal-add-char':      'modal_createchar',
    'modal-search':        'modal_search',
    'modal-map-switcher':  'modal_savedmaps',
    'modal-pin':           'modal_mapmarker',
    'modal-custom-skill':  'modal_addskill',
    'modal-custom-item':   'modal_additem',
    'modal-settings':      'modal_settings',
    'modal-delete-char':   'modal_deletechar',
  };
  Object.entries(modalTitles).forEach(([modalId, key]) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    const titleEl = modal.querySelector('.modal-title');
    if (titleEl) {
      // Preserve icon prefix if present (e.g. ⚙, ⚠)
      const icons = {'modal-settings':'⚙ ','modal-delete-char':'⚠ '};
      titleEl.textContent = (icons[modalId] || '') + t(key);
    }
  });

  // Update equip modal title dynamically based on current slot
  if (state.currentEquipSlot) {
    const slotLabel = state.currentEquipSlot.charAt(0).toUpperCase() + state.currentEquipSlot.slice(1);
    const el = document.getElementById('equip-modal-title');
    if (el) el.textContent = t('modal_equip') + ' ' + slotLabel;
  }

  // Re-render anything that uses translated stat labels or type labels
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
}

// ============================================================
// PILL / CULTIVATION ADVANCEMENT ENGINE  (hidden from players)
// ============================================================
const POINTS_PER_LEVEL = 10; // pills needed to advance one sublevel

// Advance a single track ('qi' or 'soul') by a number of points.
// Returns true if a level-up occurred.
function advanceCultivation(c, track, points) {
  if (!c || points <= 0) return false;
  const ptKey    = track === 'qi' ? 'qiPillPts'   : 'soulPillPts';
  const stageKey = track === 'qi' ? 'qiStage'     : 'soulStage';
  const subKey   = track === 'qi' ? 'qiSublevel'  : 'soulSublevel';

  c[ptKey] = (c[ptKey] || 0) + points;
  let levelled = false;

  while (c[ptKey] >= POINTS_PER_LEVEL) {
    c[ptKey] -= POINTS_PER_LEVEL;
    levelled = true;

    const curSub   = SUBLEVEL_ORDER.indexOf(c[subKey]  || 'Early');
    const curStage = STAGE_ORDER.indexOf(c[stageKey] || 'Mortal');

    if (curSub < SUBLEVEL_ORDER.length - 1) {
      // Advance sublevel
      c[subKey] = SUBLEVEL_ORDER[curSub + 1];
    } else {
      // At Peak — advance stage if not already at max
      if (curStage < STAGE_ORDER.length - 1) {
        c[stageKey] = STAGE_ORDER[curStage + 1];
        c[subKey]   = 'Early';
      } else {
        // Already at Dao Completion Peak — cap points at max
        c[ptKey] = POINTS_PER_LEVEL - 1;
        break;
      }
    }
  }
  return levelled;
}

// Called when a pill is consumed from inventory
function consumePill(itemName) {
  const c = getChar(); if (!c) return;
  // Find the pill in inventory
  const idx = c.items.findIndex(i => i.name === itemName && i.type === 'Cultivation Pill');
  if (idx < 0) return;
  const pill = c.items[idx];
  const pts   = pill.pillPoints  || 1;
  const track = pill.pillTrack   || 'qi';

  // Remove one from inventory
  c.items.splice(idx, 1);

  // Apply cultivation advancement points
  let levelled = false;
  if (track === 'both') {
    levelled = advanceCultivation(c, 'qi',   pts) || levelled;
    levelled = advanceCultivation(c, 'soul', pts) || levelled;
  } else {
    levelled = advanceCultivation(c, track, pts);
  }

  // Also boost Qi/Soul power — each pill point adds power proportional to rank
  const powerGain = pts * 50;
  if (track === 'qi' || track === 'both') {
    c.qi = Math.min(10000, (c.qi || 0) + powerGain);
    syncQiInput(c);
  }
  if (track === 'soul' || track === 'both') {
    c.soul = Math.min(10000, (c.soul || 0) + powerGain);
    syncSoulInput(c);
  }

  saveState();

  // Sync selects to new stage/sublevel without triggering saveChar loop
  syncCultSelects(c);
  updateCultDisplay();
  renderItemList(c.items);

  if (levelled) showLevelUpFlash(c, track);
}

// Sync qi/soul number inputs after pill consumption
function syncQiInput(c) {
  const el = document.getElementById('char-qi');
  if (el) el.value = c.qi || 0;
}
function syncSoulInput(c) {
  const el = document.getElementById('char-soul');
  if (el) el.value = c.soul || 0;
}

// Sync the hidden selects to match c's actual stage/sublevel
function syncCultSelects(c) {
  const qs  = document.getElementById('qi-stage');
  const qsl = document.getElementById('qi-sublevel');
  const ss  = document.getElementById('soul-stage');
  const ssl = document.getElementById('soul-sublevel');
  if (qs)  qs.value  = c.qiStage    || 'Mortal';
  if (qsl) qsl.value = c.qiSublevel || 'Early';
  if (ss)  ss.value  = c.soulStage  || 'Mortal';
  if (ssl) ssl.value = c.soulSublevel || 'Early';
}

// Brief visual flash when levelling up
function showLevelUpFlash(c, track) {
  const panelEl = document.getElementById('cultivation-panel');
  if (!panelEl) return;
  const color = track === 'soul' ? '#a78bfa' : '#67e8f9';
  panelEl.style.transition = 'box-shadow 0.3s';
  panelEl.style.boxShadow = `0 0 40px ${color}`;
  setTimeout(() => { panelEl.style.boxShadow = ''; }, 1200);
}


// ============================================================
// DAO SYSTEM
// ============================================================
const DAO_DEFINITIONS = [
  { id:'fire',    name:'Fire Dao',    icon:'🔥', color:'#f97316', desc:'The Dao of heat, destruction, and rebirth through flame.' },
  { id:'water',   name:'Water Dao',   icon:'💧', color:'#06b6d4', desc:'The Dao of flow, adaptability, and unstoppable erosion.' },
  { id:'earth',   name:'Earth Dao',   icon:'🪨', color:'#78716c', desc:'The Dao of endurance, stability, and unshakeable foundation.' },
  { id:'wind',    name:'Wind Dao',    icon:'🌪', color:'#a3e635', desc:'The Dao of freedom, speed, and unseen force.' },
  { id:'thunder', name:'Thunder Dao', icon:'⚡', color:'#eab308', desc:'The Dao of judgment, power, and heaven\'s wrath.' },
  { id:'void',    name:'Void Dao',    icon:'🌑', color:'#6366f1', desc:'The Dao of emptiness, potential, and the space between all things.' },
  { id:'life',    name:'Life Dao',    icon:'🌿', color:'#10b981', desc:'The Dao of growth, healing, and the endless cycle of existence.' },
  { id:'death',   name:'Death Dao',   icon:'💀', color:'#64748b', desc:'The Dao of endings, transformation, and the silence beyond.' },
  { id:'space',   name:'Space Dao',   icon:'🌌', color:'#8b5cf6', desc:'The Dao of distance, dimension, and the fabric of reality.' },
  { id:'time',    name:'Time Dao',    icon:'⏳', color:'#ec4899', desc:'The Dao of past, future, and the eternal present moment.' },
];
const GRAND_DAO = { id:'grand', name:'The Dao', icon:'∞', color:'#c9a84c', desc:'The Dao of Everything. The origin and end of all paths.' };
const DAO_MAX_LEVEL = 10;

function daoDefaults() {
  const d = {};
  DAO_DEFINITIONS.forEach(dao => { d[dao.id] = 0; });
  d['grand'] = 0;
  d['custom'] = [];
  return d;
}

function getCharDaos() {
  const c = getChar(); if (!c) return null;
  if (!c.daos) c.daos = daoDefaults();
  // Ensure all dao keys exist
  DAO_DEFINITIONS.forEach(dao => { if (c.daos[dao.id] === undefined) c.daos[dao.id] = 0; });
  if (c.daos.grand === undefined) c.daos.grand = 0;
  if (!c.daos.custom) c.daos.custom = [];
  return c.daos;
}

function allDaosMaxed() {
  const daos = getCharDaos(); if (!daos) return false;
  return DAO_DEFINITIONS.every(d => daos[d.id] >= DAO_MAX_LEVEL);
}

function grandDaoMaxed() {
  const daos = getCharDaos(); if (!daos) return false;
  return daos.grand >= DAO_MAX_LEVEL;
}

function adjustDao(daoId, delta) {
  const c = getChar(); if (!c) return;
  const daos = getCharDaos();
  const current = daos[daoId] || 0;
  daos[daoId] = Math.max(0, Math.min(DAO_MAX_LEVEL, current + delta));
  saveState();
  renderDaoPanel();
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
}

function adjustGrandDao(delta) {
  if (!allDaosMaxed()) return;
  const c = getChar(); if (!c) return;
  const daos = getCharDaos();
  daos.grand = Math.max(0, Math.min(DAO_MAX_LEVEL, (daos.grand || 0) + delta));
  saveState();
  renderDaoPanel();
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
}

function renderDaoPanel() {
  const daos = getCharDaos(); if (!daos) return;

  // ── Render each of the 10 Daos ─────────────────────────────────────────────
  const list = document.getElementById('dao-list'); if (!list) return;
  list.innerHTML = DAO_DEFINITIONS.map(dao => {
    const level = daos[dao.id] || 0;
    const pct   = (level / DAO_MAX_LEVEL) * 100;
    const isMax = level >= DAO_MAX_LEVEL;
    const pipsHtml = Array.from({length: DAO_MAX_LEVEL}).map((_, i) =>
      `<div class="dao-pip${i < level ? ' filled' : ''}" style="${i < level ? `background:${dao.color};box-shadow:0 0 5px ${dao.color}55;` : ''}"></div>`
    ).join('');
    return `<div class="dao-card${isMax ? ' maxed' : ''}" style="--dao-color:${dao.color};">
      <div class="dao-header">
        <div class="dao-name">
          <span style="font-size:1.1rem;">${dao.icon}</span>
          <span style="color:${dao.color};">${dao.name}</span>
        </div>
        <div class="dao-level-display" style="color:${dao.color};">
          ${isMax ? '✦ MASTERED' : `Level ${level} / ${DAO_MAX_LEVEL}`}
        </div>
      </div>
      <div class="dao-desc">${dao.desc}</div>
      <div class="dao-pips">${pipsHtml}</div>
      ${(() => {
        const milestones = DAO_MILESTONES[dao.id] || [];
        const next = milestones.find(m => m.level > level);
        const latest = [...milestones].reverse().find(m => m.level <= level);
        let mHtml = '';
        if (latest) mHtml += `<div style="font-size:0.78rem;color:var(--jade);margin-bottom:5px;line-height:1.4;"><span style="font-family:'Cinzel',serif;font-size:0.62rem;opacity:0.7;">✦ Active: </span>${latest.effect}</div>`;
        if (next && !isMax) mHtml += `<div style="font-size:0.75rem;color:var(--text-dim);margin-bottom:7px;font-style:italic;"><span style="font-family:'Cinzel',serif;font-size:0.6rem;opacity:0.6;">Next at Lv.${next.level}: </span>${next.effect}</div>`;
        return mHtml;
      })()}
      <div class="dao-btn-row">
        <button class="dao-btn dao-btn-up" onclick="adjustDao('${dao.id}', 1)"${isMax ? ' disabled style="opacity:0.3;cursor:default;"' : ''} class="admin-only">+ Comprehend</button>
        <button class="dao-btn dao-btn-down" onclick="adjustDao('${dao.id}', -1)"${level <= 0 ? ' disabled style="opacity:0.3;cursor:default;"' : ''}>−</button>
      </div>
    </div>`;
  }).join('');

  // ── Grand Dao panel ──────────────────────────────────────────────────────────
  const grandPanel  = document.getElementById('grand-dao-panel');
  const grandStatus = document.getElementById('grand-dao-status');
  const grandContent= document.getElementById('grand-dao-content');
  const grandLvlDisp= document.getElementById('grand-dao-level-disp');
  const grandPips   = document.getElementById('grand-dao-pips');
  if (!grandPanel) return;

  const unlocked = allDaosMaxed();
  grandPanel.classList.toggle('grand-dao-locked', !unlocked);

  if (unlocked) {
    const grandLvl = daos.grand || 0;
    const gIsMax   = grandLvl >= DAO_MAX_LEVEL;
    grandStatus.textContent = gIsMax ? '∞ THE DAO HAS BEEN REACHED' : 'All Daos mastered — The Dao awaits your comprehension.';
    grandContent.style.display = '';
    grandLvlDisp.textContent = gIsMax ? '✦ COMPLETE ✦' : `Level ${grandLvl} / ${DAO_MAX_LEVEL}`;
    if (grandPips) {
      grandPips.innerHTML = Array.from({length: DAO_MAX_LEVEL}).map((_, i) =>
        `<div class="dao-pip${i < grandLvl ? ' filled' : ''}" style="${i < grandLvl ? 'background:#c9a84c;box-shadow:0 0 6px rgba(201,168,76,0.6);' : ''}"></div>`
      ).join('');
    }
    // Show active Grand Dao milestone
    const grandMilestones = DAO_MILESTONES.grand || [];
    const grandLatest = [...grandMilestones].reverse().find(m => m.level <= (daos.grand || 0));
    const grandNext   = grandMilestones.find(m => m.level > (daos.grand || 0));
    let grandMHtml = document.getElementById('grand-dao-milestone');
    if (!grandMHtml) {
      grandMHtml = document.createElement('div');
      grandMHtml.id = 'grand-dao-milestone';
      grandMHtml.style.cssText = 'margin:10px 0;font-size:0.82rem;';
      grandContent.appendChild(grandMHtml);
    }
    grandMHtml.innerHTML = (grandLatest ? `<div style="color:var(--jade);margin-bottom:6px;line-height:1.4;"><span style="font-family:'Cinzel',serif;font-size:0.62rem;opacity:0.7;color:var(--gold-dim);">✦ Active: </span>${grandLatest.effect}</div>` : '') +
      (grandNext ? `<div style="color:var(--text-dim);font-style:italic;font-size:0.78rem;"><span style="font-family:'Cinzel',serif;font-size:0.6rem;opacity:0.6;">Next at Lv.${grandNext.level}: </span>${grandNext.effect}</div>` : '');
  } else {
    const remaining = DAO_DEFINITIONS.filter(d => (daos[d.id] || 0) < DAO_MAX_LEVEL).length;
    grandStatus.textContent = `Master all 10 Daos at level 10 to unlock this. (${remaining} remaining)`;
    grandContent.style.display = 'none';
  }

  // ── Custom Dao section ───────────────────────────────────────────────────────
  const customSection = document.getElementById('custom-dao-section');
  if (customSection) {
    customSection.style.display = grandDaoMaxed() ? '' : 'none';
  }
  renderCustomDaos();
}

function renderCustomDaos() {
  const daos = getCharDaos(); if (!daos) return;
  const list = document.getElementById('custom-dao-list'); if (!list) return;
  const customs = daos.custom || [];
  if (!customs.length) {
    list.innerHTML = '<div class="empty-state" style="padding:16px;">No custom Daos forged yet.</div>';
    return;
  }
  list.innerHTML = customs.map((d, i) => `
    <div class="custom-dao-card" style="border-color:${d.color || 'var(--gold)'}44;">
      <button class="remove-btn" onclick="removeCustomDao(${i})" title="Remove">✕</button>
      <div class="custom-dao-name" style="color:${d.color || 'var(--gold)'};">${d.name || 'Unnamed Dao'}</div>
      <div class="custom-dao-desc">${d.desc || ''}</div>
    </div>
  `).join('');
}

function openCreateCustomDao() {
  document.getElementById('custom-dao-name').value = '';
  document.getElementById('custom-dao-desc').value = '';
  openModal('modal-custom-dao');
}

function saveCustomDao() {
  const c = getChar(); if (!c) return;
  const daos = getCharDaos();
  const name  = document.getElementById('custom-dao-name').value.trim();
  const desc  = document.getElementById('custom-dao-desc').value.trim();
  const color = document.getElementById('custom-dao-color').value;
  if (!name) { document.getElementById('custom-dao-name').focus(); return; }
  daos.custom.push({ name, desc, color });
  saveState(); renderDaoPanel();
  closeModal('modal-custom-dao');
}

function removeCustomDao(idx) {
  const c = getChar(); if (!c) return;
  const daos = getCharDaos();
  daos.custom.splice(idx, 1);
  saveState(); renderDaoPanel();
}

function switchCharSubTab(name, btn) {
  document.querySelectorAll('.char-sub-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.char-sub-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('char-sub-' + name).classList.add('active');
  if (name === 'dao') { renderDaoPanel(); }
  // Also re-render stats so Dao bonuses update
  if (document.getElementById('tab-stats').classList.contains('active')) renderStats();
}
// ============================================================
// EXPORT / IMPORT
// ============================================================

// ── Items export/import ───────────────────────────────────────────────────────
function exportItems() {
  const c = getChar(); if (!c) return;
  const data = { version: '1.0', type: 'dao_items', characterName: c.name, items: c.items || [] };
  downloadJSON(data, (c.name || 'character') + '_items.json');
}

function importItems() {
  triggerFileInput('import-items-input');
}

function handleItemsImport(event) {
  const file = event.target.files[0]; if (!file) return;
  readJSONFile(file, data => {
    if (!data.items || data.type !== 'dao_items') { alert('Invalid items file.'); return; }
    const c = getChar(); if (!c) return;
    // Merge — skip duplicates for equip-slot types
    const UNIQUE = new Set(['Weapon','Armor','Flame','Soul','Core']);
    let added = 0;
    data.items.forEach(item => {
      if (UNIQUE.has(item.type) && c.items.some(i => i.name === item.name)) return;
      c.items.push(item);
      added++;
    });
    saveState(); renderItemList(c.items);
    alert(`Imported ${added} item(s).`);
  });
  event.target.value = '';
}

// ── Full character export/import ──────────────────────────────────────────────
function exportCharacter() {
  const c = getChar(); if (!c) return;
  const data = { version: '1.0', type: 'dao_character', character: c };
  downloadJSON(data, (c.name || 'character') + '_save.json');
}

function importCharacter() {
  triggerFileInput('import-char-input');
}

function handleCharImport(event) {
  const file = event.target.files[0]; if (!file) return;
  readJSONFile(file, data => {
    if (!data.character || data.type !== 'dao_character') { alert('Invalid character file.'); return; }
    state.characters.push(data.character);
    state.activeCharIdx = state.characters.length - 1;
    saveState(); loadCharToUI(); renderCharSwitcher();
    alert('Character "' + (data.character.name || 'Unknown') + '" imported successfully.');
  });
  event.target.value = '';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}

function triggerFileInput(id) {
  document.getElementById(id).click();
}

function readJSONFile(file, callback) {
  const reader = new FileReader();
  reader.onload = e => {
    try { callback(JSON.parse(e.target.result)); }
    catch(err) { alert('Could not read file: ' + err.message); }
  };
  reader.readAsText(file);
}


// ============================================================
// LORE / PLAQUES
// ============================================================
let allPlaques = [];

const CATEGORY_ICON = {
  Power:'⚡', Person:'👤', Faction:'🏛', Location:'🗺',
  Beast:'🐉', Artifact:'🔮', Event:'📅'
};
const CATEGORY_COLOR = {
  Power:'#c9a84c', Person:'#06b6d4', Faction:'#8b5cf6',
  Location:'#10b981', Beast:'#f97316', Artifact:'#ec4899', Event:'#64748b'
};

async function loadPlaques() {
  try {
    allPlaques = await sbFetch('plaques', 'order=sort_order.asc,name.asc');
    filterPlaques();
  } catch(e) {
    console.error('Failed to load plaques:', e);
    document.getElementById('lore-grid').innerHTML =
      '<div style="text-align:center;padding:40px;color:#f87171;grid-column:1/-1;">Failed to load plaques: ' + e.message + '</div>';
  }
}

function filterPlaques() {
  const q    = (document.getElementById('lore-search')?.value || '').toLowerCase();
  const cat  = document.getElementById('lore-category-filter')?.value || '';
  let list   = allPlaques;
  if (cat) list = list.filter(p => p.category === cat);
  if (q)   list = list.filter(p =>
    (p.name||'').toLowerCase().includes(q) ||
    (p.description||'').toLowerCase().includes(q) ||
    (p.lore||'').toLowerCase().includes(q) ||
    (p.tags||[]).some(t => t.toLowerCase().includes(q))
  );
  renderPlaques(list);
}

function renderPlaques(plaques) {
  const grid = document.getElementById('lore-grid');
  if (!plaques.length) {
    grid.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-dim);font-style:italic;grid-column:1/-1;">No plaques found.</div>';
    return;
  }
  grid.innerHTML = plaques.map(p => {
    const color = CATEGORY_COLOR[p.category] || 'var(--gold-dim)';
    const icon  = CATEGORY_ICON[p.category]  || '📜';
    const imgHtml = p.image_url
      ? `<img class="plaque-img" src="${p.image_url}" alt="${p.name}" loading="lazy">`
      : `<div class="plaque-img-placeholder">${icon}</div>`;
    return `<div class="plaque-card" style="--plaque-color:${color};"
        onclick='openPlaque(${JSON.stringify(p).replace(/'/g,"&#39;")})'>
      ${imgHtml}
      <div class="plaque-body">
        <div class="plaque-name">${p.name}</div>
        <div class="plaque-meta">
          ${p.category ? `<span class="badge" style="color:${color};border-color:${color}44;background:${color}11;">${icon} ${p.category}</span>` : ''}
          ${p.rank     ? `<span class="badge badge-gold">${p.rank}</span>` : ''}
        </div>
        ${p.description ? `<div class="plaque-desc">${p.description}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function openPlaque(p) {
  document.getElementById('plaque-modal-name').textContent = p.name;
  const color = CATEGORY_COLOR[p.category] || 'var(--gold)';
  const icon  = CATEGORY_ICON[p.category]  || '📜';

  // Image
  const imgWrap = document.getElementById('plaque-modal-img-wrap');
  imgWrap.innerHTML = p.image_url
    ? `<img class="plaque-detail-img" src="${p.image_url}" alt="${p.name}">`
    : '';

  // Badges
  const badges = document.getElementById('plaque-modal-badges');
  badges.innerHTML =
    (p.category ? `<span class="badge" style="color:${color};border-color:${color}44;background:${color}11;">${icon} ${p.category}</span>` : '') +
    (p.rank     ? `<span class="badge badge-gold">${p.rank}</span>` : '') +
    (p.tags||[]).map(t => `<span class="badge" style="color:var(--text-dim);border-color:var(--border);">${t}</span>`).join('');

  document.getElementById('plaque-modal-desc').textContent = p.description || '';
  document.getElementById('plaque-modal-lore').textContent = p.lore || '';
  openModal('modal-plaque');
}


// ============================================================
// GOLD, SHOP & ALCHEMY
// ============================================================
let allShopIngredients = [];
let allRecipes         = [];
let charIngredients    = {};  // { name: quantity }
let charGold           = 0;

const RARITY_COLOR = {
  Common:'#9ca3af', Uncommon:'#34d399', Rare:'#60a5fa',
  Epic:'#a78bfa', Legendary:'#f59e0b', Mythic:'#f0abfc'
};
const RARITY_CLASS = {
  Common:'rarity-common', Uncommon:'rarity-uncommon', Rare:'rarity-rare',
  Epic:'rarity-epic', Legendary:'rarity-legendary', Mythic:'rarity-mythic'
};
const CAT_ICON = {
  Herb:'🌿', Mineral:'💎', 'Beast Core':'💠', 'Flame Essence':'🔥',
  'Spirit Water':'💧', 'Void Crystal':'🔮'
};

// ── Load from Supabase ────────────────────────────────────────
async function loadShopData() {
  // Show loading state on shop tab if it's open
  const grid = document.getElementById('shop-grid');
  const rgrid = document.getElementById('recipe-grid');
  if (grid)  grid.innerHTML  = '<div style="color:var(--text-dim);padding:20px;grid-column:1/-1;">Loading catalog…</div>';
  if (rgrid) rgrid.innerHTML = '<div style="color:var(--text-dim);padding:20px;grid-column:1/-1;">Loading recipes…</div>';
  try {
    const [shopRes, recipesRes] = await Promise.all([
      sbFetch('shop_ingredients', 'in_stock=eq.true'),
      sbFetch('alchemy_recipes', 'order=pill_name.asc'),
    ]);
    allShopIngredients = shopRes  || [];
    allRecipes         = recipesRes || [];
    console.log('Shop loaded:', allShopIngredients.length, 'ingredients,', allRecipes.length, 'recipes');
    // Re-render if shop/alchemy tab is active
    if (document.getElementById('tab-shop')?.classList.contains('active'))    filterShop();
    if (document.getElementById('tab-alchemy')?.classList.contains('active')) { renderIngredientPouch(); filterRecipes(); }
  } catch(e) {
    console.error('loadShopData error:', e);
    if (grid)  grid.innerHTML  = `<div style="color:#f87171;padding:20px;grid-column:1/-1;">Failed to load shop: ${e.message}</div>`;
    if (rgrid) rgrid.innerHTML = `<div style="color:#f87171;padding:20px;grid-column:1/-1;">Failed to load recipes: ${e.message}</div>`;
  }
}

async function loadCharIngredients() {
  const charId = currentCharId || getChar()?._dbId;
  if (!charId) { console.log('loadCharIngredients: no charId yet, skipping'); return; }

  // Show gold from local state immediately (set by loadCharacterFromDB)
  const localGold = getChar()?.gold;
  if (localGold !== undefined) { charGold = localGold; updateGoldDisplay(); }

  try {
    const res = await sbFetch('character_ingredients', `character_id=eq.${charId}`);
    charIngredients = {};
    (res || []).forEach(row => { charIngredients[row.ingredient_name] = row.quantity; });

    // Confirm gold from DB (picks up any admin changes since last load)
    const { data: goldData, error: goldErr } = await _sb
      .from('characters')
      .select('gold')
      .eq('id', charId)
      .single();
    if (goldErr) throw goldErr;
    charGold = goldData?.gold || 0;
    updateGoldDisplay();
  } catch(e) { console.error('loadCharIngredients error:', e); }
}

function updateGoldDisplay() {
  const el = document.getElementById('shop-gold-display');
  if (el) el.textContent = charGold.toLocaleString() + ' Gold';
}

// ── Shop rendering ────────────────────────────────────────────
function filterShop() {
  const q      = (document.getElementById('shop-search')?.value || '').toLowerCase();
  const cat    = document.getElementById('shop-cat-filter')?.value || '';
  const rarity = document.getElementById('shop-rarity-filter')?.value || '';
  let list = allShopIngredients;
  if (cat)    list = list.filter(i => i.category === cat);
  if (rarity) list = list.filter(i => i.rarity === rarity);
  if (q)      list = list.filter(i => (i.name||'').toLowerCase().includes(q) || (i.description||'').toLowerCase().includes(q));
  renderShop(list);
}

function renderShop(items) {
  const grid = document.getElementById('shop-grid');
  if (!grid) return;
  if (!items.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-style:italic;padding:20px;grid-column:1/-1;">No ingredients available.</div>'; return; }
  grid.innerHTML = items.map(item => {
    const col   = RARITY_COLOR[item.rarity] || 'var(--text-dim)';
    const icon  = CAT_ICON[item.category]   || '📦';
    const owned = charIngredients[item.name] || 0;
    return `<div class="shop-card">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
        <div class="shop-card-name">${icon} ${item.name}</div>
        <span style="font-family:'Cinzel',serif;font-size:0.6rem;color:${col};border:1px solid ${col}33;padding:2px 6px;border-radius:3px;white-space:nowrap;">${item.rarity}</span>
      </div>
      <div style="font-size:0.72rem;color:var(--text-dim);">${item.category}</div>
      <div class="shop-card-desc">${item.description || ''}</div>
      ${item.effect_hint ? `<div style="font-size:0.75rem;color:var(--jade);font-style:italic;">↳ ${item.effect_hint}</div>` : ''}
      <div class="shop-card-footer">
        <div>
          <div class="shop-price">💰 ${item.price} Gold</div>
          ${owned > 0 ? `<div style="font-size:0.7rem;color:var(--jade);">Owned: ${owned}</div>` : ''}
        </div>
        <div class="shop-qty-row">
          <input type="number" id="qty-${item.id}" value="1" min="1" style="width:50px;text-align:center;">
          <button class="btn" onclick="buyIngredient('${item.id}','${item.name.replace(/'/g,"\\'")}',${item.price})"
            style="padding:6px 12px;font-size:0.65rem;">Buy</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

async function buyIngredient(id, name, price) {
  const c = getChar(); if (!c || !c._dbId) return;
  const qty = parseInt(document.getElementById('qty-' + id)?.value) || 1;
  const total = price * qty;
  if (charGold < total) { showToastShop(`Not enough gold! Need ${total}, have ${charGold}.`, true); return; }

  const charId = currentCharId || c._dbId;
  if (!charId) { showToastShop('No character loaded', true); return; }
  try {
    // Deduct gold via Supabase JS client
    const newGold = charGold - total;
    const { error: goldErr } = await _sb.from('characters').update({ gold: newGold }).eq('id', charId);
    if (goldErr) throw goldErr;
    charGold = newGold;
    updateGoldDisplay();

    // Add ingredient via Supabase JS client
    const existing = charIngredients[name] || 0;
    if (existing > 0) {
      const { error: ingErr } = await _sb.from('character_ingredients')
        .update({ quantity: existing + qty })
        .eq('character_id', charId)
        .eq('ingredient_name', name);
      if (ingErr) throw ingErr;
    } else {
      const { error: ingErr } = await _sb.from('character_ingredients')
        .insert({ character_id: charId, ingredient_name: name, quantity: qty });
      if (ingErr) throw ingErr;
    }
    charIngredients[name] = existing + qty;

    // Log transaction
    await _sb.from('gold_transactions').insert({ character_id: charId, amount: -total, reason: `Bought ${qty}x ${name}` });

    showToastShop(`✓ Bought ${qty}x ${name} for ${total} gold`);
    filterShop();
    renderIngredientPouch();
    filterRecipes();
  } catch(e) { showToastShop(e.message, true); }
}

function showToastShop(msg, isErr = false) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:var(--ink-4);border:1px solid ${isErr ? 'rgba(239,68,68,0.5)' : 'var(--border-bright)'};
    border-radius:8px;padding:10px 18px;font-family:'Cinzel',serif;font-size:0.72rem;
    color:${isErr ? '#f87171' : 'var(--gold)'};z-index:500;white-space:nowrap;`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Alchemy rendering ─────────────────────────────────────────
function renderIngredientPouch() {
  const pouch = document.getElementById('ingredient-pouch');
  if (!pouch) return;
  const entries = Object.entries(charIngredients).filter(([,q]) => q > 0);
  if (!entries.length) {
    pouch.innerHTML = '<div style="color:var(--text-dim);font-style:italic;font-size:0.85rem;padding:8px 0;">Your ingredient pouch is empty. Buy ingredients from the Shop.</div>';
    return;
  }
  pouch.innerHTML = entries.map(([name, qty]) =>
    `<span class="pouch-tag">${CAT_ICON[getIngredientCategory(name)] || '📦'} ${name} <span class="pouch-tag-qty">×${qty}</span></span>`
  ).join('');
}

function getIngredientCategory(name) {
  const ingr = allShopIngredients.find(i => i.name === name);
  return ingr?.category || '';
}

function filterRecipes() {
  const q      = (document.getElementById('recipe-search')?.value || '').toLowerCase();
  const rarity = document.getElementById('recipe-rarity-filter')?.value || '';
  let list = allRecipes;
  if (rarity) list = list.filter(r => r.rarity === rarity);
  if (q)      list = list.filter(r => (r.pill_name||'').toLowerCase().includes(q) || (r.effect||'').toLowerCase().includes(q));
  renderRecipes(list);
}

function renderRecipes(recipes) {
  const grid = document.getElementById('recipe-grid');
  if (!grid) return;
  if (!recipes.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-style:italic;padding:20px;grid-column:1/-1;">No recipes found.</div>'; return; }
  grid.innerHTML = recipes.map(r => {
    const col   = RARITY_COLOR[r.rarity] || 'var(--gold-dim)';
    const ingrs = r.ingredients || [];
    // Check which ingredients player has
    const canCraft = ingrs.every(i => (charIngredients[i.name] || 0) >= i.qty);
    const ingrTags = ingrs.map(i => {
      const have = charIngredients[i.name] || 0;
      const cls  = have >= i.qty ? 'have' : 'missing';
      return `<span class="ingr-tag ${cls}">${i.name} ×${i.qty}${cls === 'missing' ? ` (${have})` : ''}</span>`;
    }).join('');
    return `<div class="recipe-card" style="--recipe-color:${col};">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;">
        <div class="recipe-name">💊 ${r.pill_name}</div>
        <span style="font-family:'Cinzel',serif;font-size:0.6rem;color:${col};border:1px solid ${col}33;padding:2px 6px;border-radius:3px;white-space:nowrap;">${r.rarity}</span>
      </div>
      <div class="recipe-effect">${r.effect || ''}</div>
      <div style="font-size:0.72rem;color:var(--text-dim);margin-bottom:6px;">
        Min. Cultivation: <span style="color:var(--gold-dim);">${r.min_qi_level}</span> ·
        Success Rate: <span style="color:${r.success_rate >= 70 ? 'var(--jade)' : r.success_rate >= 40 ? 'var(--gold)' : '#f87171'};">${r.success_rate}%</span>
      </div>
      <div class="recipe-ingredients">${ingrTags}</div>
      <button class="btn${canCraft ? '' : ' btn-danger'}" onclick="attemptCraft('${r.id}')"
        style="width:100%;font-size:0.68rem;padding:7px;${canCraft ? '' : 'opacity:0.6;cursor:not-allowed;'}">
        ${canCraft ? '⚗ Craft' : '✗ Missing Ingredients'}
      </button>
    </div>`;
  }).join('');
}

async function attemptCraft(recipeId) {
  const c = getChar(); if (!c) return;
  const charId = currentCharId || c._dbId;
  if (!charId) { showToastShop('No character loaded', true); return; }
  const recipe = allRecipes.find(r => r.id === recipeId);
  if (!recipe) return;

  // Check ingredients
  const ingrs = recipe.ingredients || [];
  const missing = ingrs.filter(i => (charIngredients[i.name] || 0) < i.qty);
  if (missing.length) { showToastShop('Missing: ' + missing.map(i => i.name).join(', '), true); return; }

  // Check cultivation level
  const STAGE_ORDER = ['Mortal','Beginner','Veteran','Master','Expert','Sage','Lord','Monarch','Immortal','Saint','Earth God','Sky God','Dao Completion'];
  const charStageIdx = STAGE_ORDER.indexOf(getChar().qiStage || 'Mortal');
  const minStageIdx  = STAGE_ORDER.indexOf(recipe.min_qi_level || 'Mortal');
  if (charStageIdx < minStageIdx) {
    showToastShop(`Requires ${recipe.min_qi_level} Qi cultivation to craft this pill.`, true); return;
  }

  // Roll success
  const roll = Math.random() * 100;
  const success = roll <= recipe.success_rate;

  // Consume ingredients regardless
  try {
    for (const ingr of ingrs) {
      const newQty = (charIngredients[ingr.name] || 0) - ingr.qty;
      charIngredients[ingr.name] = newQty;
      if (newQty <= 0) {
        await _sb.from('character_ingredients').delete().eq('character_id', charId).eq('ingredient_name', ingr.name);
        delete charIngredients[ingr.name];
      } else {
        await _sb.from('character_ingredients').update({ quantity: newQty }).eq('character_id', charId).eq('ingredient_name', ingr.name);
      }
    }

    if (success) {
      // Add pill to character inventory via character_items
      const existingPill = await sbFetch('character_items', `character_id=eq.${charId}&item_name=eq.${encodeURIComponent(recipe.pill_name)}`);
      if (existingPill && existingPill.length) {
        await _sb.from('character_items').update({ quantity: existingPill[0].quantity + 1 }).eq('id', existingPill[0].id);
      } else {
        await _sb.from('character_items').insert({
          character_id: charId,
          item_name: recipe.pill_name,
          quantity: 1,
          custom_data: {
            name: recipe.pill_name, type: 'Cultivation Pill',
            pillPoints: recipe.pill_points || 0,
            pillTrack: recipe.pill_track || 'qi',
            statBoost: recipe.stat_boost || {},
            effect: recipe.effect,
          }
        });
      }
      showCraftResult(true, recipe.pill_name, roll.toFixed(0), recipe.success_rate);
    } else {
      showCraftResult(false, recipe.pill_name, roll.toFixed(0), recipe.success_rate);
    }

    renderIngredientPouch();
    filterRecipes();
  } catch(e) { showToastShop(e.message, true); }
}

function showCraftResult(success, pillName, roll, needed) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:400;display:flex;align-items:center;justify-content:center;';
  const box = document.createElement('div');
  box.style.cssText = `background:var(--ink-3);border:1px solid ${success ? 'var(--gold)' : '#ef4444'};border-radius:12px;padding:30px 36px;text-align:center;max-width:340px;`;
  box.innerHTML = `
    <div style="font-size:2.5rem;margin-bottom:12px;">${success ? '✨' : '💨'}</div>
    <div style="font-family:'Cinzel Decorative',serif;font-size:1rem;color:${success ? 'var(--gold)' : '#f87171'};margin-bottom:8px;">
      ${success ? 'Alchemy Success!' : 'Pill Failure'}
    </div>
    <div style="font-family:'Cinzel',serif;font-size:0.82rem;color:var(--text);margin-bottom:6px;">${pillName}</div>
    <div style="font-size:0.78rem;color:var(--text-dim);margin-bottom:18px;">
      Rolled ${roll} — needed ≤${needed}
      ${success ? '<br><span style="color:var(--jade);">Added to your inventory!</span>' : '<br><span style="color:#f87171;">Ingredients consumed.</span>'}
    </div>
    <button onclick="this.closest('div[style*=fixed]').remove()" style="padding:8px 22px;background:rgba(201,168,76,0.12);border:1px solid var(--border-bright);color:var(--gold);font-family:'Cinzel',serif;font-size:0.7rem;letter-spacing:0.1em;border-radius:6px;cursor:pointer;">
      Close
    </button>`;
  overlay.appendChild(box);
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(box.parentNode ? overlay : (overlay.appendChild(box), overlay));
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  const s = JSON.parse(localStorage.getItem('daoChronicle_settings') || '{}');
  // Light mode
  if (s.lightMode) {
    document.body.classList.add('light-mode');
    const cb = document.getElementById('setting-light-mode');
    if (cb) cb.checked = true;
  }
  // Language
  const lang = s.language || 'en';
  setLanguage(lang, true); // silent = don't re-save
}

function applySettings() {
  const lightMode = document.getElementById('setting-light-mode').checked;
  document.body.classList.toggle('light-mode', lightMode);
  saveSettings();
}

function setLanguage(lang, silent) {
  currentLang     = lang;
  SKILLS_DATA     = lang === 'de' ? SKILLS_DATA_DE    : SKILLS_DATA_EN;
  COMPANIONS_DATA = lang === 'de' ? COMPANIONS_DATA_DE : COMPANIONS_DATA_EN;
  // Update button states
  const en = document.getElementById('lang-en-btn');
  const de = document.getElementById('lang-de-btn');
  if (en && de) {
    en.style.opacity = lang === 'en' ? '1' : '0.4';
    de.style.opacity = lang === 'de' ? '1' : '0.4';
  }
  // Apply translations to all UI elements
  applyI18n();
  // Re-render lists that contain translated content
  const c = getChar();
  if (c) {
    renderSkills();
    renderCompanionList(c.companions || []);
    renderItemList(c.items || []);
  }
  if (!silent) saveSettings();
}

function saveSettings() {
  const s = {
    lightMode: document.getElementById('setting-light-mode')?.checked || false,
    language:  (SKILLS_DATA === SKILLS_DATA_DE) ? 'de' : 'en'
  };
  localStorage.setItem('daoChronicle_settings', JSON.stringify(s));
}

// ============================================================
// SUPABASE FETCH HELPERS
// ============================================================
// Generic authenticated fetch (uses current session token)
async function sbFetch(table, params = '') {
  const session = (await _sb.auth.getSession()).data.session;
  const token   = session?.access_token || SUPABASE_KEY;
  // Only add default order if caller hasn't specified one
  const hasOrder = params.includes('order=');
  const query = [params, hasOrder ? '' : 'order=name.asc', 'limit=500'].filter(Boolean).join('&');
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${table} ${res.status}: ${body}`);
  }
  return res.json();
}

// Authenticated write (POST/PATCH/DELETE)
async function sbWrite(method, table, body = null, filter = '') {
  const session = (await _sb.auth.getSession()).data.session;
  const token   = session?.access_token || SUPABASE_KEY;
  const url = `${SUPABASE_URL}/rest/v1/${table}${filter ? '?' + filter : ''}`;
  const res = await fetch(url, {
    method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
    },
    body: body ? JSON.stringify(body) : null,
  });
  if (!res.ok) { const b = await res.text(); throw new Error(`${table} ${method}: ${b}`); }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Convert Supabase row → skill object matching the format the app expects
function rowToSkill(row, lang) {
  return {
    name:        row.name,
    rank:        row.rank,
    rarity:      row.rarity,
    type:        row.type,
    subcategory: row.subcategory,
    focus:       row.focus,
    description: lang === 'de' ? row.description_de : row.description_en,
    effect:      lang === 'de' ? row.effect_de       : row.effect_en,
  };
}

// Convert Supabase row → item object
function rowToItem(row) {
  return {
    name:           row.name,
    type:           row.type,
    subtype:        row.subtype,
    rank:           row.rank,
    energy:         row.energy,
    specialization: row.specialization,
    bonuses:        row.bonuses || {},
    abilities:      row.abilities || [],
    pillPoints:     row.pill_points || 0,
    pillTrack:      row.pill_track  || 'qi',
    effect:         row.effect,
    growth:         row.growth,
    image_url:      row.image_url,
  };
}

// Convert Supabase row → companion object
function rowToCompanion(row, lang) {
  return {
    name:        row.name,
    rank:        row.rank,
    element:     row.element || [],
    category:    lang === 'de' ? row.category_de  : row.category_en,
    description: lang === 'de' ? row.description_de : row.description_en,
    abilities:   lang === 'de' ? row.abilities_de : row.abilities_en,
    evolution:   lang === 'de' ? row.evolution_de : row.evolution_en,
  };
}

function setLoadingProgress(pct, msg) {
  const bar = document.getElementById('loading-bar');
  const txt = document.getElementById('loading-msg');
  if (bar) bar.style.width = pct + '%';
  if (txt) txt.textContent = msg;
}

async function initApp() {
  try {
    setLoadingProgress(10, 'Loading skills…');
    const skillRows = await sbFetch('skills');

    setLoadingProgress(40, 'Loading items…');
    const itemRows = await sbFetch('items');

    setLoadingProgress(70, 'Loading companions…');
    const compRows = await sbFetch('companions');

    setLoadingProgress(90, 'Building catalog…');

    // Build EN and DE arrays from raw rows
    SKILLS_DATA_EN     = skillRows.map(r => rowToSkill(r, 'en'));
    SKILLS_DATA_DE     = skillRows.map(r => rowToSkill(r, 'de'));
    ITEMS_DATA         = itemRows.map(rowToItem);
    COMPANIONS_DATA_EN = compRows.map(r => rowToCompanion(r, 'en'));
    COMPANIONS_DATA_DE = compRows.map(r => rowToCompanion(r, 'de'));

    // Apply saved language setting
    const savedLang = JSON.parse(localStorage.getItem('daoChronicle_settings') || '{}').language || 'en';
    SKILLS_DATA     = savedLang === 'de' ? SKILLS_DATA_DE     : SKILLS_DATA_EN;
    COMPANIONS_DATA = savedLang === 'de' ? COMPANIONS_DATA_DE : COMPANIONS_DATA_EN;

    setLoadingProgress(95, 'Loading lore…');
    // Load background data (non-blocking)
    loadPlaques();
    loadShopData();
    loadCharIngredients();
    setLoadingProgress(100, 'Ready!');
    setTimeout(() => {
      const overlay = document.getElementById('loading-overlay');
      if (overlay) overlay.style.opacity = '0';
      setTimeout(() => { if (overlay) overlay.remove(); }, 400);
    }, 300);

  } catch(err) {
    const msg = document.getElementById('loading-msg');
    const bar  = document.getElementById('loading-bar');
    if (msg) { msg.textContent = '✗ ' + err.message; msg.style.color = '#f87171'; }
    if (bar)   bar.style.background = '#ef4444';
    console.error('Supabase load error:', err);
    // Show retry button
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'Retry';
      retryBtn.style.cssText = 'margin-top:12px;padding:8px 20px;background:rgba(201,168,76,0.15);border:1px solid rgba(201,168,76,0.5);color:#c9a84c;font-family:Cinzel,serif;font-size:0.7rem;letter-spacing:0.1em;border-radius:6px;cursor:pointer;';
      retryBtn.onclick = () => { retryBtn.remove(); initApp().then(() => { loadCharToUI(); recalcStats(); }); };
      overlay.appendChild(retryBtn);
    }
  }
}

// ============================================================
// AUTH
// ============================================================
async function doLogin() {
  const email    = (document.getElementById('login-email')?.value || '').trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');
  errEl.style.display = 'none';

  if (!email || !password) {
    errEl.textContent = 'Please enter your email and password.';
    errEl.style.display = '';
    return;
  }

  const btn = document.getElementById('login-submit-btn');
  btn.textContent = 'Entering…';
  btn.disabled    = true;

  const { data, error } = await _sb.auth.signInWithPassword({ email, password });

  btn.textContent = 'Enter';
  btn.disabled    = false;

  if (error) {
    errEl.textContent = 'Incorrect email or password.';
    errEl.style.display = '';
    return;
  }

  await onSignIn(data.user);
}


async function onSignIn(user) {
  currentUser = user;
  // Hide login screen
  const lo = document.getElementById('login-overlay');
  if (lo) { lo.style.opacity='0'; setTimeout(() => lo.remove(), 400); }

  // Load profile to check admin
  const { data: profile } = await _sb.from('profiles').select('*').eq('id', user.id).single();
  currentProfile = profile;
  isAdmin = profile?.is_admin || false;

  // Show/hide admin controls
  applyRoleUI();

  // Load catalog + character data
  await initApp();
  await loadCharacterFromDB();
}

async function doLogout() {
  await _sb.auth.signOut();
  location.reload();
}

function applyRoleUI() {
  // Add class to body — CSS handles hiding
  if (!isAdmin) document.body.classList.add('is-player');
  else document.body.classList.remove('is-player');

  // Update header
  const hdr = document.getElementById('app-header');
  const userTag = document.createElement('span');
  userTag.style.cssText = 'font-family:Cinzel,serif;font-size:0.65rem;color:var(--text-dim);margin-right:8px;';
  userTag.textContent = (isAdmin ? '⚙ DM' : '☯ ' + (currentProfile?.username || 'Cultivator'));
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn-add-char';
  logoutBtn.title = 'Sign out';
  logoutBtn.textContent = '↩';
  logoutBtn.style.fontSize = '0.85rem';
  logoutBtn.onclick = doLogout;
  const switcher = document.getElementById('charSwitcher');
  switcher.insertBefore(logoutBtn, switcher.firstChild);
  hdr.insertBefore(userTag, switcher);
}

// Load the player's character from Supabase
async function loadCharacterFromDB() {
  if (!currentUser) return;
  try {
    let charQuery = _sb.from('characters').select('*');
    if (!isAdmin) charQuery = charQuery.eq('user_id', currentUser.id);
    const { data: chars, error } = await charQuery.order('created_at');
    if (error) throw error;
    if (!chars || !chars.length) {
      // No character yet — show empty state
      loadState(); renderCharSwitcher(); loadCharToUI(); recalcStats();
      return;
    }
    // Convert Supabase rows to the app's internal format
    state.characters = await Promise.all(chars.map(async row => {
      const [itemsRes, skillsRes, compsRes] = await Promise.all([
        _sb.from('character_items').select('*').eq('character_id', row.id),
        _sb.from('character_skills').select('*').eq('character_id', row.id),
        _sb.from('character_companions').select('*').eq('character_id', row.id),
      ]);
      const items     = (itemsRes.data  || []).map(i => ({ ...i.custom_data, name: i.item_name, _dbId: i.id, _qty: i.quantity }));
      const cSkills   = (skillsRes.data || []).filter(s => s.skill_type === 'combat').map(s => ({ ...s.custom_data, name: s.skill_name, _dbId: s.id }));
      const cultSkills= (skillsRes.data || []).filter(s => s.skill_type === 'cultivation').map(s => ({ ...s.custom_data, name: s.skill_name, _dbId: s.id }));
      const companions= (compsRes.data  || []).map(c => ({ ...c.custom_data, name: c.companion_name, _dbId: c.id }));
      return {
        _dbId:       row.id,
        _ownerId:    row.user_id,
        name:        row.name,
        qiStage:     row.qi_stage,
        qiSublevel:  row.qi_sublevel,
        qi:          row.qi_power,
        qiPillPts:   row.qi_pill_pts,
        soulStage:   row.soul_stage,
        soulSublevel:row.soul_sublevel,
        soul:        row.soul_power,
        soulPillPts: row.soul_pill_pts,
        coreStats:   { str: row.stat_str, agi: row.stat_agi, end: row.stat_end, int: row.stat_int },
        daos:        row.daos || {},
        equipment:   row.equipment || {},
        mapData:     row.map_data || {},
        gold:        row.gold || 0,
        items, combatSkills: cSkills, cultSkills, companions,
      };
    }));
    state.activeCharIdx = 0;
    currentCharId = chars[0].id;

    // Set gold immediately from the loaded character data
    charGold = state.characters[0]?.gold || 0;
    updateGoldDisplay();

    renderCharSwitcher();
    loadCharToUI();
    recalcStats();

    // Load ingredients in background now that currentCharId is set
    loadCharIngredients();
  } catch(e) {
    console.error('loadCharacterFromDB error:', e);
  }
}

// ============================================================
// INIT
// ============================================================
loadSettings();
applyI18n();

// Check for existing session first
_sb.auth.getSession().then(async ({ data: { session } }) => {
  if (session) {
    // Already logged in — skip login screen
    const lo = document.getElementById('login-overlay');
    if (lo) { lo.style.opacity='0'; setTimeout(() => lo.remove(), 400); }
    await onSignIn(session.user);
  }
  // else: login overlay stays visible
});

// Re-render SVG after map img loads
document.getElementById('map-img').onload = renderPins;
