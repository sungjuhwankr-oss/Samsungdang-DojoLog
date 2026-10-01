import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const reference = new URL('../reference/', import.meta.url);
const baseline = JSON.parse(readFileSync(new URL('kata-catalog.v1.json', reference), 'utf8'));
const read = name => readFileSync(new URL(`sources/${name}`, reference), 'utf8').replace(/\r\n/g, '\n');
const mapping = new Map();
const videoSource = read('hombu-video-links.v2.txt');
const rows = videoSource.split('\n').filter(line => line && !line.startsWith('#'));
for (const row of rows) {
  const parts = row.split('|');
  assert.ok(parts.length === 2 || parts.length === 3);
  assert.ok(baseline.kata.some(k => k.nameKo === parts[0]), `Unknown exact name: ${parts[0]}`);
  const link = parts.length === 3 ? {label: parts[1], url: parts[2]} : {url: parts[1]};
  assert.ok(link.url.startsWith('https://'));
  mapping.set(parts[0], [...(mapping.get(parts[0]) ?? []), link]);
}
assert.equal(rows.length, 108);
assert.equal(mapping.size, 74);
const category = name => name.startsWith('단도 뺏기 ') ? 'tanto' : name.startsWith('검 뺏기 ') ? 'ken' : name.startsWith('장 뺏기 ') ? 'jo' : name.startsWith('2인 잡기 ') ? 'multi-other' : 'taijutsu';
const kata = baseline.kata.map(({grade, exam, ...k}) => ({
  ...k, categoryId: category(k.nameKo),
  examEntries: exam ? [{track:'kyu', grade}] : [], links: mapping.get(k.nameKo) ?? [],
}));
// Exact weapon assignment and URLs: roadmap v1.17 Sections 17 and 20.
const weapons = [
  ['사방베기','ken',6,'https://youtu.be/CMV2U8VXtaw'],
  ...[4,3,2,2,1,1,1].map((grade,index) => [`검 아와세 ${index+1}번`,'ken',grade]),
  ['6의 장','jo',5,'https://youtu.be/bxY_L_x_QB4?si=8DEyLGuOTEBJipiH&t=44'],
  ['8의 장','jo',4,'https://youtu.be/bxY_L_x_QB4?si=4iYdk4CQV3OUCjhE&t=58'],
  ...[2,2,2,2,1,1,1,1].map((grade,index) => [`장 아와세 ${index+1}번`,'jo',grade]),
  ['13의 장','jo',null,'https://youtu.be/bxY_L_x_QB4?si=Vps2AnifbPKBfrP-&t=76'],
  ['31의 장','jo',null,'https://youtu.be/bxY_L_x_QB4?si=ofSclLvdwGezBpkU&t=106'],
];
for (const [nameKo,categoryId,grade,url] of weapons) kata.push({
  id:nameKo.replace(/\s/g,'-'), nameKo, form:'입기', attack:categoryId === 'ken' ? '검' : '장',
  technique:nameKo.includes('아와세') ? `${categoryId === 'ken' ? '검' : '장'} 아와세` : nameKo,
  area:'무기 잡기', categoryId, hombu:false,
  examEntries:grade === null ? [{track:'dan'}] : [{track:'kyu',grade}], links:url ? [{url}] : [],
});
assert.equal(kata.length, 97);
assert.equal(new Set(kata.map(k => k.id)).size, 97);
assert.equal(kata.filter(k => k.examEntries.length).length, 79);
assert.equal(kata.filter(k => k.examEntries.some(e => e.track === 'kyu')).length, 77);
assert.equal(kata.filter(k => k.examEntries.some(e => e.track === 'dan')).length, 2);
assert.equal(kata.filter(k => k.links.length).length, 79);
assert.equal(kata.reduce((count,k) => count+k.links.length,0), 113);
const beginnerSource = read('beginner-videos.txt');
const lines = beginnerSource.split('\n').filter(line => line !== '');
assert.equal(lines.length, 106);
const videos = [];
for (let index=0;index<lines.length;index+=2) {
  assert.ok(lines[index+1].startsWith('https://'));
  videos.push({title:lines[index],url:lines[index+1]});
}
const hash = text => createHash('sha256').update(text).digest('hex');
const outputs = {
  'kata-catalog.v2.json':{catalogVersion:2, sourceFacts:{canonicalKata:97,authoritativeVideoKata:74,authoritativeVideoLinks:108,videoKata:79,videoLinks:113},kata},
  'beginner-videos.v1.json':{libraryVersion:1,sourceSha256:hash(beginnerSource),videos},
};
for (const [name,value] of Object.entries(outputs)) {
  const bytes = `${JSON.stringify(value,null,2)}\n`;
  writeFileSync(new URL(name,reference),bytes);
  console.log(`${name}: ${hash(bytes)}`);
}
