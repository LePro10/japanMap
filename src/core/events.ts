import type { PropPlacement } from '@/config/props.config';
import type { QualityKey } from '@/config/quality.config';
import type { LookState } from '@/render/looks/lookState';
import type { CityCollider, CityCurb, SignAnchor } from '@/world/city/CityGenerator';
import type { CityUniforms } from '@/world/materials/FacadeMaterial';
import type { RoadMaterial } from '@/world/materials/RoadMaterial';
import type { TerrainHeightUniforms } from '@/world/materials/TerrainMaterial';
import type { PropClearance } from '@/world/props/PropClearance';
import type { RoadNetwork } from '@/world/roads/RoadNetwork';
import type { TerrainSampler } from '@/world/TerrainSampler';
import type { EventBus } from './EventBus';

/**
 * Alle Ereignisse des Projekts an einer Stelle. Neue Ereignisse kommen hier
 * dazu — dann zeigt die Typprüfung sofort, wer sie sendet und wer sie hört.
 *
 * Bewusst `type` und nicht `interface`: nur Typ-Aliase bekommen in TypeScript
 * eine implizite Index-Signatur und erfüllen damit `Record<string, unknown>`,
 * die Schranke von EventBus. Ein Interface hier führt zu einem Fehler, dessen
 * Ursache nicht offensichtlich ist.
 */
