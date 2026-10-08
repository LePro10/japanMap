// Resolver for running the prototype's TypeScript unchanged in Node (Tools/export-places.mjs):
// `@/…` → <LEGACY_SRC>/…, imports without extension get .ts/.mts/.mjs/.js. Unlike the legacy
// bench loader it also takes `@/…` with an extension (`@/config/tokyoLayout.mjs`).
import { register } from 'node:module';
register('./alias-loader.mjs', import.meta.url);
