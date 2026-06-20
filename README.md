# Anki TSV Generator

Webapp React + TypeScript + Vite per trasformare domande a risposta multipla
in un file `.tsv` pronto per l'import in Anki. Funziona interamente nel
browser, nessun backend richiesto.

## Avvio

```bash
npm install
npm run dev
```

Apri l'URL mostrato in console (di norma `http://localhost:5173`).

Per una build di produzione statica:

```bash
npm run build
npm run preview
```

La cartella `dist/` generata può essere servita da qualsiasi hosting statico
(Netlify, GitHub Pages, ecc.) o aperta come file locale.

## Funzionalità aggiuntive

- **Scorciatoie da tastiera**: premi `Invio` nel campo Capitolo, o `Ctrl+Invio` (`⌘+Invio` su Mac) nella textarea, per generare il TSV senza usare il mouse.
- **Numerazione preservata**: se il testo originale ha una numerazione (`9.`, `10)`...), viene mantenuta nel campo "Domanda" del TSV invece di essere ricalcolata. Questo permette di accorgersi a colpo d'occhio se manca qualche domanda (es. se vedi 1, 2, 9, 10 sai che 3-8 sono andate perse nel parsing).
- **Guida ai formati**: un accordion sotto la textarea spiega in dettaglio entrambi i formati supportati, i separatori accettati, come funziona il marker della risposta corretta, e come vengono gestiti markdown/testo spezzato.

## Formato del testo da incollare

Sono supportati **due formati**, anche misti nello stesso testo.

### Formato multi-riga (un'opzione per riga)

Ogni domanda: testo libero (anche su più righe) seguito da esattamente 4
opzioni etichettate `A`, `B`, `C`, `D` (in qualsiasi ordine). L'unica
risposta corretta va marcata aggiungendo `(giusta)` o `(giusto)` in un
punto qualsiasi del suo testo — il marker viene rimosso automaticamente
nell'output.

```
Il concetto di inconscio collettivo è:
A solo memorie personali
B immagini universali (giusta)
C eventi storici
D processi razionali

Freud definisce l'Es come:
A parte razionale
B istanza morale
C fonte delle pulsioni (giusta)
D coscienza sociale
```

Le etichette accettano anche `A)`, `A.`, `A:`, `A-` come separatore, e le
righe vuote vengono ignorate: il parser tollera testo incollato da Word o
PDF con spaziature irregolari.

### Formato mono-riga (lista numerata)

Tipico di testo generato da un assistente o estratto da PDF, dove l'intera
domanda e le 4 opzioni stanno su un'unica riga:

```
1. Kuhn descrive il progresso scientifico rispetto alla visione tradizionale: Paragrafo di riferimento - Cenni biografici. A come una serie di miglioramenti continui e lineari B attraverso discontinuità e rivoluzioni scientifiche (giusta) C mediante il rifiuto totale delle teorie precedenti D con una stretta aderenza ai metodi empirici
```

La numerazione iniziale (`1.`, `2)`, ...) viene rimossa automaticamente. Le
lettere A/B/C/D devono comparire come parole isolate, nell'ordine A→B→C→D;
tutto il testo prima della prima "A" diventa la domanda, ciò che sta tra una
lettera e la successiva diventa il testo dell'opzione corrispondente.

## Output

Ogni riga del `.tsv` ha 7 colonne separate da tabulazione:

1. `{CAPITOLO} - {domanda}`
2. Risposta A (senza marker)
3. Risposta B
4. Risposta C
5. Risposta D
6. Codice binario a 4 cifre della risposta corretta (es. `0100`)
7. `2` (valore fisso)

## Gestione errori

Se una domanda non ha esattamente una risposta marcata come corretta, o il
testo della domanda risulta vuoto, viene segnalata negli avvisi e **esclusa
di default** dal file scaricato (rimane visibile in anteprima). È possibile
includerla comunque nel file spuntando "Includi anche le domande con errori
nel file scaricato".

## Struttura del progetto

```
src/
  parser.ts   logica di parsing e generazione TSV (pura, senza React)
  App.tsx     interfaccia utente
  App.css     stile
  main.tsx    bootstrap React
```

La logica di parsing in `parser.ts` non dipende da React: può essere
riutilizzata o testata in isolamento.
# anki-tsv-app
