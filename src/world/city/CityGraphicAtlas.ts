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
      const ad=i-24;const gradient=g.createLinearGradient(0,0,256,128);gradient.addColorStop(0,['#dc6359','#1f8aab','#72559f','#c89f5a'][ad%4]!);gradient.addColorStop(1,'#142733');g.fillStyle=gradient;g.fillRect(10,10,236,108);
      g.strokeStyle='#eedcba';g.lineWidth=2;
      // Original graphic subjects: mountain sun, record, cup and stylised blossom.
      g.beginPath();g.arc(194,43,23,0,Math.PI*2);g.stroke();
      for(let k=0;k<4;k++){g.beginPath();g.moveTo(129+k*12,108);g.lineTo(168+k*8,55+k*4);g.lineTo(244,109);g.stroke();}
      g.fillStyle='#fff0d2';g.textAlign='left';g.font='bold 24px sans-serif';g.fillText(['MIDNIGHT','AFTER','TOKYO','SLOW'][ad%4]!,20,43);
      g.font='bold 19px sans-serif';g.fillText(['DRIVE CLUB','HOURS','REVERIE','MOMENTS'][ad%4]!,20,69);
      g.font='10px sans-serif';g.fillText('NEON BASIN  /  FIND YOUR WAY',20,102);
    }
    g.restore();
  }
  const texture=new CanvasTexture(canvas);texture.colorSpace=SRGBColorSpace;texture.anisotropy=4;
  texture.name='Original city shop and billboard atlas';return texture;
}
