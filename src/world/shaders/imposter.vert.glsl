// Imposter-Vertex — PLAN.md P4 / 4.4. Wird nach <begin_vertex> eingesetzt.
//
// Das Quad wird **zylindrisch** ausgerichtet: seine Y-Achse bleibt die Weltachse
// nach oben, nur die X-Achse dreht sich zur Kamera. Ein voll kameraorientiertes
// Quad wäre die naheliegende Wahl und ist bei Blick von oben falsch — der Baum
// kippt dann mit, legt sich in den Hang und hebt seinen Fuß in die Luft. Die
// Neigung des Blicks steckt stattdessen in der Wahl der Atlas-Zelle; genau
// dafür ist die oktaedrische Abbildung da.
//
// Gerechnet wird im **Modellraum der Instanz**, nicht im Weltraum: dadurch
// bleibt die gesamte Kette von Three.js (`instanceMatrix`, `project_vertex`,
// Schattenwurf, `worldpos_vertex`) unangetastet. Die Umrechnung ist billig,
// weil die Instanz ausschließlich um Y gedreht und uniform skaliert ist.
//
// `position.x` läuft von −0,5 bis 0,5, `position.y` von 0 bis 1 — der Fuß liegt
// damit auf dem Instanzursprung, also auf dem Gelände.

float impScale = length(instanceMatrix[1].xyz);
vec3 impAxisX = instanceMatrix[0].xyz / impScale;
vec3 impAxisZ = instanceMatrix[2].xyz / impScale;

vec3 impOrigin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
vec3 impToCamera = cameraPosition - impOrigin;

// Waagerechte Blickrichtung. Steht die Kamera genau über dem Baum, ist sie
// null — dann bleibt eine feste Achse stehen, statt über normalize(0) eine
// NaN-Wolke zu erzeugen.
float impFlatLength = length(impToCamera.xz);
vec2 impForward = impFlatLength > 1e-4 ? impToCamera.xz / impFlatLength : vec2(0.0, 1.0);
vec3 impRightWorld = vec3(impForward.y, 0.0, -impForward.x);
vec3 impRightLocal = vec3(dot(impRightWorld, impAxisX), 0.0, dot(impRightWorld, impAxisZ));

float impY = uImposterSize.y + position.y * uImposterSize.x;

transformed = impRightLocal * (position.x * uImposterSize.x) + vec3(0.0, impY, 0.0);

vImposterQuad = vec2(position.x + 0.5, position.y);
vImposterWorld =
    impOrigin +
    impRightWorld * (position.x * uImposterSize.x * impScale) +
    vec3(0.0, impY * impScale, 0.0);

vec3 impDir = normalize(impToCamera);
vImposterLocalView = normalize(vec3(dot(impDir, impAxisX), max(impDir.y, 0.0), dot(impDir, impAxisZ)));
vImposterRot = vec2(impAxisX.x, impAxisZ.x);
// **Derselbe Hash aus derselben Position wie beim Mesh.** Ohne ihn ist jeder
// ferne Baum gleich gefärbt, während die nahen streuen — und der Wechsel von
// Stufe 1 auf Stufe 2 wird als Farbsprung sichtbar, nicht als Formwechsel.
vImposterTint = vegetationTintHash(impOrigin.xz);
