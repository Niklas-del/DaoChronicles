// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — replace with your Supabase credentials
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://snsmynjntczztclwhkeh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuc215bmpudGN6enRjbHdoa2VoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NzI1NDEsImV4cCI6MjA5NDI0ODU0MX0.YTeOfU2XQq_NBjrT95Dcqano-H4-uvIcIudIDW4mixY';
const _sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Guard: only admins can use this page
async function checkAdminAccess() {
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) { document.body.innerHTML = '<div style="padding:40px;font-family:Cinzel,serif;color:#f87171;text-align:center;">Not logged in. <a href="index.html" style="color:#c9a84c;">Go to app</a></div>'; return false; }
  const { data: profile } = await _sb.from('profiles').select('is_admin').eq('id', session.user.id).single();
  if (!profile?.is_admin) { document.body.innerHTML = '<div style="padding:40px;font-family:Cinzel,serif;color:#f87171;text-align:center;">Access denied — Admins only.</div>'; return false; }
  return true;
}

// ── API helpers ────────────────────────────────────────────────────────────────

async function getSessionToken() {
  const { data: { session } } = await _sb.auth.getSession();
  return session?.access_token || SUPABASE_KEY;
}

async function apiGet(table, params = '') {
  const token = await getSessionToken();
  const query = [params, 'order=name.asc', 'limit=500'].filter(Boolean).join('&');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function uploadImage(file) {
  const token = await getSessionToken();
  const ext  = file.name.split('.').pop();
  const path = `${Date.now()}.${ext}`;
  const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/item-images/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${token}`,
      'Content-Type': file.type
    },
    body: file
  });
  if (!res.ok) throw new Error(await res.text());
  return `${SUPABASE_URL}/storage/v1/object/public/item-images/${path}`;
}

// ── State ──────────────────────────────────────────────────────────────────────
let allItems = [], allSkills = [], allCompanions = [];
let currentImgFile = null, currentImgUrl = null;
let editingId = null;

function setStatus(msg, type = '') {
  const el = document.getElementById('status-bar');
  el.textContent = msg; el.className = type;
}

// ── Navigation ─────────────────────────────────────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'players')    renderPlayers(allCharacters);
  if (name === 'items')      renderItems(allItems);
  if (name === 'skills')     renderSkills(allSkills);
  if (name === 'companions') renderCompanions(allCompanions);
  if (name === 'plaques')    filterAdminPlaques();
}

// ── Items ──────────────────────────────────────────────────────────────────────
async function loadItems() {
  try {
    allItems = await apiGet('items');
    renderItems(allItems);
    setStatus(`✓ Connected — ${allItems.length} items`, 'ok');
  } catch(e) { setStatus('✗ ' + e.message, 'err'); }
}

function renderItems(items) {
  const tbody = document.getElementById('item-tbody');
  if (!items.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No items found.</td></tr>'; return; }
  tbody.innerHTML = items.map(it => `
    <tr>
      <td>${it.image_url ? `<img src="${it.image_url}" alt="">` : '<span style="color:var(--text-dim);font-size:0.75rem;">—</span>'}</td>
      <td style="font-family:'Cinzel',serif;font-size:0.8rem;">${it.name}</td>
      <td><span class="badge badge-qi">${it.type||''}</span></td>
      <td><span class="badge badge-gold">${it.rank||'—'}</span></td>
      <td style="color:var(--text-dim);font-size:0.82rem;">${it.energy||'—'}</td>
      <td>
        <button class="btn action-btn" onclick="openItemModal(${JSON.stringify(it).replace(/"/g,'&quot;')})">Edit</button>
      </td>
    </tr>
  `).join('');
}

function filterTable(type) {
  const q = document.getElementById(type + '-search').value.toLowerCase();
  if (type === 'item')      renderItems(allItems.filter(i => (i.name||'').toLowerCase().includes(q) || (i.type||'').toLowerCase().includes(q)));
  if (type === 'skill')     renderSkills(allSkills.filter(s => (s.name||'').toLowerCase().includes(q) || (s.type||'').toLowerCase().includes(q)));
  if (type === 'companion') renderCompanions(allCompanions.filter(c => (c.name||'').toLowerCase().includes(q)));
}

const BONUS_FIELDS = ['strength','agility','endurance','intelligence','attack','defense','qiStrength','qiDefense','soulStrength','soulDefense','critChance'];

function openItemModal(item = null) {
  editingId = item ? item.id : null;
  currentImgFile = null; currentImgUrl = item?.image_url || null;
  document.getElementById('item-modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('item-id').value     = item?.id || '';
  document.getElementById('item-name').value   = item?.name || '';
  document.getElementById('item-type').value   = item?.type || 'Weapon';
  document.getElementById('item-subtype').value = item?.subtype || '';
  document.getElementById('item-rank').value   = item?.rank || 'B';
  document.getElementById('item-energy').value  = item?.energy || 'Qi';
  document.getElementById('item-spec').value    = item?.specialization || '';
  document.getElementById('item-effect').value  = item?.effect || '';
  document.getElementById('item-pill-pts').value = item?.pill_points || 0;
  document.getElementById('item-pill-track').value = item?.pill_track || 'qi';
  const bonuses = item?.bonuses || {};
  BONUS_FIELDS.forEach(f => { const el = document.getElementById('b-' + f); if(el) el.value = bonuses[f] || 0; });
  // Image
  const prev = document.getElementById('img-preview');
  prev.src = currentImgUrl || ''; prev.style.display = currentImgUrl ? '' : 'none';
  document.getElementById('img-current').textContent = currentImgUrl ? 'Current image loaded' : '';
  document.getElementById('item-delete-btn').style.display = item ? '' : 'none';
  togglePillFields();
  openModal('modal-item');
}

function togglePillFields() {
  document.getElementById('pill-fields').style.display =
    document.getElementById('item-type').value === 'Cultivation Pill' ? '' : 'none';
}
document.getElementById('item-type').addEventListener('change', togglePillFields);

function previewImg(event) {
  const file = event.target.files[0]; if (!file) return;
  currentImgFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('img-preview');
    prev.src = e.target.result; prev.style.display = '';
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// Drag & drop
const dropZone = document.getElementById('img-drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor='var(--gold)'; });
dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor=''; });
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.style.borderColor='';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) { currentImgFile = file; previewImg({target:{files:[file],value:''}}); }
});

async function saveItem() {
  const name = document.getElementById('item-name').value.trim();
  if (!name) { toast('Name is required', true); return; }
  setStatus('Saving…');
  try {
    // Upload image if new file selected
    let image_url = currentImgUrl || null;
    if (currentImgFile) image_url = await uploadImage(currentImgFile);

    const bonuses = {};
    BONUS_FIELDS.forEach(f => {
      const v = parseInt(document.getElementById('b-' + f)?.value) || 0;
      if (v !== 0) bonuses[f] = v;
    });

    const isPill = document.getElementById('item-type').value === 'Cultivation Pill';
    const payload = {
      name, type: document.getElementById('item-type').value,
      subtype: document.getElementById('item-subtype').value,
      rank: document.getElementById('item-rank').value,
      energy: document.getElementById('item-energy').value,
      specialization: document.getElementById('item-spec').value,
      effect: document.getElementById('item-effect').value,
      bonuses, image_url,
      pill_points: isPill ? parseInt(document.getElementById('item-pill-pts').value)||0 : 0,
      pill_track:  isPill ? document.getElementById('item-pill-track').value : null,
    };

    if (editingId) {
      await fetch(`${SUPABASE_URL}/rest/v1/items?id=eq.${editingId}`, {
        method:'PATCH', body:JSON.stringify(payload),
        headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json','Prefer':'return=representation'}
      });
    } else {
      await api('items', 'POST', payload);
    }
    closeModal('modal-item');
    await loadItems();
    toast(editingId ? 'Item updated ✓' : 'Item created ✓');
  } catch(e) { setStatus('✗ ' + e.message, 'err'); toast(e.message, true); }
}

async function deleteItem() {
  if (!editingId || !confirm('Delete this item?')) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/items?id=eq.${editingId}`, {
      method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
    });
    closeModal('modal-item'); await loadItems(); toast('Item deleted');
  } catch(e) { toast(e.message, true); }
}

