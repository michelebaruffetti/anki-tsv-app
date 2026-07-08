# Session Handoff

## Objective
Analizzare `src/parser.ts` per valutare la necessità di test automatici, elencare i casi di test e definire lo strumento da integrare.

## Current State
- Sessione conclusa con analisi completata
- `AGENTS.md` è stato aggiornato due volte: prima con convenzioni del progetto, poi con convenzioni di commit
- Commit e push eseguiti con successo:
  - `d4abfd6` — update AGENTS.md: add conventions, structure details, and notable deps
  - `82523fd` — chore: add commit conventions section to AGENTS.md
- Analisi di `parser.ts` completata: è puro codice senza dipendenze da React/DOM, ideale per testing

## Architecture Context
- **Stack:** React 18 + TypeScript 5.5 + Vite 5
- **Build:** `tsc -b && vite build`
- **Struttura:**
  - `src/parser.ts` — logica pura di parsing e generazione TSV (6 funzioni esportate)
  - `src/App.tsx` — UI principale, lettori PDF/RTF
  - `src/main.tsx` — entrypoint React
  - `src/App.css` — stili
- **Nessun framework di test configurato**
- **Convenzioni commit:** feat/fix/chore, messaggi in inglese (documentati in `AGENTS.md`)

## Key Files
- `src/parser.ts` — 546 righe, cuore logico dell'app. Funzioni esportate:
  - `parseInput(rawText, capitolo)` — parser principale domande multi-riga e mono-riga
  - `parseAnswersFile(content)` — parser file risposte (formato testo e PDF)
  - `injectGiustaFromAnswers(rawText, answerMap)` — inserisce marker (giusta) sulle opzioni corrette
  - `buildRow(q)` — genera una riga TSV da una domanda
  - `buildTSV(questions, includeBlockingErrors)` — genera TSV completo
  - Funzioni interne: `sanitizeCell`, `snippetOf`, `extractNumber`, `trySingleLineQuestion`, `evaluateOptions`, `_norm`
- `AGENTS.md` — convenzioni del progetto (da leggere all'inizio di ogni sessione)
- `package.json` — dipendenze: `pdfjs-dist`, `react`, `react-dom`; devDeps: `vite`, `typescript`, `@vitejs/plugin-react`

## Decisions Made
- **Strumento di test:** Vitest — standard per progetti Vite, zero configurazione
- **Posizione test:** `src/parser.test.ts` (singolo file)
- **Scope:** ~30-40 test case distribuiti su tutte le 6 funzioni esportate + funzioni interne
- **Convenzioni commit salvate in AGENTS.md** (feat/fix/chore, messaggi in inglese)

## Open Problems
- Nessun test è stato implementato — l'analisi è solo pianificatoria
- Vitest non è ancora installato (`npm install -D vitest` da eseguire)
- File di test `src/parser.test.ts` da creare

## Completed Work
- [x] Verifica AGENTS.md contro stato reale del progetto
- [x] Commit e push di AGENTS.md aggiornato (convenzioni + struttura)
- [x] Aggiunta sezione "Commit conventions" in AGENTS.md
- [x] Analisi completa di `parser.ts` con elenco test case dettagliato
- [x] Scelta di Vitest come framework di test
- [x] ~30-40 casi di test documentati per 6 funzioni + funzioni interne

## Next Steps
1. `npm install -D vitest` — installare Vitest come devDependency
2. Aggiungere `"test": "vitest run"` in `package.json` scripts
3. Creare `src/parser.test.ts` con i ~30-40 test case elencati
4. Eseguire `npm test` per verificare che tutti i test passino
5. Commit e push del risultato

## Risks / Notes
- `parseInput` è la funzione più complessa (~170 righe), richiede la maggior parte dei test
- Le funzioni interne (`trySingleLineQuestion`, `evaluateOptions`, `_norm`) sono private ma critiche — valutare se testarle direttamente o tramite esportazione temporanea
- `injectGiustaFromAnswers` ha due passaggi (multi-riga + mono-riga) con logica di matching complessa — richiede test specifici per ogni percorso
- La normalizzazione testuale (`_norm`) è fondamentale per il matching tra risposte e opzioni — qualsiasi bug qui causa falsi negativi
- I commit devono seguire le convenzioni in `AGENTS.md`: feat/fix/chore in inglese
