// ====================================================================
// แอปส้มสด — Google Apps Script
// วิธีติดตั้ง:
// 1. ไปที่ script.google.com → New project
// 2. ลบโค้ดเดิม แล้ววางโค้ดนี้ทั้งหมด → บันทึก (Ctrl+S)
// 3. Deploy → New deployment → Web app
//    Execute as: Me | Who has access: Anyone
// 4. Authorize → ยอมรับสิทธิ์
// 5. คัดลอก Web app URL → วางในแอป (แอดมิน → Sheets)
// ====================================================================

const SPREADSHEET_NAME = 'แอปส้มสด - ข้อมูลธุรกิจ';
const PROP_KEY         = 'APPSOMSOD_SHEET_ID';
const IMG_FOLDER_NAME  = 'แอปส้มสด - รูปภาพ';
const IMG_FOLDER_KEY   = 'APPSOMSOD_IMG_FOLDER';
const VIDEO_FOLDER_NAME = 'แอปส้มสด - วิดีโอกล้อง AI';
const VIDEO_FOLDER_KEY  = 'APPSOMSOD_VIDEO_FOLDER';
const DRIVE_OWNER_EMAIL = 'kaveefruit.thailand@gmail.com';

const SHEETS = {
  daily:       { name:'บันทึกรายวัน',              headers:['วันที่','ประเภท','หมวดหมู่','รายการ','จำนวน','หน่วย','ราคา/หน่วย','ยอดรวม','หมายเหตุ','ผู้บันทึก','บันทึกเมื่อ','รูป'] },
  inventory:   { name:'คลังสินค้า',                 headers:['รหัส','หมวดหมู่','ชื่อสินค้า','คงเหลือ','หน่วย','จุดสั่งซื้อ','ต้นทุน/หน่วย','มูลค่ารวม','อัปเดตล่าสุด','รูป'] },
  movement:    { name:'เคลื่อนไหวสต๊อก',            headers:['เวลา','รหัส','ชื่อสินค้า','ประเภท','จำนวน','หน่วย','ก่อน','หลัง','หมายเหตุ','ผู้บันทึก','รูป'] },
  count:       { name:'นับสต๊อก',                   headers:['วันที่','รหัส','ชื่อสินค้า','หมวดหมู่','ระบบ','จริง','ต่าง','หน่วย','ผู้ตรวจ','หมายเหตุ'] },
  catalog:     { name:'รายการสินค้า',               headers:['รหัส','หมวดหมู่','ชื่อสินค้า','หน่วย','ราคา','คำอธิบาย'] },
  production:  { name:'การผลิต',                    headers:['วันที่','Lot','น้ำตาล(kg)','เกลือ(kg)','กรดมะนาว(kg)','แพคติน(kg)','สี','นม(กป.)','ส้มA(kg)','ส้มB(kg)','น้ำแข็ง(kg)','น้ำส้ม(ml)','สถานะ','หมายเหตุ','บันทึก','ผู้บันทึก'] },
  bottling:    { name:'บรรจุ',                      headers:['วันที่','Lot','ml/ขวด','จำนวน','ใช้ml','เหลือml','จำหน่าย','คลัง','วันจำหน่าย','หมายเหตุ','บันทึก','ผู้บันทึก'] },
  emptyBottle: { name:'ขวดเปล่า',                  headers:['วันที่','ประเภท','ml','จำนวน','ราคา/ขวด','มูลค่า','คงเหลือ','หมายเหตุ','บันทึก','ผู้บันทึก'] },
  finance:     { name:'รายรับ-รายจ่าย (P&L)',      headers:['วันที่','ที่มา','Lot','หมวด','รายละเอียด','รายรับ(฿)','รายจ่าย(฿)','สุทธิ(฿)','หมายเหตุ','ผู้บันทึก','อัปเดต','Key'] },
  video:        { name:'วิดีโอกล้อง AI',            headers:['บันทึกเมื่อ','ชื่อไฟล์','สินค้า/เป้าหมาย','ผู้บันทึก','ขนาดไฟล์','ลิงก์ Drive','หมายเหตุ'] },
  loginLocation:{ name:'ประวัติล็อกอินและพิกัด',    headers:['บันทึกเมื่อ','ID','ชื่อ','ชื่อจริง','เลเวล','วิธีล็อกอิน','สถานะพิกัด','Latitude','Longitude','Accuracy(m)','หมายเหตุ'] },
};