// ── Skills ─────────────────────────────────────────────────────────────────────
async function loadSkills() {
  allSkills = await apiGet('skills');
  renderSkills(allSkills);
}

function renderSkills(skills) {
  const tbody = document.getElementById('skill-tbody');
  if (!skills.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No skills found.</td></tr>'; return; }
  tbody.innerHTML = skills.map(s => `
    <tr>
      <td style="font-family:'Cinzel',serif;font-size:0.8rem;">${s.name}</td>
      <td><span class="badge badge-qi">${s.type||''}</span></td>
      <td><span class="badge badge-gold">${s.rank||'—'}</span></td>
      <td style="color:var(--soul-light);font-size:0.8rem;">${s.rarity||'—'}</td>
      <td><button class="btn action-btn" onclick="openSkillModal(${JSON.stringify(s).replace(/"/g,'&quot;')})">Edit</button></td>
    </tr>
  `).join('');
}

function openSkillModal(skill = null) {
  editingId = skill?.id || null;
  document.getElementById('skill-modal-title').textContent = skill ? 'Edit Skill' : 'Add Skill';
  document.getElementById('skill-id').value       = skill?.id || '';
  document.getElementById('skill-name').value     = skill?.name || '';
  document.getElementById('skill-type').value     = skill?.type || 'Soul Skill';
  document.getElementById('skill-rank').value     = skill?.rank || 'B';
  document.getElementById('skill-rarity').value   = skill?.rarity || 'Legendary';
  document.getElementById('skill-sub').value      = skill?.subcategory || skill?.focus || '';
  document.getElementById('skill-desc-en').value  = skill?.description_en || '';
  document.getElementById('skill-desc-de').value  = skill?.description_de || '';
  document.getElementById('skill-effect-en').value = skill?.effect_en || '';
  document.getElementById('skill-effect-de').value = skill?.effect_de || '';
  document.getElementById('skill-delete-btn').style.display = skill ? '' : 'none';
  openModal('modal-skill');
}

async function saveSkill() {
  const name = document.getElementById('skill-name').value.trim();
  if (!name) { toast('Name is required', true); return; }
  const type = document.getElementById('skill-type').value;
  const sub  = document.getElementById('skill-sub').value;
  const payload = {
    name, type, rank: document.getElementById('skill-rank').value,
    rarity: document.getElementById('skill-rarity').value,
    subcategory: type === 'Cultivation Technique' ? null : sub,
    focus:       type === 'Cultivation Technique' ? sub  : null,
    description_en: document.getElementById('skill-desc-en').value,
    description_de: document.getElementById('skill-desc-de').value,
    effect_en:  document.getElementById('skill-effect-en').value,
    effect_de:  document.getElementById('skill-effect-de').value,
  };
  try {
    if (editingId) {
      await fetch(`${SUPABASE_URL}/rest/v1/skills?id=eq.${editingId}`, {
        method:'PATCH', body:JSON.stringify(payload),
        headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}
      });
    } else {
      await api('skills','POST',payload);
    }
    closeModal('modal-skill'); await loadSkills(); toast(editingId ? 'Skill updated ✓' : 'Skill created ✓');
  } catch(e) { toast(e.message, true); }
}

