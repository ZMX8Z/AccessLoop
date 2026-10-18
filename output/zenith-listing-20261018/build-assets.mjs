import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const out = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(out, '../..');
const frontScript = await fs.readFile(path.join(root, 'public/stitch/app.js'), 'utf8');
const brandPath = frontScript.match(/accessible_forward:'([^']+)'/)[1];
const campus = await fs.readFile(path.join(root, 'public/stitch/campus.svg'));
const mapData = `data:image/svg+xml;base64,${campus.toString('base64')}`;
const glyph = (color = '#ffffff', width = '1.8') => `<path d="${brandPath}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
<defs><radialGradient id="bg" cx="28%" cy="20%" r="110%"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#004d47"/></radialGradient></defs>
<rect width="1024" height="1024" fill="url(#bg)"/>
<circle cx="512" cy="512" r="365" fill="none" stroke="#97f5cc" stroke-opacity=".15" stroke-width="4"/>
<g transform="translate(122 112) scale(33)">${glyph('#ffffff', '1.9')}</g>
<circle cx="824" cy="235" r="30" fill="#97f5cc"/>
</svg>`;

const cover = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1800" height="1000" viewBox="0 0 1800 1000">
<defs>
<linearGradient id="paper" x2="1" y2="1"><stop stop-color="#faf8ff"/><stop offset="1" stop-color="#eff7f1"/></linearGradient>
<linearGradient id="teal" x2="1" y2="1"><stop stop-color="#0f766e"/><stop offset="1" stop-color="#005c55"/></linearGradient>
<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="22" stdDeviation="25" flood-color="#123a34" flood-opacity=".13"/></filter>
<clipPath id="mapClip"><rect x="0" y="0" width="680" height="570" rx="34"/></clipPath>
</defs>
<rect width="1800" height="1000" fill="url(#paper)"/>
<circle cx="1540" cy="380" r="570" fill="#d4f4e7" fill-opacity=".55"/>
<circle cx="1740" cy="840" r="280" fill="#bde9da" fill-opacity=".25"/>
<g transform="translate(110 106)">
<rect width="80" height="80" rx="21" fill="url(#teal)"/>
<g transform="translate(9 6) scale(2.6)">${glyph('#ffffff', '1.8')}</g>
<text x="106" y="59" fill="#131b2e" font-family="Arial,sans-serif" font-size="65" font-weight="700" letter-spacing="-2.5">AccessLoop</text>
</g>
<text x="114" y="316" fill="#0f766e" font-family="Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="4">CAMPUS ACCESSIBILITY</text>
<text x="108" y="438" fill="#131b2e" font-family="Arial,sans-serif" font-size="92" font-weight="700" letter-spacing="-4">Campus access,</text>
<text x="108" y="548" fill="#005c55" font-family="Arial,sans-serif" font-size="92" font-weight="700" letter-spacing="-4">made clearer.</text>
<text x="113" y="634" fill="#52615c" font-family="Arial,sans-serif" font-size="28">Maps, wheelchair routes and barrier reports.</text>
<g transform="translate(112 720)" font-family="Arial,sans-serif" font-size="22" font-weight="700">
<rect width="150" height="57" rx="28.5" fill="#005c55"/><text x="75" y="37" text-anchor="middle" fill="#ffffff">Explore</text>
<rect x="166" width="150" height="57" rx="28.5" fill="#d4f4e7"/><text x="241" y="37" text-anchor="middle" fill="#005c55">Report</text>
<rect x="332" width="150" height="57" rx="28.5" fill="#e2e7ff"/><text x="407" y="37" text-anchor="middle" fill="#283044">Reroute</text>
</g>
<text x="114" y="876" fill="#65776e" font-family="Arial,sans-serif" font-size="21">Campus accessibility pilot</text>
<g transform="translate(1010 178) rotate(3 340 305)" filter="url(#shadow)">
<rect x="-15" y="-15" width="710" height="680" rx="49" fill="#ffffff"/>
<g clip-path="url(#mapClip)">
<image xlink:href="${mapData}" width="680" height="570" preserveAspectRatio="xMidYMid slice"/>
<rect width="680" height="570" fill="#ffffff" fill-opacity=".08"/>
<path d="M103 425 Q250 330 375 275 T584 165" fill="none" stroke="#b94747" stroke-opacity=".6" stroke-width="5" stroke-dasharray="10 10"/>
<path d="M103 425 C190 440 275 493 354 422 C426 358 427 230 584 165" fill="none" stroke="#ffffff" stroke-width="18" stroke-linecap="round"/>
<path d="M103 425 C190 440 275 493 354 422 C426 358 427 230 584 165" fill="none" stroke="#0f766e" stroke-width="10" stroke-linecap="round"/>
<circle cx="103" cy="425" r="16" fill="#ffffff" stroke="#005c55" stroke-width="7"/>
<circle cx="354" cy="422" r="19" fill="#97f5cc" stroke="#ffffff" stroke-width="6"/>
<circle cx="584" cy="165" r="17" fill="#005c55" stroke="#ffffff" stroke-width="7"/>
<g transform="translate(360 257)"><rect x="-24" y="-24" width="48" height="48" rx="14" fill="#ffdad6"/><path d="M-9-9L9 9M9-9L-9 9" stroke="#93000a" stroke-width="5" stroke-linecap="round"/></g>
<rect x="32" y="30" width="237" height="54" rx="27" fill="#ffffff"/><circle cx="62" cy="57" r="7" fill="#0f766e"/><text x="82" y="65" fill="#005c55" font-family="Arial,sans-serif" font-size="21" font-weight="700">AccessLoop routes</text>
</g>
<g transform="translate(25 599)"><g transform="translate(0 -10) scale(1.6)">${glyph('#0f766e', '1.8')}</g><text x="56" y="18" fill="#131b2e" font-family="Arial,sans-serif" font-size="25" font-weight="700">Explore another way</text><text x="627" y="16" text-anchor="end" fill="#65776e" font-family="Arial,sans-serif" font-size="16">DESIGN PREVIEW</text></g>
</g>
</svg>`;

await fs.writeFile(path.join(out, 'accessloop-app-icon.svg'), icon);
await fs.writeFile(path.join(out, 'accessloop-cover.svg'), cover);
await sharp(Buffer.from(icon)).png({compressionLevel:9}).toFile(path.join(out, 'accessloop-app-icon-final.png'));
await sharp(Buffer.from(cover)).png({compressionLevel:9}).toFile(path.join(out, 'accessloop-cover.png'));
await sharp(Buffer.from(cover)).jpeg({quality:92,mozjpeg:true}).toFile(path.join(out, 'accessloop-cover.jpg'));

for (const name of ['accessloop-app-icon-final.png','accessloop-cover.png','accessloop-cover.jpg']) {
  const file = path.join(out, name);
  const meta = await sharp(file).metadata();
  const {size} = await fs.stat(file);
  console.log(JSON.stringify({name,width:meta.width,height:meta.height,bytes:size,under2MB:size<2_000_000}));
}
