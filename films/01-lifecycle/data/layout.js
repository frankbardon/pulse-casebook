// Checks the record layout the film's "cohort on disk" scene draws, from l.pulse's own bytes:
// 140 fixed-width records sit at the end of the file, so payload = 140 x stride. The stride is
// confirmed by decoding every record and comparing it with l.csv. Writes l.layout.json.
const fs = require('fs');
const b = fs.readFileSync('l.pulse'), csv = fs.readFileSync('l.csv', 'utf8').trim().split('\n').slice(1).map(l => l.split(','));
const N = csv.length, stride = 17, start = b.length - N * stride;
const dict = ['South', 'West', 'East', 'North'];   // l.pulse's region dictionary (pulse cohort inspect)
csv.forEach((r, i) => {
  const o = start + i * stride;
  const ok = dict[b[o]] === r[0] && b[o + 1] === +r[1] && b.readDoubleLE(o + 6) === +r[3] && b[o + 14] === (r[4] === 'true' ? 1 : 0) && (r[5] === '' || b[o + 15] === +r[5]);
  if (!ok) { console.error('record ' + i + ' does not decode at stride ' + stride); process.exit(1); }
});
const out = { file_bytes: b.length, header_bytes: 9, magic: b.slice(0, 8).toString('latin1'), version: b[8], record_count: N, stride, payload_bytes: N * stride, before_records: start };
fs.writeFileSync('l.layout.json', JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out));
