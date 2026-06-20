import { useMemo, useState, useCallback, KeyboardEvent } from "react";
import { parseInput, buildRow, type ParseResult } from "./parser";

/* ── esempi di testo ─────────────────────────────────────────────────── */

const EXAMPLE_TEXT = `Il concetto di inconscio collettivo è:
A solo memorie personali
B immagini universali (giusta)
C eventi storici
D processi razionali

Freud definisce l'Es come:
A parte razionale
B istanza morale
C fonte delle pulsioni (giusta)
D coscienza sociale`;

const EXAMPLE_TEXT_NUMBERED = `1. Kuhn descrive il progresso scientifico rispetto alla visione tradizionale: Paragrafo di riferimento - Cenni biografici A come una serie di miglioramenti continui e lineari B attraverso discontinuità e rivoluzioni scientifiche (giusta) C mediante il rifiuto totale delle teorie precedenti D con una stretta aderenza ai metodi empirici
2. I paradigmi influenzano la scelta dei problemi scientifici: Paragrafo di riferimento - I paradigmi A limitando i problemi riconosciuti come scientificamente validi (giusta) B espandendo il campo di indagine senza restrizioni C ignorando le implicazioni etiche della ricerca D concentrandosi su problemi metafisici e teorici`;

/* ── utilities ───────────────────────────────────────────────────────── */

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], {
    type: "text/tab-separated-values;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function normalizeFilename(name: string): string {
  const trimmed = name.trim() || "anki.tsv";
  return /\.tsv$/i.test(trimmed) ? trimmed : `${trimmed}.tsv`;
}

/** Dato un codice binario "0100", ritorna l'indice (0-3) della risposta corretta, o -1. */
function correctIndex(binary: string): number {
  return binary.split("").findIndex((c) => c === "1");
}

/* ── componente Accordion ─────────────────────────────────────────────── */

function FormatGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className={`accordion ${open ? "accordion--open" : ""}`}>
      <button
        type="button"
        className="accordion-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="accordion-icon" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        Guida ai formati accettati
      </button>

      <div className="accordion-body" aria-hidden={!open}>
        <div className="accordion-inner">

          <section className="guide-section">
            <h3>Formato A — Multi-riga</h3>
            <p>Ogni opzione su una riga separata. Il testo della domanda può stare su più righe. Le domande sono separate da righe vuote (opzionale).</p>
            <pre>{`1. Testo della domanda:
A prima opzione
B seconda opzione (giusta)
C terza opzione
D quarta opzione`}</pre>
            <p>Separatori accettati dopo la lettera: spazio, <code>.</code> <code>)</code> <code>:</code> <code>-</code></p>
          </section>

          <section className="guide-section">
            <h3>Formato B — Lista numerata (tutto su una riga)</h3>
            <p>Tutta la domanda + le 4 opzioni inline sulla stessa riga. Tipico di testo generato da AI o copiato da PDF. Le lettere A B C D devono comparire come parole isolate nell'ordine A→B→C→D.</p>
            <pre>{`1. Testo della domanda: contesto A prima opzione B seconda opzione (giusta) C terza opzione D quarta opzione`}</pre>
          </section>

          <section className="guide-section">
            <h3>Risposta corretta</h3>
            <p>Aggiungi <code>(giusta)</code> o <code>(giusto)</code> in qualsiasi punto del testo dell'opzione corretta. Il marker viene rimosso in output. Esattamente una risposta per domanda deve essere marcata.</p>
            <pre>{`B seconda opzione (giusta)
A la risposta (giusto) con testo dopo`}</pre>
          </section>

          <section className="guide-section">
            <h3>Testo wrappato e righe spezzate</h3>
            <p>Se un'opzione lunga va a capo nel copy-paste, la riga di continuazione viene riattaccata automaticamente all'opzione precedente — incluso <code>(giusta)</code> su riga propria.</p>
            <pre>{`D perché richiedono un cambiamento radicale
(giusta)`}</pre>
          </section>

          <section className="guide-section">
            <h3>Markdown e testo sporco</h3>
            <p>Il grassetto markdown (<code>**testo**</code>) viene rimosso prima del parsing. Testo introduttivo separato da una riga vuota dalle domande viene ignorato. I numeri di lista (es. <code>9.</code>) vengono preservati nel testo della domanda in output.</p>
          </section>

          <section className="guide-section">
            <h3>Output TSV — 7 colonne</h3>
            <pre>{`CAPITOLO - domanda  [TAB]  A  [TAB]  B  [TAB]  C  [TAB]  D  [TAB]  binario  [TAB]  2`}</pre>
            <p>Il codice binario (es. <code>0100</code>) indica la risposta corretta: posizione 1 = A, 2 = B, 3 = C, 4 = D.</p>
          </section>

          <section className="guide-section guide-section--tip">
            <span className="tip-icon">⌨</span>
            <p>Premi <kbd>Ctrl</kbd>+<kbd>Enter</kbd> (o <kbd>⌘</kbd>+<kbd>Enter</kbd> su Mac) nella textarea per avviare la conversione senza usare il mouse.</p>
          </section>

        </div>
      </div>
    </div>
  );
}