async function deleteSkill() {
  if (!editingId || !confirm('Delete this skill?')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/skills?id=eq.${editingId}`, {
    method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
  });
  closeModal('modal-skill'); await loadSkills(); toast('Skill deleted');
}

// ── Companions ──────────────────────────────────────────────────────────────────
async function loadCompanions() {
  allCompanions = await apiGet('companions');
  renderCompanions(allCompanions);
}

function renderCompanions(companions) {
  const tbody = document.getElementById('companion-tbody');
  if (!companions.length) { tbody.innerHTML = '<tr><td colspan="5" class="empty">No companions found.</td></tr>'; return; }
  tbody.innerHTML = companions.map(cp => `
    <tr>
      <td style="font-family:'Cinzel',serif;font-size:0.8rem;">${cp.name}</td>
      <td><span class="badge badge-gold">${cp.rank||'—'}</span></td>
      <td style="color:var(--text-dim);font-size:0.82rem;">${cp.category_en||''}</td>
      <td style="color:var(--qi-light);font-size:0.8rem;">${(cp.element||[]).join(', ')}</td>
      <td><button class="btn action-btn" onclick="openCompanionModal(${JSON.stringify(cp).replace(/"/g,'&quot;')})">Edit</button></td>
    </tr>
  `).join('');
}

function openCompanionModal(cp = null) {
  editingId = cp?.id || null;
  document.getElementById('companion-modal-title').textContent = cp ? 'Edit Companion' : 'Add Companion';
  document.getElementById('companion-id').value  = cp?.id || '';
  document.getElementById('comp-name').value     = cp?.name || '';
  document.getElementById('comp-rank').value     = cp?.rank || '';
  document.getElementById('comp-cat-en').value   = cp?.category_en || '';
  document.getElementById('comp-cat-de').value   = cp?.category_de || '';
  document.getElementById('comp-elements').value = (cp?.element||[]).join(', ');
  document.getElementById('comp-desc-en').value  = cp?.description_en || '';
  document.getElementById('comp-desc-de').value  = cp?.description_de || '';
  document.getElementById('comp-abl-en').value   = (cp?.abilities_en||[]).join(', ');
  document.getElementById('comp-abl-de').value   = (cp?.abilities_de||[]).join(', ');
  document.getElementById('comp-evo-en').value   = (cp?.evolution_en||[]).join(', ');
  document.getElementById('comp-evo-de').value   = (cp?.evolution_de||[]).join(', ');
  document.getElementById('companion-delete-btn').style.display = cp ? '' : 'none';
  openModal('modal-companion');
}

function splitComma(v) { return v.split(',').map(s => s.trim()).filter(Boolean); }

async function saveCompanion() {
  const name = document.getElementById('comp-name').value.trim();
  if (!name) { toast('Name is required', true); return; }
  const payload = {
    name, rank: document.getElementById('comp-rank').value,
    category_en: document.getElementById('comp-cat-en').value,
    category_de: document.getElementById('comp-cat-de').value,
    element:     splitComma(document.getElementById('comp-elements').value),
    description_en: document.getElementById('comp-desc-en').value,
    description_de: document.getElementById('comp-desc-de').value,
    abilities_en: splitComma(document.getElementById('comp-abl-en').value),
    abilities_de: splitComma(document.getElementById('comp-abl-de').value),
    evolution_en: splitComma(document.getElementById('comp-evo-en').value),
    evolution_de: splitComma(document.getElementById('comp-evo-de').value),
  };
  try {
    if (editingId) {
      await fetch(`${SUPABASE_URL}/rest/v1/companions?id=eq.${editingId}`, {
        method:'PATCH', body:JSON.stringify(payload),
        headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}
      });
    } else {
      await api('companions','POST',payload);
    }
    closeModal('modal-companion'); await loadCompanions(); toast(editingId ? 'Companion updated ✓' : 'Companion created ✓');
  } catch(e) { toast(e.message, true); }
}

async function deleteCompanion() {
  if (!editingId || !confirm('Delete this companion?')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/companions?id=eq.${editingId}`, {
    method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
  });
  closeModal('modal-companion'); await loadCompanions(); toast('Companion deleted');
}

// ── Utilities ───────────────────────────────────────────────────────────────────
function openModal(id)  { document.getElementById(id).classList.add('open'); }
function closeModal(id) { document.getElementById(id).classList.remove('open'); }
document.querySelectorAll('.modal-bg').forEach(bg =>
  bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('open'); })
);

