// Write narration lengths into the film page's NARR slot, or reset it to null with --reset.
const fs = require('fs');
const page = process.argv[2];
const num = x => Number.isInteger(x) ? x.toFixed(1) : String(x);
const val = process.argv.includes('--reset') ? 'null'
  : '[' + JSON.parse(fs.readFileSync('vo/lens.json', 'utf8')).lens.map(num).join(', ') + ']';
const s = fs.readFileSync(page, 'utf8');
fs.writeFileSync(page, s.replace(/\/\*NARR\*\/[^\n]*?\/\*END\*\//, () => '/*NARR*/' + val + '/*END*/'));
