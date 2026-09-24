import { CanvasTexture, SRGBColorSpace } from 'three';

const SHOPS = [
  ['月光喫茶','MOONLIGHT COFFEE'],['夜の映画','YORU CINEMA'],['花屋','PETAL & STEM'],['電気街','ELECTRIC AVENUE'],
  ['麺と灯','LANTERN NOODLES'],['古書店','SECOND CHAPTER'],['音楽室','AFTER HOURS RECORDS'],['工房','NORTH STAR WORKS'],
  ['珈琲','SLOW DRIP'],['雨の日','RAIN DAY STUDIO'],['パン屋','MORNING BREAD'],['写真室','FRAME / PHOTO'],
  ['南市場','SOUTH MARKET'],['東灯','EAST LANTERN'],['風の庭','RAIN GARDEN'],['夜街','CROSSLIGHT'],
];
const COLORS=['#cf514e','#e8c683','#538d91','#667ab1','#bd6d8c','#779279','#d9cdb5','#8ea6aa'];

/** One original 1024² page for the entire streetscape, including the large hero ads. */
export function buildCityGraphicAtlas():CanvasTexture {
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=1024;
  const g=canvas.getContext('2d')!;
  for(let i=0;i<32;i++){
    const x=(i%4)*256,y=Math.floor(i/4)*128;
    g.save();g.translate(x,y);g.fillStyle='#131d29';g.fillRect(0,0,256,128);
    const color=COLORS[i%COLORS.length]!;
    g.fillStyle=color;g.fillRect(5,5,246,118);g.fillStyle='#15202b';g.fillRect(9,9,238,110);
    if(i<16){
      g.fillStyle=color;g.fillRect(14,14,7,100);
      g.font='bold 35px sans-serif';g.textAlign='center';g.fillText(SHOPS[i]![0]!,139,57,211);
      g.font='bold 15px sans-serif';g.fillStyle='#f2e5cb';g.fillText(SHOPS[i]![1]!,138,84,211);
      g.font='9px sans-serif';g.fillStyle=color;g.fillText(i%3===0?'OPEN LATE  /  WELCOME':'EST. 1986  •  NEON BASIN',138,106);
    }else if(i<24){
      // Opaque display depth remains legible on Low, without a transparent pass per shop.
      g.fillStyle=i%2?'#503927':'#28404a';g.fillRect(12,12,232,104);
      const grad=g.createLinearGradient(0,10,0,118);grad.addColorStop(0,'#f6d9a5');grad.addColorStop(.13,'#715039');grad.addColorStop(1,'#19212a');g.fillStyle=grad;g.fillRect(20,16,216,95);
      const kind=i-16;
      if(kind===0||kind===4){
        // Cafe: pendant pools, two tables, stools and a distant coffee counter.
        g.fillStyle='#bd9e77';g.fillRect(25,67,204,4);
        for(const cx of [58,179]){
          g.fillStyle='#2b292b';g.fillRect(cx-1,17,2,13);
          g.fillStyle='#eedeb5';g.beginPath();g.ellipse(cx,34,18,7,0,Math.PI,2*Math.PI);g.fill();
          g.fillStyle='#8d6245';g.fillRect(cx-27,82,54,5);g.fillRect(cx-2,87,4,23);
          g.fillStyle='#e6dac0';g.fillRect(cx-11,76,6,6);g.fillRect(cx+10,76,6,6);
          g.fillStyle='#463839';g.fillRect(cx-24,97,8,14);g.fillRect(cx+19,97,8,14);
        }
      }else if(kind===2||kind===6){
        // Florist: irregular stems and pots, no supermarket shelving.
        for(let j=0;j<9;j++){
          const cx=34+j*22,cy=75+(j%3)*9;
          g.fillStyle='#a7795c';g.fillRect(cx-6,cy,13,16);
          g.strokeStyle='#798b68';g.lineWidth=3;g.beginPath();g.moveTo(cx,cy);g.lineTo(cx-4,cy-31);g.stroke();
          for(let k=0;k<4;k++){g.fillStyle=k===3?'#dba58e':'#718263';g.beginPath();g.ellipse(cx+(k%2?6:-7),cy-8-k*7,8,5,k%2?-.5:.5,0,Math.PI*2);g.fill();}
        }
      }else if(kind===3||kind===7){
        // Record / clothing studio: sparse displays and a poster wall.
        for(let j=0;j<4;j++){
          const cx=29+j*52;g.fillStyle=COLORS[(i+j)%COLORS.length]!;g.fillRect(cx,27,38,48);
          g.fillStyle='#263340';g.beginPath();g.arc(cx+19,47,12,0,Math.PI*2);g.fill();
          g.fillStyle='#d5b278';g.beginPath();g.arc(cx+19,47,3,0,Math.PI*2);g.fill();
        }
        g.fillStyle='#90694e';g.fillRect(25,91,205,18);g.fillStyle='#d5bc94';g.fillRect(23,89,209,4);
      }else for(let row=0;row<3;row++){
        for(let j=0;j<12;j++){
          g.fillStyle=COLORS[(j*3+row+i)%COLORS.length]!;
          g.fillRect(29+j*16,29+row*25,9,13+(j%3)*2);
          g.fillStyle='#e8e0c9';g.fillRect(31+j*16,35+row*25,5,3);
        }
        g.fillStyle='#b49b75';g.fillRect(24,48+row*25,207,3);
      }
      g.fillStyle='#263540';g.fillRect(120,12,6,104);g.fillRect(12,110,232,7);
      g.fillStyle='rgba(170,214,225,.1)';g.beginPath();g.moveTo(18,16);g.lineTo(61,16);g.lineTo(109,111);g.lineTo(66,111);g.fill();
    }else{
      // Neo-Tokio v2: die Werbetafeln der alten Kreuzung sind weg (siehe
      // CityStreetDress), ihre acht Felder tragen jetzt Vitrinen für die neuen
      // Ladentypen. Alles gezeichnet, alles erfunden.
      drawDisplay(g,i-24);
    }
    g.restore();
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;
  texture.name='Original city shop and billboard atlas';return texture;
}

/**
 * Vitrinen der Ladentypen aus Neo-Tokio v2, je 256 × 128 px (Feld 24…31).
 *
 * 0 Konbini — kalt-weiß, Regalreihen voller bunter Packungen, Deckenlicht.
 * 1 Kameraladen — Glasböden mit Kameras und Rahmen (ref/web/23).
 * 2 Drogerie — gestapelte Schachteln, gelbe Preisschilder.
 * 3 Mode — drei Puppen unter Spots, heller Boden.
 * 4 Makler — ein Fenster voller Wohnungszettel.
 * 5 Rollladen — zu, Lamellen, etwas Schmutz.
 * 6 Spielhalle — Automatenreihe mit leuchtenden Schirmen.
 * 7 Izakaya — Holztresen, Flaschenregal, warmes Licht.
 */
function drawDisplay(g:CanvasRenderingContext2D,kind:number):void{
  const rect=(x:number,y:number,w:number,h:number,c:string)=>{g.fillStyle=c;g.fillRect(x,y,w,h);};
  const pal=['#e24a4a','#f2c200','#2a8fd8','#4cb050','#ff8a2a','#d96ad0','#ffffff','#1d8a4a'];
  if(kind===0){
    rect(12,12,232,104,'#eef3f7');
    for(let x=24;x<236;x+=52)rect(x,14,30,4,'#ffffff');
    for(let row=0;row<4;row++){
      rect(18,34+row*20,220,3,'#c9d2d8');
      for(let j=0;j<22;j++)rect(20+j*10,24+row*20,7,10,pal[(j*5+row*3)%pal.length]!);
    }
    rect(18,108,220,6,'#b8c2c8');
  }else if(kind===1){
    rect(12,12,232,104,'#f4f2ec');
    for(let row=0;row<3;row++){
      rect(18,44+row*28,220,3,'#b9c4c8');
      for(let j=0;j<9;j++){
        const x=22+j*24;
        if((j+row)%3===0){rect(x,26+row*28,18,16,'#1c1d20');g.fillStyle='#4a5a66';g.beginPath();g.arc(x+9,34+row*28,5,0,Math.PI*2);g.fill();}
        else{rect(x,24+row*28,16,19,'#8a6a4a');rect(x+2,26+row*28,12,15,pal[(j+row)%pal.length]!);}
      }
    }
    rect(170,14,64,14,'#c8102e');g.fillStyle='#fff';g.font='bold 10px sans-serif';g.textAlign='center';g.fillText('SALE',202,25);
  }else if(kind===2){
    rect(12,12,232,104,'#fffbe8');
    for(let row=0;row<5;row++)for(let j=0;j<14;j++){
      rect(16+j*16,18+row*19,14,16,pal[(j*3+row*5+1)%pal.length]!);
      if((j+row)%4===0)rect(16+j*16,30+row*19,14,4,'#f2c200');
    }
  }else if(kind===3){
    rect(12,12,232,104,'#e9e4dc');
    rect(12,96,232,20,'#b9ada0');
    for(let j=0;j<3;j++){
      const x=52+j*76;
      g.fillStyle='rgba(255,244,220,.55)';g.beginPath();g.moveTo(x-6,12);g.lineTo(x+6,12);g.lineTo(x+26,96);g.lineTo(x-26,96);g.fill();
      rect(x-2,28,4,8,'#3a3a3a');g.fillStyle='#d8cfc4';g.beginPath();g.arc(x,24,6,0,Math.PI*2);g.fill();
      rect(x-12,36,24,34,pal[(j*2+3)%pal.length]!);rect(x-10,70,8,24,'#2b2b2b');rect(x+2,70,8,24,'#2b2b2b');
    }
  }else if(kind===4){
    rect(12,12,232,104,'#dfe6ee');
    for(let row=0;row<3;row++)for(let j=0;j<7;j++){
      const x=18+j*32,y=18+row*32;
      rect(x,y,28,28,'#ffffff');rect(x,y,28,6,['#2a62c9','#c8102e','#1d8a4a'][(j+row)%3]!);
      for(let k=0;k<3;k++)rect(x+3,y+10+k*5,18-k*4,2,'#9aa4ae');
    }
  }else if(kind===5){
    const grad=g.createLinearGradient(0,12,0,116);grad.addColorStop(0,'#8e969b');grad.addColorStop(1,'#6a7176');g.fillStyle=grad;g.fillRect(12,12,232,104);
    for(let y=16;y<116;y+=6)rect(12,y,232,1.5,'#5a6166');
    g.fillStyle='rgba(40,34,30,.25)';g.fillRect(12,92,232,24);
    rect(112,100,32,6,'#c9ccc9');
  }else if(kind===6){
    rect(12,12,232,104,'#15121e');
    for(let j=0;j<8;j++){
      const x=18+j*28;
      rect(x,24,22,82,'#2c2640');rect(x+3,30,16,22,pal[(j*3)%pal.length]!);
      g.fillStyle='#ffe07a';g.beginPath();g.arc(x+11,66,5,0,Math.PI*2);g.fill();
      rect(x+2,82,18,4,'#ff5ad2');
    }
    rect(12,12,232,6,'#ff5ad2');
  }else{
    const grad=g.createLinearGradient(0,12,0,116);grad.addColorStop(0,'#f6c98a');grad.addColorStop(1,'#5a3422');g.fillStyle=grad;g.fillRect(12,12,232,104);
    for(let row=0;row<2;row++){rect(20,28+row*22,216,3,'#6a4430');for(let j=0;j<26;j++)rect(22+j*8,16+row*22,5,12,['#2f5a3a','#8a4a2a','#e8e0c9','#3a2a20'][(j+row)%4]!);}
    rect(12,78,232,10,'#8a5a3a');rect(12,88,232,28,'#3a2418');
    for(let j=0;j<6;j++){rect(26+j*38,92,14,20,'#1c120c');}
    for(const x of [60,128,196]){g.fillStyle='#ffd08a';g.beginPath();g.arc(x,18,5,0,Math.PI*2);g.fill();}
  }
}