function toast(msg, isErr = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── Plaques ─────────────────────────────────────────────────────────────────────
let allAdminPlaques = [];
let currentPlaqueImgFile = null;
let currentPlaqueImgUrl  = null;

async function loadPlaques() {
  try {
    allAdminPlaques = await apiGet('plaques', 'order=sort_order.asc,name.asc');
    filterAdminPlaques();
  } catch(e) { console.error('Plaques load error:', e); }
}

function filterAdminPlaques() {
  const q   = (document.getElementById('plaque-search')?.value || '').toLowerCase();
  const cat = document.getElementById('plaque-cat-filter')?.value || '';
  let list  = allAdminPlaques;
  if (cat) list = list.filter(p => p.category === cat);
  if (q)   list = list.filter(p => (p.name||'').toLowerCase().includes(q));
  renderAdminPlaques(list);
}

function renderAdminPlaques(plaques) {
  const tbody = document.getElementById('plaque-tbody');
  if (!plaques.length) { tbody.innerHTML = '<tr><td colspan="6" class="empty">No plaques yet.</td></tr>'; return; }
  tbody.innerHTML = plaques.map(p => `
    <tr>
      <td>${p.image_url ? `<img src="${p.image_url}" alt="" style="width:48px;height:36px;object-fit:cover;border-radius:4px;border:1px solid var(--border);">` : '—'}</td>
      <td style="font-family:'Cinzel',serif;font-size:0.8rem;">${p.name}</td>
      <td><span class="badge badge-qi">${p.category||'—'}</span></td>
      <td><span class="badge badge-gold">${p.rank||'—'}</span></td>
      <td style="color:var(--text-dim);font-size:0.78rem;">${(p.tags||[]).join(', ')}</td>
      <td><button class="btn action-btn" onclick='openPlaqueModal(${JSON.stringify(p).replace(/"/g,"&quot;")})'>Edit</button></td>
    </tr>
  `).join('');
}

function openPlaqueModal(p = null) {
  editingId = p?.id || null;
  currentPlaqueImgFile = null;
  currentPlaqueImgUrl  = p?.image_url || null;
  document.getElementById('plaque-modal-title').textContent = p ? 'Edit Plaque' : 'Add Plaque';
  document.getElementById('plaque-id').value       = p?.id || '';
  document.getElementById('plaque-name').value     = p?.name || '';
  document.getElementById('plaque-category').value = p?.category || 'Power';
  document.getElementById('plaque-rank').value     = p?.rank || '';
  document.getElementById('plaque-sort').value     = p?.sort_order || 0;
  document.getElementById('plaque-desc').value     = p?.description || '';
  document.getElementById('plaque-lore').value     = p?.lore || '';
  document.getElementById('plaque-tags').value     = (p?.tags || []).join(', ');
  const prev = document.getElementById('plaque-img-preview');
  prev.src = currentPlaqueImgUrl || ''; prev.style.display = currentPlaqueImgUrl ? '' : 'none';
  document.getElementById('plaque-delete-btn').style.display = p ? '' : 'none';
  openModal('modal-plaque');
}

function previewPlaqueImg(event) {
  const file = event.target.files[0]; if (!file) return;
  currentPlaqueImgFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    const prev = document.getElementById('plaque-img-preview');
    prev.src = e.target.result; prev.style.display = '';
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

// Drag & drop for plaque images
const plaqueDropZone = document.getElementById('plaque-img-drop');
if (plaqueDropZone) {
  plaqueDropZone.addEventListener('dragover', e => { e.preventDefault(); plaqueDropZone.style.borderColor='var(--gold)'; });
  plaqueDropZone.addEventListener('dragleave', () => { plaqueDropZone.style.borderColor=''; });
  plaqueDropZone.addEventListener('drop', e => {
    e.preventDefault(); plaqueDropZone.style.borderColor='';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      currentPlaqueImgFile = file;
      previewPlaqueImg({target:{files:[file],value:''}});
    }
  });
}

async function uploadPlaqueImage(file) {
  const ext  = file.name.split('.').pop();
  const path = `${Date.now()}.${ext}`;
  const res  = await fetch(`${SUPABASE_URL}/storage/v1/object/plaque-images/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': file.type
    },
    body: file
  });
  if (!res.ok) throw new Error(await res.text());
  return `${SUPABASE_URL}/storage/v1/object/public/plaque-images/${path}`;
}

async function savePlaque() {
  const name = document.getElementById('plaque-name').value.trim();
  if (!name) { toast('Name is required', true); return; }
  try {
    let image_url = currentPlaqueImgUrl || null;
    if (currentPlaqueImgFile) image_url = await uploadPlaqueImage(currentPlaqueImgFile);

    const rawTags = document.getElementById('plaque-tags').value;
    const tags    = rawTags.split(',').map(s => s.trim()).filter(Boolean);

    const payload = {
      name,
      category:    document.getElementById('plaque-category').value,
      rank:        document.getElementById('plaque-rank').value,
      sort_order:  parseInt(document.getElementById('plaque-sort').value) || 0,
      description: document.getElementById('plaque-desc').value,
      lore:        document.getElementById('plaque-lore').value,
      tags, image_url,
    };

    if (editingId) {
      await fetch(`${SUPABASE_URL}/rest/v1/plaques?id=eq.${editingId}`, {
        method:'PATCH', body:JSON.stringify(payload),
        headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'}
      });
    } else {
      await api('plaques','POST',payload);
    }
    closeModal('modal-plaque');
    await loadPlaques();
    toast(editingId ? 'Plaque updated ✓' : 'Plaque created ✓');
  } catch(e) { toast(e.message, true); }
}

async function deletePlaque() {
  if (!editingId || !confirm('Delete this plaque?')) return;
  await fetch(`${SUPABASE_URL}/rest/v1/plaques?id=eq.${editingId}`, {
    method:'DELETE', headers:{'apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`}
  });
  closeModal('modal-plaque'); await loadPlaques(); toast('Plaque deleted');
}


// ── Player & Character Management ───────────────────────────────────────────────
let allCharacters = [];
let editingCharId = null;
const STAGES = ['Mortal','Beginner','Veteran','Master','Expert','Sage','Lord','Monarch','Immortal','Saint','Earth God','Sky God','Dao Completion'];
const SUBLEVELS = ['Early','Mid','Late','Peak'];
const DAOS_LIST = ['fire','water','earth','wind','thunder','void','life','death','space','time','grand'];
const DAO_NAMES = {fire:'Fire',water:'Water',earth:'Earth',wind:'Wind',thunder:'Thunder',void:'Void',life:'Life',death:'Death',space:'Space',time:'Time',grand:'The Dao'};