// ─── Get or create Spreadsheet ──────────────────────────────────────
function getSS_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty(PROP_KEY), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch(e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    p.setProperty(PROP_KEY, ss.getId());
    try { const d = ss.getSheets()[0]; if (d && d.getName() === 'Sheet1') ss.deleteSheet(d); } catch(e) {}
  }
  // Ensure all sheets exist with headers
  Object.values(SHEETS).forEach(def => {
    let sh = ss.getSheetByName(def.name);
    if (!sh) sh = ss.insertSheet(def.name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, def.headers.length)
        .setValues([def.headers])
        .setFontWeight('bold')
        .setBackground('#1a1f2e')
        .setFontColor('#ffffff');
      sh.setFrozenRows(1);
    }
  });
  return ss;
}

// ─── Image upload to Drive ───────────────────────────────────────────
function getImgFolder_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty(IMG_FOLDER_KEY), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch(e) { f = null; } }
  if (!f) {
    f = DriveApp.createFolder(IMG_FOLDER_NAME);
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    p.setProperty(IMG_FOLDER_KEY, f.getId());
  }
  return f;
}
function saveImg_(dataUrl, hint) {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  const m = dataUrl.match(/^data:(image\/[\w+.\-]+);base64,([\s\S]+)$/);
  if (!m) { return /^https?:\/\//.test(dataUrl) ? dataUrl : ''; }
  try {
    const mime = m[1], bytes = Utilities.base64Decode(m[2]);
    const ext  = (mime.split('/')[1] || 'jpg').split('+')[0];
    const safe = String(hint || 'image').replace(/[^\w\-ก-๙ .]/g, '_').slice(0, 50);
    const blob = Utilities.newBlob(bytes, mime, safe + '_' + Date.now() + '.' + ext);
    const file = getImgFolder_().createFile(blob);
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    return 'https://drive.google.com/uc?export=view&id=' + file.getId();
  } catch(e) { return ''; }
}

function getVideoFolder_() {
  const p = PropertiesService.getScriptProperties();
  let id = p.getProperty(VIDEO_FOLDER_KEY), f = null;
  if (id) { try { f = DriveApp.getFolderById(id); } catch(e) { f = null; } }
  if (!f) {
    f = DriveApp.createFolder(VIDEO_FOLDER_NAME);
    try { f.addEditor(DRIVE_OWNER_EMAIL); } catch(e) {}
    try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    p.setProperty(VIDEO_FOLDER_KEY, f.getId());
  }
  return f;
}
function saveVideo_(dataUrl, hint) {
  if (!dataUrl || typeof dataUrl !== 'string') return '';
  const m = dataUrl.match(/^data:(video\/[\w+.\-]+);base64,([\s\S]+)$/);
  if (!m) { return /^https?:\/\//.test(dataUrl) ? dataUrl : ''; }
  try {
    const mime = m[1], bytes = Utilities.base64Decode(m[2]);
    const ext  = (mime.split('/')[1] || 'webm').split('+')[0];
    const safe = String(hint || 'ai-camera-video').replace(/[^\w\-ก-๙ .]/g, '_').slice(0, 50);
    const blob = Utilities.newBlob(bytes, mime, safe + '_' + Date.now() + '.' + ext);
    const file = getVideoFolder_().createFile(blob);
    try { file.addViewer(DRIVE_OWNER_EMAIL); } catch(e) {}
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    return 'https://drive.google.com/file/d/' + file.getId() + '/view';
  } catch(e) { return ''; }
}

// ─── Sheet helpers ────────────────────────────────────────────────────
function append_(name, rows) {
  if (!rows || !rows.length) return 0;
  const sh = getSS_().getSheetByName(name);
  if (!sh) return 0;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  return rows.length;
}
function upsert_(name, rows) {
  if (!rows || !rows.length) return 0;
  const sh   = getSS_().getSheetByName(name);
  if (!sh) return 0;
  const data = sh.getDataRange().getValues();
  const idx  = {};
  for (let i = 1; i < data.length; i++) idx[String(data[i][0])] = i + 1;
  rows.forEach(r => {
    const key = String(r[0]);
    if (idx[key]) sh.getRange(idx[key], 1, 1, r.length).setValues([r]);
    else sh.appendRow(r);
  });
  return rows.length;
}

// ─── Finance upsert (key-based) ───────────────────────────────────────
function finSrc_(e) {
  const k = String((e && e.facKey) || '');
  if (k.indexOf('fac:lot:') === 0) return '🏭 ผลิต';
  if (k.indexOf('fac:bot:') === 0) return '📦 ขาย';
  if (k.indexOf('fac:emp:') === 0) return '🍶 ขวด';
  if (e && e.manual) return '✋ เอง';
  return 'อื่นๆ';
}
function upsertFin_(entries, by) {
  if (!entries || !entries.length) return 0;
  const sh   = getSS_().getSheetByName(SHEETS.finance.name);
  const data = sh.getDataRange().getValues();
  const keyCol = SHEETS.finance.headers.length;
  const idx  = {};
  for (let i = 1; i < data.length; i++) {
    const k = String(data[i][keyCol - 1] || '');
    if (k) idx[k] = i + 1;
  }
  const now = new Date();
  let n = 0;
  entries.forEach(e => {
    const uid = String(e.facKey || e.id || '');
    if (!uid) return;
    if (e._deleted) {
      if (idx[uid]) { sh.deleteRow(idx[uid]); delete idx[uid]; }
      return;
    }
    const inc  = Number(e.incTotal || 0), exp = Number(e.expTotal || 0);
    const net  = Number.isFinite(Number(e.net)) ? Number(e.net) : inc - exp;
    const items = [].concat(e.incItems || [], e.expItems || []);
    const desc  = items.map(i => i && i.name).filter(Boolean).join(' · ') || (e.note || '');
    const cat   = (items[0] && items[0].category) || e.category || '';
    const row   = [e.date||'', finSrc_(e), e.lot||'', cat, desc, inc, exp, net, e.note||'', by||'', now, uid];
    if (idx[uid]) sh.getRange(idx[uid], 1, 1, row.length).setValues([row]);
    else          { sh.appendRow(row); idx[uid] = sh.getLastRow(); }
    n++;
  });
  return n;
}

// ─── doPost ──────────────────────────────────────────────────────────
function doPost(e) {
  try {
    const b  = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const t  = b.type || '', d = b.data || [], by = b.by || '', now = new Date();
    let n = 0;

    if (t === 'ping') {
      const ss = getSS_();
      return out({ ok:true, pong:true, name:ss.getName(), spreadsheetId:ss.getId(), url:ss.getUrl() });
    }
    else if (t === 'daily') {
      const rows = [];
      (d || []).forEach(entry => {
        const date = entry.date || '';
        (entry.expItems || []).forEach(i => {
          const img = saveImg_(i.photo, date + '_' + (i.name || 'exp'));
          rows.push([date, 'รายจ่าย', i.category||'', i.name||'', Number(i.qty||0), i.unit||'', Number(i.price||0), Number(i.total||0), '', by, now, img]);
        });
        (entry.incItems || []).forEach(i => {
          const img = saveImg_(i.photo, date + '_' + (i.name || 'inc'));
          rows.push([date, 'รายรับ', i.category||'', i.name||'', Number(i.qty||0), i.unit||'', Number(i.price||0), Number(i.total||0), '', by, now, img]);
        });
      });
      n = append_(SHEETS.daily.name, rows);
    }
    else if (t === 'movement') {
      n = append_(SHEETS.movement.name, (d || []).map(m => {
        const img = saveImg_(m.image, (m.name||'move') + '_' + (m.kind||''));
        return [new Date(m.ts||Date.now()), m.id||'', m.name||'', m.kind||'', Number(m.qty||0), m.unit||'', Number(m.before||0), Number(m.after||0), m.note||'', by, img];
      }));
    }
    else if (t === 'count') {
      n = append_(SHEETS.count.name, (d || []).map(c => [
        c.date || new Date().toISOString().slice(0,10), c.id||'', c.name||'', c.category||'',
        Number(c.system||0), Number(c.actual||0), Number(c.actual||0)-Number(c.system||0), c.unit||'', by, c.note||''
      ]));
    }
    else if (t === 'inventory') {
      n = upsert_(SHEETS.inventory.name, (d || []).map(it => {
        const q = Number(it.stock||0), c = Number(it.cost||0);
        const img = saveImg_(it.image, it.name);
        return [it.id||'', it.category||'', it.name||'', q, it.unit||'', Number(it.reorder||0), c, q*c, now, img];
      }));
    }
    else if (t === 'catalog') {
      n = upsert_(SHEETS.catalog.name, (d || []).map(it => [
        it.id||'', it.category||'', it.name||'', it.unit||'', Number(it.price||0), it.description||''
      ]));
    }
    else if (t === 'sales') {
      n = append_(SHEETS.daily.name, (d || []).map(s => [
        s.date || new Date(s.ts || Date.now()).toISOString().slice(0,10),
        'รายรับ',
        s.category || 'sales',
        s.name || '',
        Number(s.qty || s.count || 0),
        s.unit || '',
        Number(s.price || 0),
        Number(s.total || 0) || Number(s.qty || s.count || 0) * Number(s.price || 0),
        s.note || (s.room ? 'ห้อง: ' + s.room : ''),
        by,
        now,
        ''
      ]));
    }
    else if (t === 'production') {
      n = append_(SHEETS.production.name, (d || []).map(p => [
        p.date||'', p.lot||'', Number(p.sugar||0), Number(p.salt||0), Number(p.citric||0),
        Number(p.pectin||0), Number(p.color||0), Number(p.milk||0), Number(p.orangeA||0),
        Number(p.orangeB||0), Number(p.ice||0), Number(p.juiceMl||0),
        p.status||'ผลิตเสร็จ', p.note||'', now, by
      ]));
    }
    else if (t === 'bottling') {
      n = append_(SHEETS.bottling.name, (d || []).map(b => {
        const s=Number(b.size||0), q=Number(b.qty||0), u=Number(b.used||s*q), so=Number(b.sold||0);
        return [b.date||'', b.lot||'', s, q, u, Number(b.remaining||0), so, q-so, b.soldDate||'', b.note||'', now, by];
      }));
    }
    else if (t === 'emptyBottle') {
      n = append_(SHEETS.emptyBottle.name, (d || []).map(e => {
        const q=Number(e.qty||0), pr=Number(e.price||0);
        return [e.date||'', e.kind||'ซื้อเข้า', Number(e.size||0), q, pr, Math.abs(q)*pr, Number(e.balance||0), e.note||'', now, by];
      }));
    }
    else if (t === 'finance') {
      n = upsertFin_(d, by);
    }
    else if (t === 'cameraVideo') {
      n = append_(SHEETS.video.name, (d || []).map(v => {
        const url = saveVideo_(v.video, v.name || v.target || 'ai-camera-video');
        return [now, v.name || '', v.target || '', by, Number(v.size || 0), url, v.note || ''];
      }));
    }
    else if (t === 'loginLocation') {
      n = append_(SHEETS.loginLocation.name, (d || []).map(x => [
        x.at ? new Date(x.at) : new Date(x.ts || Date.now()),
        x.id4 || '',
        x.name || by || '',
        x.realName || '',
        x.level || '',
        x.method || '',
        x.status || '',
        x.lat || '',
        x.lng || '',
        x.accuracy || '',
        x.error || ''
      ]));
    }
    else {
      throw new Error('ไม่รู้จัก type: ' + t);
    }

    const ss = getSS_();
    return out({ ok:true, count:n, spreadsheetId:ss.getId(), url:ss.getUrl() });

  } catch(err) {
    return out({ ok:false, error:String(err) });
  }
}

// ─── doGet (ping + pull data back to app) ────────────────────────────
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const op = params.op || '';
  const ss = getSS_();

  if (op === 'pull') {
    const type = params.type || 'all';
    return out(pullData_(ss, type));
  }

  return out({ ok:true, name:ss.getName(), spreadsheetId:ss.getId(), url:ss.getUrl() });
}

// ─── Pull data from sheets back to app ───────────────────────────────
function pullData_(ss, type) {
  function readSheet(sheetName, mapper) {
    const sh = ss.getSheetByName(sheetName);
    if (!sh || sh.getLastRow() < 2) return [];
    return sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn())
             .getValues()
             .filter(r => r[0] !== '' && r[0] !== null)
             .map(mapper);
  }

  function fmtDate(v) {
    if (!v) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).slice(0, 10);
  }

  if (type === 'catalog') {
    const items = readSheet(SHEETS.catalog.name, r => ({
      id: String(r[0] || ''), category: String(r[1] || ''), name: String(r[2] || ''),
      unit: String(r[3] || ''), price: Number(r[4] || 0), description: String(r[5] || '')
    })).filter(i => i.id && i.name);
    return { ok: true, type: 'catalog', items };
  }

  if (type === 'inventory') {
    const items = readSheet(SHEETS.inventory.name, r => ({
      id: String(r[0] || ''), category: String(r[1] || ''), name: String(r[2] || ''),
      stock: Number(r[3] || 0), unit: String(r[4] || ''),
      reorder: Number(r[5] || 0), cost: Number(r[6] || 0)
    })).filter(i => i.id);
    return { ok: true, type: 'inventory', items };
  }

  if (type === 'finance') {
    const headers = SHEETS.finance.headers;
    const keyIdx = headers.length - 1; // Key is last column
    const items = readSheet(SHEETS.finance.name, r => ({
      id: String(r[keyIdx] || ''), date: fmtDate(r[0]),
      category: String(r[3] || ''), note: String(r[8] || ''),
      incTotal: Number(r[5] || 0), expTotal: Number(r[6] || 0), net: Number(r[7] || 0)
    })).filter(i => i.id);
    return { ok: true, type: 'finance', items };
  }

  if (type === 'all') {
    const catalog  = pullData_(ss, 'catalog').items  || [];
    const inventory = pullData_(ss, 'inventory').items || [];
    return { ok: true, type: 'all', catalog, inventory };
  }

  return { ok: false, error: 'ไม่รู้จัก type: ' + type };
}

function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
