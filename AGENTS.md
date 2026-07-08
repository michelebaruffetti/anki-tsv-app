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

No test framework is configured. `src/parser.ts` is designed for isolated unit testing but has no tests yet.

## Notable deps

- `pdfjs-dist` (lazy-imported in `App.tsx`, worker loaded via `pdfjs-dist/build/pdf.worker.min.mjs`).