async function loadPlayers() {
  try {
    // Load ALL profiles (everyone who registered)
    const { data: profs, error: profErr } = await _sb
      .from('profiles').select('*').order('created_at');
    if (profErr) throw profErr;

    // Load all characters
    const { data: chars } = await _sb.from('characters').select('*').order('created_at');
    const charMap = {};
    (chars || []).forEach(c => { charMap[c.user_id] = c; });

    // Merge: one row per profile
    allCharacters = (profs || []).map(p => ({
      profile: p,
      character: charMap[p.id] || null,
    }));

    renderPlayers(allCharacters);
  } catch(e) { console.error('loadPlayers error:', e); }
}

function renderPlayers(rows) {
  const tbody = document.getElementById('players-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No registered users yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(({ profile: p, character: c }) => {
    const isDM = p.is_admin;
    return `<tr style="${isDM ? 'background:rgba(201,168,76,0.04);' : ''}">
      <td style="font-size:0.82rem;">
        <div style="font-family:'Cinzel',serif;color:var(--text)">${p.username || '—'}</div>
        <div style="color:var(--text-dim);font-size:0.72rem;">${p.id.slice(0,8)}…</div>
      </td>
      <td style="font-family:'Cinzel',serif;font-size:0.82rem;color:${c ? 'var(--text)' : 'var(--text-dim)'}">
        ${c ? c.name : '<em>No character</em>'}
      </td>
      <td style="color:var(--qi-light);font-size:0.8rem;">${c ? c.qi_stage + ' ' + c.qi_sublevel : '—'}</td>
      <td style="color:var(--soul-light);font-size:0.8rem;">${c ? c.soul_stage + ' ' + c.soul_sublevel : '—'}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap">
          ${c
            ? `<button class="btn action-btn" onclick='openCharEdit("${c.id}")'>Edit</button>`
            : `<button class="btn action-btn btn-soul" onclick='createCharForPlayer("${p.id}", "${p.username || p.id}")'>+ Create Character</button>`
          }
          <button class="btn action-btn ${isDM ? 'btn-danger' : ''}"
            onclick='toggleAdmin("${p.id}", ${isDM})'>
            ${isDM ? 'Remove DM' : 'Make DM'}
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

async function createCharForPlayer(userId, username) {
  const charName = prompt('Character name for ' + username + ':', username + "'s Cultivator");
  if (!charName) return;
  const { data, error } = await _sb
    .from('characters')
    .insert({ user_id: userId, name: charName })
    .select().single();
  if (error) { toast('Error: ' + error.message, true); return; }
  toast('✓ Character "' + charName + '" created');
  await loadPlayers();
}

async function toggleAdmin(userId, currentlyAdmin) {
  const { error } = await _sb.from('profiles')
    .update({ is_admin: !currentlyAdmin })
    .eq('id', userId);
  if (error) { toast(error.message, true); return; }
  toast(currentlyAdmin ? 'DM access removed' : 'DM access granted ✓');
  await loadPlayers();
}

// ── Player & Character Management ───────────────────────────────────────────────
// Accounts are created via the admin panel form — uses Supabase Auth signUp

async function createPlayerAccount() {
  const email    = document.getElementById('new-player-email').value.trim();
  const password = document.getElementById('new-player-password').value;
  const username = document.getElementById('new-player-username').value.trim();
  const charName = document.getElementById('new-player-charname').value.trim();
  const isAdmin  = document.getElementById('new-player-isadmin').checked;
  const resultEl = document.getElementById('create-player-result');

  resultEl.style.display = 'none';

  if (!email || !password || !username) {
    resultEl.style.color = '#f87171';
    resultEl.textContent = 'Email, password and username are all required.';
    resultEl.style.display = '';
    return;
  }

  try {
    // Step 1: Sign up the user via Supabase Auth
    const { data: signUpData, error: signUpErr } = await _sb.auth.signUp({ email, password });
    if (signUpErr) throw signUpErr;

    const userId = signUpData.user?.id;
    if (!userId) throw new Error('User creation failed — no ID returned.');

    // Step 2: Update the profile row (trigger creates it with email prefix as username)
    // Wait briefly for the trigger to fire
    await new Promise(r => setTimeout(r, 800));

    const { error: profErr } = await _sb
      .from('profiles')
      .update({ username, is_admin: isAdmin })
      .eq('id', userId);
    if (profErr) throw profErr;

    // Step 3: Update the character name
    const finalCharName = charName || username + '\'s Cultivator';
    const { error: charErr } = await _sb
      .from('characters')
      .update({ name: finalCharName })
      .eq('user_id', userId);
    if (charErr) throw charErr;

    // Success
    resultEl.style.color = 'var(--jade)';
    resultEl.textContent = `✓ Account "${username}" created successfully.`;
    resultEl.style.display = '';

    // Clear fields
    ['new-player-email','new-player-password','new-player-username','new-player-charname']
      .forEach(id => { document.getElementById(id).value = ''; });
    document.getElementById('new-player-isadmin').checked = false;

    // Reload player list
    await loadPlayers();
    toast(`Player "${username}" created ✓`);

  } catch(e) {
    resultEl.style.color = '#f87171';
    resultEl.textContent = '✗ ' + e.message;
    resultEl.style.display = '';
    toast(e.message, true);
  }
}


// ── Character edit ─────────────────────────────────────────────────────────
let _charOwnedItems = [], _charOwnedSkills = [], _charOwnedComps = [];

function showCharTab(tab) {
  ['stats','items','skills','comps','daos'].forEach(t => {
    document.getElementById('ctab-' + t).style.display = t === tab ? '' : 'none';
    const btn = document.getElementById('ctab-btn-' + t);
    if (btn) btn.style.background = t === tab ? 'rgba(201,168,76,0.2)' : '';
  });
  if (tab === 'items')  renderGiveItems();
  if (tab === 'skills') renderGiveSkills();
  if (tab === 'comps')  renderGiveComps();
}

function renderGiveItems() {
  const q    = (document.getElementById('give-item-search')?.value || '').toLowerCase();
  const type = document.getElementById('give-item-type-filter')?.value || '';
  const ownedNames = new Set(_charOwnedItems.map(i => i.item_name));

  let items = allItems;
  if (type) items = items.filter(i => i.type === type);
  if (q)    items = items.filter(i =>
    (i.name||'').toLowerCase().includes(q) ||
    (i.type||'').toLowerCase().includes(q) ||
    (i.rank||'').toLowerCase().includes(q)
  );

  const grid = document.getElementById('give-item-grid');
  if (!items.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-size:0.82rem;padding:12px;">No items found.</div>'; return; }

  const TYPE_ICON = {Weapon:'⚔️',Armor:'🛡️',Flame:'🔥',Soul:'💜',Core:'⚡',Artifact:'🔮','Utility Item':'📜','Cultivation Pill':'💊'};
  grid.innerHTML = items.map(item => {
    const owned = ownedNames.has(item.name);
    return `<div class="give-card${owned ? ' already-owned' : ''}" onclick="giveItemCard('${item.name.replace(/'/g,"\\'")}')">
      <span class="give-plus">＋</span>
      <div class="give-card-name">${TYPE_ICON[item.type]||'📦'} ${item.name}</div>
      <div class="give-card-sub">${item.type}${item.subtype ? ' · '+item.subtype : ''}</div>
      <div class="give-card-badges">
        ${item.rank ? `<span class="badge badge-gold" style="font-size:0.5rem;">${item.rank}</span>` : ''}
        ${item.energy ? `<span class="badge badge-soul" style="font-size:0.5rem;">${item.energy}</span>` : ''}
        ${owned ? `<span class="badge" style="font-size:0.5rem;color:var(--jade);border-color:var(--jade)33;">Owned</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderGiveSkills() {
  const q    = (document.getElementById('give-skill-search')?.value || '').toLowerCase();
  const type = document.getElementById('give-skill-type-filter')?.value || '';
  const ownedNames = new Set(_charOwnedSkills.map(s => s.skill_name));

  let skills = allSkills;
  if (type) skills = skills.filter(s => s.type === type);
  if (q)    skills = skills.filter(s =>
    (s.name||'').toLowerCase().includes(q) ||
    (s.type||'').toLowerCase().includes(q) ||
    (s.rarity||'').toLowerCase().includes(q)
  );

  const grid = document.getElementById('give-skill-grid');
  if (!skills.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-size:0.82rem;padding:12px;">No skills found.</div>'; return; }

  const TYPE_COLOR = {'Soul Skill':'var(--soul-light)','Qi Skill':'var(--qi-light)','Cultivation Technique':'var(--jade)','Mythic Art':'var(--gold)'};
  grid.innerHTML = skills.map(s => {
    const owned = ownedNames.has(s.name);
    const col   = TYPE_COLOR[s.type] || 'var(--text-dim)';
    return `<div class="give-card${owned ? ' already-owned' : ''}" onclick="giveSkillCard('${s.name.replace(/'/g,"\\'")}')">
      <span class="give-plus">＋</span>
      <div class="give-card-name">${s.name}</div>
      <div class="give-card-sub" style="color:${col};">${s.type}</div>
      <div class="give-card-badges">
        ${s.rank   ? `<span class="badge badge-gold" style="font-size:0.5rem;">${s.rank}</span>` : ''}
        ${s.rarity ? `<span class="badge" style="font-size:0.5rem;color:${col};border-color:${col}33;">${s.rarity}</span>` : ''}
        ${owned ? `<span class="badge" style="font-size:0.5rem;color:var(--jade);border-color:var(--jade)33;">Learned</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

function renderGiveComps() {
  const q   = (document.getElementById('give-comp-search')?.value || '').toLowerCase();
  const cat = document.getElementById('give-comp-cat-filter')?.value || '';
  const ownedNames = new Set(_charOwnedComps.map(c => c.companion_name));

  let comps = allCompanions;
  if (cat) comps = comps.filter(c => (c.category_en||c.category||'') === cat);
  if (q)   comps = comps.filter(c =>
    (c.name||'').toLowerCase().includes(q) ||
    (c.category_en||c.category||'').toLowerCase().includes(q) ||
    (c.rank||'').toLowerCase().includes(q)
  );

  const grid = document.getElementById('give-comp-grid');
  if (!comps.length) { grid.innerHTML = '<div style="color:var(--text-dim);font-size:0.82rem;padding:12px;">No companions found.</div>'; return; }

  grid.innerHTML = comps.map(cp => {
    const owned = ownedNames.has(cp.name);
    const elems = Array.isArray(cp.element) ? cp.element.join(', ') : (cp.element||'');
    return `<div class="give-card${owned ? ' already-owned' : ''}" onclick="giveCompCard('${cp.name.replace(/'/g,"\\'")}')">
      <span class="give-plus">＋</span>
      <div class="give-card-name">🐉 ${cp.name}</div>
      <div class="give-card-sub">${cp.category_en || cp.category || ''}</div>
      <div class="give-card-badges">
        ${cp.rank ? `<span class="badge badge-gold" style="font-size:0.5rem;">${cp.rank}</span>` : ''}
        ${elems   ? `<span class="badge badge-qi"   style="font-size:0.5rem;">${elems}</span>`   : ''}
        ${owned   ? `<span class="badge" style="font-size:0.5rem;color:var(--jade);border-color:var(--jade)33;">Bound</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function openCharEdit(charId) {
  editingCharId = charId;
  // allCharacters is now [{profile, character}] — find by character id
  const row  = allCharacters.find(r => r.character?.id === charId);
  const char = row?.character || allCharacters.find(c => c.id === charId);
  if (!char) return;
  document.getElementById('char-edit-title').textContent = 'Edit: ' + char.name;
  document.getElementById('char-edit-id').value    = charId;
  document.getElementById('ce-name').value          = char.name;
  document.getElementById('ce-qi-stage').value      = char.qi_stage     || 'Mortal';
  document.getElementById('ce-qi-sublevel').value   = char.qi_sublevel  || 'Early';
  document.getElementById('ce-qi-power').value      = char.qi_power     || 100;
  document.getElementById('ce-soul-stage').value    = char.soul_stage   || 'Mortal';
  document.getElementById('ce-soul-sublevel').value = char.soul_sublevel || 'Early';
  document.getElementById('ce-soul-power').value    = char.soul_power   || 100;
  document.getElementById('ce-str').value = char.stat_str || 10;
  document.getElementById('ce-agi').value = char.stat_agi || 10;
  document.getElementById('ce-end').value = char.stat_end || 10;
  document.getElementById('ce-int').value  = char.stat_int || 10;
  document.getElementById('ce-gold').value = char.gold     || 0;

  // Clear search fields
  ['give-item-search','give-skill-search','give-comp-search'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  ['give-item-type-filter','give-skill-type-filter','give-comp-cat-filter'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  await refreshCharLists(charId, char);
  showCharTab('stats');
  openModal('modal-char-edit');
}

async function refreshCharLists(charId, char) {
  const [itemsRes, skillsRes, compsRes] = await Promise.all([
    _sb.from('character_items').select('*').eq('character_id', charId),
    _sb.from('character_skills').select('*').eq('character_id', charId),
    _sb.from('character_companions').select('*').eq('character_id', charId),
  ]);

  // Store for give-card owned checks
  _charOwnedItems  = itemsRes.data  || [];
  _charOwnedSkills = skillsRes.data || [];
  _charOwnedComps  = compsRes.data  || [];

  // ── Items owned list ───────────────────────────────────────
  document.getElementById('char-items-list').innerHTML = _charOwnedItems.length
    ? _charOwnedItems.map(i => `
        <div class="owned-row">
          <span style="font-family:'Cinzel',serif;font-size:0.78rem;">
            ${i.item_name}
            <span style="color:var(--text-dim);">×${i.quantity}</span>
          </span>
          <button class="btn btn-danger action-btn" onclick="removeCharItem('${i.id}','${charId}')">Remove</button>
        </div>`).join('')
    : '<div style="color:var(--text-dim);font-size:0.82rem;padding:10px 0;">No items yet.</div>';

  // ── Skills owned list ──────────────────────────────────────
  const TYPE_COLOR = {'Soul Skill':'var(--soul-light)','Qi Skill':'var(--qi-light)','Cultivation Technique':'var(--jade)','Mythic Art':'var(--gold)'};
  document.getElementById('char-skills-list').innerHTML = _charOwnedSkills.length
    ? _charOwnedSkills.map(s => {
        const skill = allSkills.find(sk => sk.name === s.skill_name);
        const col   = TYPE_COLOR[skill?.type] || 'var(--text-dim)';
        return `<div class="owned-row">
          <span style="font-family:'Cinzel',serif;font-size:0.78rem;">
            ${s.skill_name}
            <span style="color:${col};font-size:0.7rem;"> · ${s.skill_type}</span>
          </span>
          <button class="btn btn-danger action-btn" onclick="removeCharSkill('${s.id}','${charId}')">Remove</button>
        </div>`;
      }).join('')
    : '<div style="color:var(--text-dim);font-size:0.82rem;padding:10px 0;">No skills yet.</div>';

  // ── Companions owned list ──────────────────────────────────
  document.getElementById('char-comps-list').innerHTML = _charOwnedComps.length
    ? _charOwnedComps.map(c => `
        <div class="owned-row">
          <span style="font-family:'Cinzel',serif;font-size:0.78rem;">🐉 ${c.companion_name}</span>
          <button class="btn btn-danger action-btn" onclick="removeCharComp('${c.id}','${charId}')">Remove</button>
        </div>`).join('')
    : '<div style="color:var(--text-dim);font-size:0.82rem;padding:10px 0;">No companions yet.</div>';

  // ── Daos ───────────────────────────────────────────────────
  const daos = char?.daos || {};
  const DAO_ICONS = {fire:'🔥',water:'💧',earth:'🪨',wind:'🌪',thunder:'⚡',void:'🌑',life:'🌿',death:'💀',space:'🌌',time:'⏳',grand:'∞'};
  document.getElementById('char-daos-list').innerHTML = DAOS_LIST.map(daoId => {
    const level = daos[daoId] || 0;
    const pct   = (level / 10) * 100;
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:1rem;">${DAO_ICONS[daoId]}</span>
      <span style="font-family:'Cinzel',serif;font-size:0.78rem;flex:1;">${DAO_NAMES[daoId]}</span>
      <div style="flex:2;background:rgba(255,255,255,0.06);border-radius:3px;height:5px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:var(--gold);border-radius:3px;transition:width 0.3s;"></div>
      </div>
      <input type="number" id="dao-input-${daoId}" value="${level}" min="0" max="10"
        style="width:52px;text-align:center;">
      <span style="font-size:0.72rem;color:var(--text-dim);">/ 10</span>
    </div>`;
  }).join('');

  // Re-render the give grids if those panels are currently visible
  const itemsPanel = document.getElementById('ctab-items');
  if (itemsPanel && itemsPanel.style.display !== 'none') renderGiveItems();
  const skillsPanel = document.getElementById('ctab-skills');
  if (skillsPanel && skillsPanel.style.display !== 'none') renderGiveSkills();
  const compsPanel = document.getElementById('ctab-comps');
  if (compsPanel && compsPanel.style.display !== 'none') renderGiveComps();
}