export type AppEvents = {
  /** Canvas hat eine neue Pixelgröße bekommen (Fenster, Layout oder DPI). */
  'engine:resize': { width: number; height: number; pixelRatio: number };

  /**
   * WebGL-Kontext verloren. Alles auf der GPU ist ab hier ungültig; der
   * Browser stellt ihn oft von selbst wieder her (Treiber-Reset, Tab-Wechsel).
   */
  'engine:contextlost': void;
  'engine:contextrestored': void;

  'engine:disposed': void;

  /**
   * Der Aufwärmframe ist durch, alle Shader stehen (P7 / 7.4).
   *
   * Wer eine Einstellung hat, die die Menge der benötigten Programme
   * **verkleinert**, wendet sie erst hier an — sonst übersetzt der Aufwärmframe
   * nur einen Teil, und der Rest kommt später als Ruckler. Genau das tut die
   * Qualitätsstufe: auf „Niedrig" entfällt der Spiegeldurchgang, und mit ihm
   * fünf Programme.
   */
  'engine:warmedup': void;

  /** Fortschritt des ResourceManagers — Detailzeile des Ladebildschirms. */
  'resources:progress': { loaded: number; total: number; url: string };
  'resources:error': { url: string; error: unknown };

  /**
   * Fortschritt des Hochfahrens — der Balken des Ladebildschirms (P7 / 7.3).
   *
   * **Nicht** aus `resources:progress` gebildet. Dessen `total` wächst, während
   * geladen wird: jedes System fordert seine Dateien erst an, wenn es dran ist.
   * Ein Balken darauf liefe rückwärts, und ein Balken, der rückwärts läuft, ist
   * schlimmer als eine Zahl ohne Balken.
   *
   * Die Systeme dagegen stehen von Anfang an fest und werden der Reihe nach
   * initialisiert. `step / total` ist damit echt und monoton — genau das, was
   * PLAN.md mit „echter Fortschritt, keine gefälschte Animation" meint.
   */
  'engine:loading': { step: number; total: number; label: string };

  /**
   * Das gebackene Terrain ist geladen und geprüft.
   *
   * Trägt den Sampler mit: Kamera-Kollision (P1), Straßen-Carving (P3) und
   * Vegetations-Streuung (P4) brauchen ihn, sollen aber nicht auf das
   * TerrainSystem zugreifen. Dazu die Höhen-Uniforms, mit denen das Wasser die
   * Küstenlinie im Shader ausliest (P2 / 2.4) — dieselben Objekte, damit der
   * Höhen-Regler beide zugleich verstellt.
   *
   * Wer darauf hört, muss sich **vor** `Engine.init()` anmelden und deshalb
   * **vor** dem TerrainSystem registriert sein: das Ereignis wird genau einmal
   * gesendet, während das Terrain initialisiert wird.
   */
  'terrain:ready': { sampler: TerrainSampler; height: TerrainHeightUniforms };

  /**
   * Das Straßennetz ist geladen und die Abfragestruktur steht.
   *
   * Trägt das Netz mit, weil die Vegetations-Streuung (P4 / 4.2) für jeden
   * Kandidaten `distanceToNearestRoad()` braucht — und zwar ohne das
   * RoadSystem zu importieren. Dieselbe Regel wie bei `terrain:ready`: wer
   * zuhört, muss **vor** dem RoadSystem registriert sein.
   */
  /**
   * Trägt zusätzlich das **Belagsmaterial** mit.
   *
   * Seit P6 gibt es zwei Flächen aus Asphalt: das Straßennetz und die
   * Bodenplatte der Stadt. Sie stoßen im Distrikt aneinander, und die Nässe aus
   * 6.4 läuft über einen gemeinsamen Uniform-Block — zwei Materialien hießen
   * zwei Regler für dieselbe Pfütze und an der Bordsteinkante eine sichtbare
   * Kante. Deshalb reicht das RoadSystem sein Material weiter, statt dass jeder
   * sich eines baut.
   */
  'roads:ready': { network: RoadNetwork; surface: RoadMaterial };

  /**
   * Die Props stehen, und mit ihnen die Flächen, die sie freihalten.
   *
   * Die Streuung aus P4 muss davon wissen, sonst wachsen Bäume durch die
   * Tempelhalle — dieselbe Regel wie bei den Straßen, nur mit Kreisen statt
   * einer Achse. Dieselbe Reihenfolgenbedingung gilt auch: wer zuhört, muss
   * **vor** dem PropSystem registriert sein.
   */
  /**
   * **Trägt seit P14 zusätzlich die Platzierungen.** Das Fahrmodell braucht
   * Hindernisse, und ein Prop ist eines. Es sind dieselben Einträge, aus denen
   * die Freihaltekreise entstehen — aber nicht dieselben *Kreise*:
   * `PROP_CLEARANCE` enthält den Vorplatz („18 m lassen einen Hof frei"),
   * `PROP_COLLIDERS` den Bauwerksradius. Wer die Freihaltekreise als Kollision
   * benutzt, stößt gegen den Hof.
   */
  'props:ready': { clearance: PropClearance; placements: readonly PropPlacement[] };

  /**
   * Die Stadt steht — mit ihr die Wandflächen, an die Neonschilder gehören.
   *
   * Anders als bei Terrain und Straßen ist die Reihenfolge hier **nicht**
   * kritisch: das NeonSystem baut erst auf dieses Ereignis hin und hat vorher
   * nichts zu tun. Es trägt trotzdem denselben Namen wie die anderen, weil es
   * dieselbe Rolle spielt — „ab jetzt gibt es das".
   */
  /**
   * **Trägt seit P14 die Kollisionskästen mit.** Sie entstehen im Generator und
   * können nachträglich nicht mehr aus der Szene gelesen werden: die Häuser eines
   * Blocks sind zu einer Geometrie zusammengeführt, und darin gibt es keine
   * Objektgrenzen. Begründung bei `CityCollider`.
   */
  'city:ready': {
    signs: readonly SignAnchor[];
    uniforms: CityUniforms;
    colliders: readonly CityCollider[];
    curbs: readonly CityCurb[];
  };

  /**
   * Look-Presets (PLAN.md P2 / 2.6). Zwei Richtungen, bewusst getrennt:
   *
   *  - `look:apply` verteilt einen geladenen Zustand an alle Systeme.
   *  - `look:collect` sammelt ihn wieder ein. Der Sender legt ein vorbefülltes
   *    Objekt bei, jedes System überschreibt darin nur seinen eigenen Abschnitt.
   *
   * So kennt der LookController keines der Systeme, und ein neues System bringt
   * seinen Anteil am Look selbst mit.
   */
  'look:apply': { look: LookState };
  'look:collect': { target: LookState };

  'quality:changed': { level: QualityKey };

  /**
   * Fahrmodus an oder aus — P14.
   *
   * Der Zustand selbst wohnt im `DriveSystem`; dieses Ereignis ist für die
   * Oberfläche. Sie darf ihn nicht von der Taste ableiten: `V`, der Knopf im
   * Debug-Panel und `japanMap.drive()` schalten dasselbe um, und ein Menü, das
   * seinen eigenen letzten Klick anzeigt statt den Zustand, ist die Anzeige, die
   * lügt — dieselbe Begründung wie bei `quality:changed`.
   */
  'drive:mode': { active: boolean };

  'debug:visibility': { visible: boolean };
};

export type AppBus = EventBus<AppEvents>;
