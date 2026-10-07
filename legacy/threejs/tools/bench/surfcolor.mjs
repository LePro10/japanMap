import sharp from 'sharp';
const files = {
  asphalt: 'assets/generated/textures/asphalt_02/Diffuse.jpg',
  gras: 'assets/generated/textures/aerial_grass_rock/Diffuse.jpg',
  schlamm: 'assets/generated/textures/brown_mud_02/Diffuse.jpg',
  sand: 'assets/generated/textures/coast_sand_01/Diffuse.jpg',
};
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
for (const [name, f] of Object.entries(files)) {
  try {
    const s = await sharp(f).stats();
    const [r, g, b] = s.channels.map((c) => Math.round(c.mean));
    const hex = '0x' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    console.log(`${name.padEnd(9)} Mittelwert ${hex}  (${r},${g},${b})  Helligkeit ${lum(r,g,b).toFixed(1)}/255`);
  } catch (e) { console.log(`${name}: ${e.message}`); }
}
// Und die gesetzten Spurfarben zum Vergleich
for (const [n, hex] of [['Spur asphalt (alt)', 0x2a221c], ['Spur dirt (alt)', 0x6a4a32], ['Kiesbelag', 0x6f6049]]) {
  const r = (hex>>16)&255, g = (hex>>8)&255, b = hex&255;
  console.log(`${n.padEnd(20)} ${'0x'+hex.toString(16).padStart(6,'0')}  (${r},${g},${b})  Helligkeit ${lum(r,g,b).toFixed(1)}/255`);
}