// Dao values are read at save time — no live update needed
function updateDaoValue(daoId) {}

function giveGold(amount) {
  const el = document.getElementById('ce-gold');
  if (!el) return;
  const current = parseInt(el.value) || 0;
  el.value = Math.max(0, current + amount);
}

async function giveItemCard(name) {
  if (!name || !editingCharId) return;
  const qty = parseInt(document.getElementById('give-item-qty')?.value) || 1;
  const existing = _charOwnedItems.find(i => i.item_name === name);
  if (existing) {
    await _sb.from('character_items').update({ quantity: existing.quantity + qty }).eq('id', existing.id);
  } else {
    const itemData = allItems.find(i => i.name === name) || {};
    await _sb.from('character_items').insert({ character_id: editingCharId, item_name: name, quantity: qty, custom_data: itemData });
  }
  const row = allCharacters.find(r => r.character?.id === editingCharId);
  await refreshCharLists(editingCharId, row?.character);
  toast(`✓ ${qty}× ${name} given`);
}

async function giveSkillCard(name) {
  if (!name || !editingCharId) return;
  const type = document.getElementById('give-skill-type')?.value || 'combat';
  const already = _charOwnedSkills.find(s => s.skill_name === name && s.skill_type === type);
  if (already) { toast(`Already has ${name} in ${type} slot`, true); return; }
  const skillData = allSkills.find(s => s.name === name) || {};
  await _sb.from('character_skills').insert({ character_id: editingCharId, skill_name: name, skill_type: type, custom_data: skillData });
  const row = allCharacters.find(r => r.character?.id === editingCharId);
  await refreshCharLists(editingCharId, row?.character);
  toast(`✓ ${name} given`);
}

