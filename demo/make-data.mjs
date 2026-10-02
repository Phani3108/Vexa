import fs from 'fs';
const b = new URL('./build/', import.meta.url);
const data = {
  timeline: JSON.parse(fs.readFileSync(new URL('timeline.json', b))),
  run: JSON.parse(fs.readFileSync(new URL('run.json', b))),
  screens: JSON.parse(fs.readFileSync(new URL('screens.json', b)))
};
fs.writeFileSync(new URL('data.js', b), `window.DATA = ${JSON.stringify(data)};`);
console.log('data.js written');
