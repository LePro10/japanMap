// Bodenverdeckung, Fragment-Anteil.
//
// Ausgegeben wird **kein Farbwert, sondern ein Faktor**: das Material mischt
// multiplikativ (Zero / SrcColor), `gl_FragColor.rgb` ist also der Wert, mit
// dem das darunterliegende Bild multipliziert wird. 1 heißt unverändert.
//
// Dass sich überlappende Flecken dabei aufmultiplizieren, ist erwünscht und
// nicht bloß hingenommen: im dichten Bestand wird der Boden dadurch von selbst
// dunkler als unter einem einzeln stehenden Baum. Genau diese Abstufung wäre
// mit einer gebackenen Karte nicht zu haben, weil die Streudichte an der
// Qualitätsstufe hängt.

uniform float uAoFloor;
uniform float uAoCore;
uniform float uAoStrength;
/** x = Beginn, y = Ende des Ausblendens mit der Entfernung, in Metern. */
uniform vec2 uAoFade;

varying float vAoRadial;
varying float vAoStrength;
varying float vAoDistance;

void main() {
  float weight = 1.0 - smoothstep(uAoCore, 1.0, clamp(vAoRadial, 0.0, 1.0));
  // Quadriert: der lineare Abfall von smoothstep hinterlässt einen sichtbaren
  // Rand, an dem der Fleck aufhört. Quadriert läuft er weich aus.
  weight *= weight;
  weight *= 1.0 - smoothstep(uAoFade.x, uAoFade.y, vAoDistance);
  weight *= vAoStrength * uAoStrength;

  // Unter einem Promille ist der Fleck unsichtbar. Das ist bei einem
  // bildschirmfüllenden Saum aus 600 überlappenden Quads der Großteil der
  // Fragmente — und ein `discard` ist billiger als eine Mischoperation.
  if (weight <= 0.001) discard;

  gl_FragColor = vec4(vec3(mix(1.0, uAoFloor, weight)), 1.0);
}