async function giveCompCard(name) {
  if (!name || !editingCharId) return;
  const already = _charOwnedComps.find(c => c.companion_name === name);
  if (already) { toast(`Already has ${name}`, true); return; }
  const compData = allCompanions.find(c => c.name === name) || {};
  await _sb.from('character_companions').insert({ character_id: editingCharId, companion_name: name, custom_data: compData });
  const row = allCharacters.find(r => r.character?.id === editingCharId);
  await refreshCharLists(editingCharId, row?.character);
  toast(`✓ ${name} given`);
}

async function removeCharItem(id, charId) {
  await _sb.from('character_items').delete().eq('id', id);
  const row = allCharacters.find(r => r.character?.id === charId);
  await refreshCharLists(charId, row?.character);
  toast('Item removed');
}

async function removeCharSkill(id, charId) {
  await _sb.from('character_skills').delete().eq('id', id);
  const row = allCharacters.find(r => r.character?.id === charId);
  await refreshCharLists(charId, row?.character);
  toast('Skill removed');
}

async function removeCharComp(id, charId) {
  await _sb.from('character_companions').delete().eq('id', id);
  const row = allCharacters.find(r => r.character?.id === charId);
  await refreshCharLists(charId, row?.character);
  toast('Companion removed');
}

async function saveCharacterEdit() {
  if (!editingCharId) return;
  // Collect dao values
  const daos = {};
  DAOS_LIST.forEach(daoId => {
    const el = document.getElementById('dao-input-' + daoId);
    if (el) daos[daoId] = Math.min(10, Math.max(0, parseInt(el.value)||0));
  });
  const payload = {
    name:         document.getElementById('ce-name').value,
    qi_stage:     document.getElementById('ce-qi-stage').value,
    qi_sublevel:  document.getElementById('ce-qi-sublevel').value,
    qi_power:     parseInt(document.getElementById('ce-qi-power').value)||100,
    soul_stage:   document.getElementById('ce-soul-stage').value,
    soul_sublevel:document.getElementById('ce-soul-sublevel').value,
    soul_power:   parseInt(document.getElementById('ce-soul-power').value)||100,
    stat_str:     parseInt(document.getElementById('ce-str').value)||10,
    stat_agi:     parseInt(document.getElementById('ce-agi').value)||10,
    stat_end:     parseInt(document.getElementById('ce-end').value)||10,
    stat_int:     parseInt(document.getElementById('ce-int').value)||10,
    gold:         parseInt(document.getElementById('ce-gold').value)||0,
    daos,
  };
  const { data: saveData, error: saveErr } = await _sb
    .from('characters')
    .update(payload)
    .eq('id', editingCharId)
    .select();
  if (saveErr) { toast('Save failed: ' + saveErr.message, true); console.error('save error:', saveErr); return; }
  // Update local cache — allCharacters is [{profile, character}]
  const idx = allCharacters.findIndex(r => r.character?.id === editingCharId);
  if (idx >= 0) allCharacters[idx] = { ...allCharacters[idx], character: { ...allCharacters[idx].character, ...payload } };
  renderPlayers(allCharacters);
  closeModal('modal-char-edit');
  toast('Character saved ✓');
}

async function deleteCharacter() {
  if (!editingCharId || !confirm('Delete this character and all their data?')) return;
  await _sb.from('characters').delete().eq('id', editingCharId);
  allCharacters = allCharacters.map(r => r.character?.id === editingCharId ? { ...r, character: null } : r);
  renderPlayers(allCharacters);
  closeModal('modal-char-edit');
  toast('Character deleted');
}

// ── Init ────────────────────────────────────────────────────────────────────────
(async () => {
  const ok = await checkAdminAccess();
  if (!ok) return;
  try {
    await Promise.all([loadItems(), loadSkills(), loadCompanions(), loadPlaques(), loadPlayers()]);
    setStatus(`✓ DM Connected — ${allCharacters.length} players · ${allItems.length} items · ${allSkills.length} skills`, 'ok');
  } catch(e) {
    setStatus('✗ ' + e.message, 'err');
  }
})();