/* ── componente principale ───────────────────────────────────────────── */

export default function App() {
  const [capitolo, setCapitolo] = useState("CAP1");
  const [rawText, setRawText] = useState("");
  const [filename, setFilename] = useState("anki.tsv");
  const [includeErrors, setIncludeErrors] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");

  const exportableQuestions = useMemo(
    () =>
      result
        ? result.questions.filter((q) => includeErrors || !q.hasBlockingError)
        : [],
    [result, includeErrors]
  );

  const tsvPreview = useMemo(
    () => exportableQuestions.map(buildRow).join("\n"),
    [exportableQuestions]
  );

  const handleGenerate = useCallback(() => {
    setCopyState("idle");
    if (!capitolo.trim()) {
      setFormError("Inserisci il nome del capitolo (es. CAP3).");
      setResult(null);
      return;
    }
    if (!rawText.trim()) {
      setFormError("Incolla il testo delle domande prima di generare.");
      setResult(null);
      return;
    }
    setFormError(null);
    const r = parseInput(rawText, capitolo);
    setResult(r);
    setFilename(`${capitolo.trim()}.tsv`);
  }, [capitolo, rawText]);

  // Ctrl+Enter / Cmd+Enter nella textarea avvia la conversione
  function handleTextareaKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleGenerate();
    }
  }

  function handleDownload() {
    if (exportableQuestions.length === 0) return;
    downloadTextFile(normalizeFilename(filename), tsvPreview);
  }

  async function handleCopy() {
    if (!tsvPreview) return;
    try {
      await navigator.clipboard.writeText(tsvPreview);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1800);
    } catch {
      setFormError(
        "Impossibile copiare automaticamente: seleziona e copia il testo dall'anteprima."
      );
    }
  }

  function loadExample() {
    setRawText(EXAMPLE_TEXT);
    setFormError(null);
  }
  function loadExampleNumbered() {
    setRawText(EXAMPLE_TEXT_NUMBERED);
    setFormError(null);
  }

  const blockingCount = result
    ? result.questions.filter((q) => q.hasBlockingError).length
    : 0;
  const validCount = result ? result.questions.length - blockingCount : 0;

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <span /><span /><span />
          </span>
          <div>
            <h1>Anki TSV Generator</h1>
            <p className="subtitle">
              Da domande a risposta multipla a un file .tsv pronto per l'import in Anki.
            </p>
          </div>
        </div>
      </header>

      <main className="layout">
        {/* ── colonna sinistra: input ── */}
        <section className="panel" aria-labelledby="input-heading">
          <h2 id="input-heading">
            <span className="step-num">1</span>
            Testo di partenza
          </h2>

          <div className="field">
            <label htmlFor="capitolo">Capitolo</label>
            <input
              id="capitolo"
              type="text"
              value={capitolo}
              onChange={(e) => setCapitolo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="es. CAP3"
              autoComplete="off"
            />
          </div>

          <div className="field">
            <div className="field-label-row">
              <label htmlFor="rawtext">Domande</label>
              <span className="example-links">
                <button type="button" className="link-btn" onClick={loadExample}>
                  Esempio A
                </button>
                <button type="button" className="link-btn" onClick={loadExampleNumbered}>
                  Esempio B
                </button>
              </span>
            </div>
            <textarea
              id="rawtext"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={"Il concetto di X è:\nA opzione 1\nB opzione 2 (giusta)\nC opzione 3\nD opzione 4"}
              rows={16}
            />
          </div>

          <FormatGuide />

          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}

          <div className="generate-row">
            <button type="button" className="primary-btn" onClick={handleGenerate}>
              Genera TSV
            </button>
            <span className="kbd-hint">
              <kbd>Ctrl</kbd>+<kbd>Enter</kbd>
            </span>
          </div>
        </section>

        {/* ── colonna destra: output ── */}
        <section className="panel" aria-labelledby="output-heading">
          <h2 id="output-heading">
            <span className="step-num">2</span>
            Risultato
          </h2>

          {!result && (
            <div className="empty-state">
              <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect x="8" y="10" width="32" height="28" rx="4" stroke="currentColor" strokeWidth="2"/>
                <line x1="14" y1="18" x2="34" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="24" x2="34" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                <line x1="14" y1="30" x2="24" y2="30" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <p>Incolla il testo delle domande e premi <strong>Genera TSV</strong> per vedere l'anteprima.</p>
            </div>
          )}

          {result && (
            <>
              {/* pillole di riepilogo */}
              <div className="summary">
                <span className="summary-pill ok">
                  <span className="pill-dot" />
                  {validCount} pronte
                </span>
                {blockingCount > 0 && (
                  <span className="summary-pill warn">
                    <span className="pill-dot" />
                    {blockingCount} con errori
                  </span>
                )}
                <span className="summary-pill neutral">
                  {result.questions.length} totali
                </span>
              </div>

              {/* avvisi di parsing */}
              {result.errors.length > 0 && (
                <details className="errors-box" open>
                  <summary>
                    ⚠ {result.errors.length} avviso{result.errors.length > 1 ? "i" : ""} di parsing
                  </summary>
                  <ul>
                    {result.errors.map((err, i) => (
                      <li key={i}>{err.message}</li>
                    ))}
                  </ul>
                </details>
              )}

              {result.questions.length === 0 ? (
                <p className="empty-state-text">
                  Nessuna domanda valida trovata. Controlla che ogni domanda abbia esattamente 4 opzioni etichettate A, B, C, D.
                </p>
              ) : (
                <>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={includeErrors}
                      onChange={(e) => setIncludeErrors(e.target.checked)}
                    />
                    Includi le domande con errori nel file
                  </label>

                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th className="col-nr">Nr.</th>
                          <th className="col-q">Domanda</th>
                          <th>A</th>
                          <th>B</th>
                          <th>C</th>
                          <th>D</th>
                          <th className="col-bin">Bin.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.questions.map((q) => {
                          const ci = correctIndex(q.binary);
                          return (
                            <tr
                              key={q.index}
                              className={q.hasBlockingError ? "row-error" : ""}
                            >
                              <td className="col-nr mono">{q.displayNumber}</td>
                              <td className="col-q">
                                <span className="q-cap">{q.capitolo}</span>
                                <span className="q-sep"> – </span>
                                <span>{q.question}</span>
                                {q.hasBlockingError && (
                                  <span className="badge">errore</span>
                                )}
                              </td>
                              {q.options.map((opt, oi) => (
                                <td
                                  key={oi}
                                  className={ci === oi ? "cell-correct" : ""}
                                >
                                  {opt}
                                </td>
                              ))}
                              <td className="col-bin mono">{q.binary}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="download-row">
                    <div className="field filename-field">
                      <label htmlFor="filename">Nome file</label>
                      <input
                        id="filename"
                        type="text"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="anki.tsv"
                      />
                    </div>

                    <div className="actions">
                      <button
                        type="button"
                        className="primary-btn"
                        onClick={handleDownload}
                        disabled={exportableQuestions.length === 0}
                      >
                        ↓ Scarica TSV ({exportableQuestions.length})
                      </button>
                      <button
                        type="button"
                        className={`secondary-btn ${copyState === "copied" ? "secondary-btn--success" : ""}`}
                        onClick={handleCopy}
                        disabled={exportableQuestions.length === 0}
                      >
                        {copyState === "copied" ? "✓ Copiato!" : "Copia TSV"}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
