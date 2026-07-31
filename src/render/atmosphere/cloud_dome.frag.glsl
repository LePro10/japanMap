precision highp float;

uniform sampler2D uCloudMap;
uniform sampler2D uSkyLut;
uniform float uTime;
/** x = Höhe der Schicht, y = Deckung, z = Weichheit, w = Deckkraft. */
uniform vec4 uCloudDome;
/** xy = Kantenlänge beider Lagen, zw = Geschwindigkeit. */
uniform vec4 uCloudTile;
uniform vec2 uCloudDirection;
/** x = fadeStart, y = fadeEnd. */
uniform vec2 uCloudFade;
uniform vec3 uCameraWorld;

varying vec3 vDirection;

const float PI2 = 6.283185307179586;
const float PI_ = 3.141592653589793;

/** Gleiche Konvention wie `equirectUv` in three — sonst steht die Farbe schief. */
vec2 domeEquirectUv(vec3 d) {
  return vec2(atan(d.z, d.x) / PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / PI_ + 0.5);
}

void main() {
  vec3 d = normalize(vDirection);

  // Unter dem Horizont gibt es keine Wolkenschicht: die Projektion würde nach
  // hinten schneiden und das Feld gespiegelt in den Boden legen.
  if (d.y <= uCloudFade.x) discard;

  // Schnittpunkt des Blickstrahls mit der waagerechten Schicht. Genau das
  // macht aus einer gekachelten Textur eine Wolkendecke: die Kacheln laufen
  // zum Horizont hin zusammen, weil t mit 1/d.y wächst.
  float t = (uCloudDome.x - uCameraWorld.y) / d.y;
  vec2 hit = uCameraWorld.xz + d.xz * t;

  vec2 drift = uCloudDirection * uTime;
  vec2 uvA = (hit + drift * uCloudTile.z) / uCloudTile.x;
  vec2 uvB = (hit + drift * uCloudTile.w) / uCloudTile.y;

  // Geometrisches Mittel, aus demselben Grund wie beim Bodenschatten: das
  // reine Produkt zweier auf 0..1 gestreckter Lagen hat den Mittelwert 0,25,
  // und die Schwelle bedeutete dann etwas anderes, als sie sagt.
  float noise = sqrt(texture2D(uCloudMap, uvA).r * texture2D(uCloudMap, uvB).r);

  float cover = smoothstep(
    uCloudDome.y - uCloudDome.z, uCloudDome.y + uCloudDome.z, noise
  );

  // Zum Horizont hin ausblenden. Ohne das deckt eine Kachel dort beliebig
  // viele Pixel ab, und aus Wolken wird ein waagerechter Streifen.
  float horizon = smoothstep(uCloudFade.x, uCloudFade.y, d.y);

  float alpha = cover * horizon * uCloudDome.w;
  if (alpha < 0.004) discard;

  // **Die Farbe kommt aus dem Himmel selbst, nicht aus einer Konstanten.**
  // Die LUT ist dasselbe heruntergerechnete Panorama, aus dem der Nebel seine
  // Farbe liest (P2 / 2.2). Damit passt die Wolke bei jeder Änderung am
  // Himmels-HDRI automatisch mit — ein fest eingetragenes Weiß stünde nach dem
  // ersten Wechsel der Tageszeit falsch im Bild.
  vec3 sky = texture2D(uSkyLut, domeEquirectUv(d)).rgb;

  // Etwas heller als der Himmel dahinter: eine Wolkenunterseite bei tiefer
  // Sonne fängt Streulicht, das der klare Himmel in dieser Richtung nicht hat.
  gl_FragColor = vec4(sky * 1.18, alpha);
}
