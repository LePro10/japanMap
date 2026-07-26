// Wird direkt nach <begin_vertex> eingesetzt.
//
// Das Gitter liegt bereits in der XZ-Ebene (die Rotation ist in die Geometrie
// gebacken) und das Mesh steht im Ursprung ohne Transformation — Objektraum
// und Weltraum sind hier also dasselbe. `transformed.xz` sind damit direkt
// Weltkoordinaten.
//
// Die Verschiebung passiert vor <project_vertex> und vor <worldpos_vertex>.
// Damit rechnen Projektion *und* Schattenwurf mit derselben verschobenen
// Position — täte nur eine von beiden es, läge der Schatten neben dem Berg.

transformed.y += terrainHeight(transformed.xz) * uHeightScale;
vTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
