import propsUrl from '../../../assets/props.json?url';
import manifestUrl from '../../../assets/generated/models/manifest.json?url';

/**
 * Asset-URLs der Props — dieselbe Regel wie in `terrainAssets.ts`.
 *
 * Alles über Vites `?url`-Import statt über einen `public/`-Ordner: die Dateien
 * bekommen dadurch einen Inhalts-Hash, landen im Build-Manifest, und ein
 * Tippfehler im Pfad fällt beim Bauen auf statt im Browser mit einem 404.
 *
 * Die Modelldateien stehen erst zur Laufzeit fest — welche es gibt, sagt
 * `manifest.json`, und das erzeugt `tools/process-assets.mjs`. Ein statischer
 * Import je Datei scheidet damit aus. `import.meta.glob` löst das zur Bauzeit
 * auf: Vite trägt jede passende Datei ins Bundle ein, und `modelUrl()` sucht
 * darin nach dem Namen aus dem Manifest.
 */
const models = import.meta.glob('../../../assets/generated/models/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const PROP_ASSETS = {
  placements: propsUrl,
  manifest: manifestUrl,
} as const;

/** Eine Stufe aus dem Modell-Manifest. */
export interface ModelStage {
  readonly datei: string;
  readonly dreiecke: number;
  readonly bytes: number;
}

export interface ModelEntry {
  readonly quelle: string;
  readonly material: string;
  readonly dreieckeQuelle: number;
  /** Hüllbox in Metern nach der Normalisierung. */
  readonly groesse: readonly [number, number, number];
  /** Größter waagerechter Abstand vom Pivot. */
  readonly radius: number;
  readonly stufen: readonly ModelStage[];
}

export interface ModelManifest {
  readonly version: number;
  readonly assets: Readonly<Record<string, ModelEntry>>;
}

/**
 * Gebündelte URL zu einem Dateinamen aus dem Manifest.
 *
 * Wirft, statt `undefined` zurückzugeben: ein fehlendes Modell heißt, dass
 * `npm run models` nicht gelaufen ist, und das ist eine Frage an den
 * Entwickler, keine Laufzeitbedingung.
 */
export function modelUrl(file: string): string {
  for (const [path, url] of Object.entries(models)) {
    if (path.endsWith(`/${file}`)) return url;
  }
  throw new Error(
    `Modell „${file}" liegt nicht in assets/generated/models. Fehlt „npm run models"?`,
  );
}
