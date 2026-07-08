# AGENTS.md

Build: `npm run build` = `tsc -b && vite build` — typecheck runs first. Typecheck errors block the build.

Dev: `npm run dev` → `http://localhost:5173`

## Project structure

- `src/parser.ts` — pure parsing + TSV generation logic, no React dependency. The file to test in isolation.
- `src/App.tsx` — main UI component, also contains PDF/RTF file reader helpers.
- `src/main.tsx` — React entrypoint (`ReactDOM.createRoot`).
- `src/App.css` — all styling, no other CSS.

## Conventions

- UI is entirely in **Italian** (labels, placeholders, error messages, comments).
- `index.html` uses `<html lang="it">`.
- `tsconfig.json` has `noUnusedLocals: false` and `noUnusedParameters: false` — unused imports/vars will NOT cause typecheck errors.

## Testing

- `npm test` = `vitest run` — esegue tutti i test su `src/parser.test.ts` (106 test).
- **Prima di ogni push è obbligatorio eseguire `npm test` e verificare che tutti i test passino.**
- `src/parser.ts` è puro codice senza dipendenze da React, testato con Vitest.

## Notable deps

- `pdfjs-dist` (lazy-imported in `App.tsx`, worker loaded via `pdfjs-dist/build/pdf.worker.min.mjs`).

## Commit conventions

- `feat`: nuova funzionalità
- `fix`: riparazione bug
- `chore`: refactoring o modifiche al codice non complesso
- I messaggi di commit devono essere sempre in **inglese**.
