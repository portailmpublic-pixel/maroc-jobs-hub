// Structural PDF validator: parses xref, resolves Catalog->Pages->Kids,
// checks every kid is a /Page with a /Contents stream of matching /Length,
// and counts Tj text ops. Catches wrong object numbering (blank-page bug).
const fs = require('fs');

function validatePdf(buf) {
  const errors = [];
  const s = buf.toString('latin1');
  if (buf.slice(0, 5).toString() !== '%PDF-') errors.push('bad magic');
  // collect objects
  const objs = {};
  const re = /(\d+) 0 obj\n([\s\S]*?)\nendobj\n/g;
  let m;
  while ((m = re.exec(s)) !== null) objs[m[1]] = m[2];
  // xref offsets
  const xrefAt = s.lastIndexOf('\nxref\n');
  if (xrefAt < 0) { errors.push('no xref'); return { ok: false, errors }; }
  const xref = s.slice(xrefAt + 6);
  const lines = xref.split('\n');
  const size = parseInt(lines[0].split(' ')[1], 10);
  for (let i = 1; i < size && i < lines.length; i++) {
    const off = parseInt(lines[i].slice(0, 10), 10);
    if (i === 0 || lines[i].slice(17, 18) !== 'n') continue;
    const at = buf[off] >= 48 && buf[off] <= 57 ? true : false;
    if (!at) errors.push(`xref obj ${i} points to byte ${off} (not a digit)`);
  }
  const root = (objs['1'] || '').match(/\/Root\s+(\d+) 0 R/);
  const pagesRef = (objs['2'] || '').match(/\/Kids\s*\[([^\]]*)\]/);
  if (!pagesRef) errors.push('pages node has no Kids');
  // fonts must declare WinAnsi encoding + a ToUnicode map (correct display & copy)
  for (const fn of ['3', '4']) {
    const fd = objs[fn] || '';
    if (!/\/Encoding\s*\/WinAnsiEncoding/.test(fd)) errors.push(`font ${fn} missing WinAnsi Encoding`);
    const tu = fd.match(/\/ToUnicode\s+(\d+) 0 R/);
    if (!tu) { errors.push(`font ${fn} missing ToUnicode`); continue; }
    const cmap = objs[tu[1]] || '';
    if (!/beginbfchar/.test(cmap)) errors.push(`ToUnicode ${tu[1]} has no bfchar`);
    const cmapLow = cmap.toLowerCase();
    for (const probe of ['<e9> <00e9>', '<ea> <00ea>', '<e8> <00e8>', '<e0> <00e0>', '<e7> <00e7>']) {
      if (!cmapLow.includes(probe)) errors.push(`ToUnicode missing mapping ${probe}`);
    }
  }
  const kids = pagesRef ? [...pagesRef[1].matchAll(/(\d+) 0 R/g)].map((x) => x[1]) : [];
  const count = parseInt(((objs['2'] || '').match(/\/Count\s+(\d+)/) || [])[1] || '0', 10);
  if (kids.length !== count) errors.push(`Count=${count} but Kids=${kids.length}`);
  let totalTj = 0;
  for (const k of kids) {
    const dict = objs[k] || '';
    if (!/\/Type\s*\/Page\b/.test(dict)) { errors.push(`kid ${k} is not a /Page`); continue; }
    const c = dict.match(/\/Contents\s+(\d+) 0 R/);
    if (!c) { errors.push(`page ${k} has no Contents`); continue; }
    const streamObj = objs[c[1]] || '';
    const lenDecl = parseInt((streamObj.match(/\/Length\s+(\d+)/) || [])[1] || '-1', 10);
    const sm = streamObj.match(/stream\n([\s\S]*?)endstream/);
    if (!sm) { errors.push(`content ${c[1]} has no stream`); continue; }
    if (Buffer.byteLength(sm[1], 'latin1') !== lenDecl) errors.push(`content ${c[1]} length mismatch (${Buffer.byteLength(sm[1], 'latin1')} vs ${lenDecl})`);
    totalTj += (sm[1].match(/Tj\b/g) || []).length;
  }
  return { ok: errors.length === 0, errors, pages: kids.length, textOps: totalTj };
}

if (require.main === module) {
  const dir = require('path').join(__dirname, '..', 'data', 'exams-library');
  let allOk = true;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.pdf'))) {
    const r = validatePdf(fs.readFileSync(require('path').join(dir, f)));
    console.log(f, '=>', r.ok ? `OK (${r.pages} pages, ${r.textOps} texts)` : `BROKEN: ${r.errors.join('; ')}`);
    if (!r.ok) allOk = false;
  }
  process.exit(allOk ? 0 : 1);
}

module.exports = { validatePdf };
