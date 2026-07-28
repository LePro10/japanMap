// Imposter-Fragment — PLAN.md P4 / 4.4. Ersetzt <map_fragment>.
//
// **Zwei Atlas-Abfragen, nicht vier.** Der Plan verlangt „mischt zwischen den
// zwei nächsten Ansichten", und das ist auch die richtige Zahl: bei 8 × 8 auf
// der Halbkugel liegen rund 22° zwischen zwei Nachbaransichten, und die
// Mischung entlang der *stärker* angebrochenen Achse halbiert den Winkelfehler.
// Bilinear über alle vier Nachbarn wäre der doppelte Aufwand für die zweite
// Hälfte eines Fehlers, den man bei 180 m Entfernung — dort übernimmt der
// Imposter — nicht sieht. Genau in der Zellenmitte setzt die Mischung aus, und
// dort ist die Ansicht exakt.
//
// **Alpha wird mitgemischt und danach geprüft**, nicht umgekehrt. Zwei
// freigestellte Bilder je einzeln zu prüfen und dann zu mischen ergäbe an jeder
// Silhouette eine harte Kante, die zwischen den Ansichten springt.

vec2 impGrid = octEncodeHemi(vImposterLocalView) * uImposterTiles - 0.5;
vec2 impBase = floor(impGrid);
vec2 impFrac = impGrid - impBase;

bool impAlongX = abs(impFrac.x - 0.5) > abs(impFrac.y - 0.5);
vec2 impStep = impAlongX ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
vec2 impCellA =
    impBase + (impAlongX ? vec2(0.0, floor(impFrac.y + 0.5)) : vec2(floor(impFrac.x + 0.5), 0.0));
vec2 impCellB = impCellA + impStep;
float impBlend = impAlongX ? impFrac.x : impFrac.y;

vec2 impUvA = imposterTileUv(impCellA, vImposterQuad);
vec2 impUvB = imposterTileUv(impCellB, vImposterQuad);

vec4 impA = texture2D(uImposterAlbedo, impUvA);
vec4 impB = texture2D(uImposterAlbedo, impUvB);
vec4 impAlbedo = mix(impA, impB, impBlend);
if (impAlbedo.a < uImposterAlphaTest) discard;

diffuseColor.rgb *= impAlbedo.rgb * vegetationTint(vImposterTint);

vec3 impNa = texture2D(uImposterNormal, impUvA).xyz * 2.0 - 1.0;
vec3 impNb = texture2D(uImposterNormal, impUvB).xyz * 2.0 - 1.0;
vec3 impN = normalize(mix(impNa, impNb, impBlend) + vec3(0.0, 1e-4, 0.0));

// Zurück in den Weltraum. Die gebackene Normale steht im **Modellraum** der
// Instanz, und die Instanz ist ausschließlich um Y gedreht — es genügt also, X
// und Z mitzudrehen und Y stehen zu lassen. Sinus und Kosinus kommen als
// Varying aus dem Vertex-Shader; die Instanzmatrix ist hier nicht verfügbar.
gImposterNormal = normalize(vec3(
    impN.x * vImposterRot.x + impN.z * vImposterRot.y,
    impN.y,
    -impN.x * vImposterRot.y + impN.z * vImposterRot.x));
