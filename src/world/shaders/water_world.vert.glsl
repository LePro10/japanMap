// Wird nach <begin_vertex> eingesetzt.
//
// Die Wasserebene folgt der Kamera (siehe WaterSystem), Objekt- und Weltraum
// sind hier also **nicht** dasselbe. Die Weltposition muss deshalb über die
// modelMatrix laufen — sonst wanderten Wellen und Küstenlinie mit der Kamera
// mit, statt im Wasser stehen zu bleiben.

vWaterWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;

// Weltnormale der Fläche. Für das Meer ist das (0,1,0); der Fluss braucht sie,
// weil sein Band mit dem Bett kippt und an einer Stufe fast senkrecht steht.
vWaterSurfaceN = normalize(mat3(modelMatrix) * objectNormal);
