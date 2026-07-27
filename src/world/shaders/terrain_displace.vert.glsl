// Wird direkt nach <begin_vertex> eingesetzt — PLAN.md P4 / 4.1.
//
// Die Geometrie ist ein **Einheitsgitter**: `position.xz` läuft von 0 bis 1,
// `position.y` ist null. Erst die Instanzattribute machen daraus einen Knoten
// an einem Ort. Ein Geometrie-Objekt für das gesamte Terrain, ein Draw-Call für
// alle Knoten — das ist der ganze Sinn der Übung.
//
// Die Verschiebung passiert vor <project_vertex> und vor <worldpos_vertex>.
// Damit rechnen Projektion *und* Schattenwurf mit derselben verschobenen
// Position — täte nur eine von beiden es, läge der Schatten neben dem Berg.

vec2 lodGrid = position.xz;
vec2 lodWorld = aNodeOrigin + lodGrid * aNodeSize;

// **Erste Höhenabfrage nur für die Entfernung.** Der Morph-Faktor hängt vom
// Abstand zur Kamera ab, der Abstand von der Höhe, und die Höhe wieder von der
// gemorphten Position — eine Schleife. Aufgelöst wird sie wie in Strugars
// Originalarbeit: die Entfernung wird an der *ungemorphten* Stelle genommen.
// Der Fehler daraus ist höchstens eine Gitterweite und damit weit unter der
// Breite des Morph-Bereichs; der Preis sind vier zusätzliche texelFetch.
float lodHeight = terrainSurface(lodWorld);
float lodDistance = distance(uLodCamera, vec3(lodWorld.x, lodHeight, lodWorld.y));
float lodMorph = clamp((lodDistance - aNodeMorph.x) * aNodeMorph.y, 0.0, 1.0);

// Ungerade Stützstellen wandern auf ihren geraden Nachbarn zu. Bei
// vollständigem Morph (1.0) hat das Gitter effektiv den halben Detailgrad und
// deckt sich exakt mit dem ungemorphten Gitter der nächstgröberen Stufe — das
// ist der Grund, warum CDLOD ohne Skirts risslos ist.
//
// `fract(g · 16) · (2/32)`: gerade Stützstellen ergeben 0 und bleiben stehen,
// ungerade ergeben 0,5 und werden um genau eine Gitterweite zurückgezogen. Die
// Ränder (g = 0 und g = 1) sind gerade und bewegen sich nie — sonst rissen die
// Knoten an genau der Naht auf, die das Verfahren schließen soll.
vec2 lodFrac = fract(lodGrid * (uLodGridQuads * 0.5)) * (2.0 / uLodGridQuads);
lodWorld = aNodeOrigin + (lodGrid - lodFrac * lodMorph) * aNodeSize;

transformed = vec3(lodWorld.x, terrainSurface(lodWorld), lodWorld.y);
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
vLodLevel = aNodeLevel;
vLodMorph = lodMorph;
