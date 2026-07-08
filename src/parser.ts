/**
 * Parser robusto per domande a risposta multipla -> righe TSV per Anki.
 *
 * Supporta due formati, anche misti nello stesso testo:
 *
 * 1) Formato "multi-riga" (un'opzione per riga):
 *    9. Testo della domanda (anche su più righe)
 *    A risposta 1
 *    B risposta 2
 *    C risposta 3 (giusta)
 *    D risposta 4
 *
 * 2) Formato "mono-riga" (lista numerata inline):
 *    1. Testo della domanda A opzione1 B opzione2 (giusta) C opzione3 D opzione4
 *
 * Gestisce markdown bold (**), righe avvolte (wrap), testo introduttivo
 * prima delle domande, continuazioni multi-riga di un'opzione, e preserva
 * la numerazione originale della domanda quando presente nel testo (utile
 * per verificare a colpo d'occhio se manca qualche domanda nel risultato).
 */

export interface ParsedQuestion {
  /** Numero progressivo (1-based) nell'ordine di apparizione nel testo, usato solo per i messaggi di errore. */
  index: number;
  /**
   * Numero da mostrare in output: se il testo originale aveva una
   * numerazione (es. "9.", "10)") viene preservata (anche con eventuali
   * "buchi" se alcune domande sono state scartate); altrimenti è un
   * contatore sequenziale 1, 2, 3, ...
   */
  displayNumber: string;
  capitolo: string;
  question: string;
  options: [string, string, string, string];
  binary: string;
  hasBlockingError: boolean;
}

export interface ParseError {
  index: number;
  message: string;
}

export interface ParseResult {
  questions: ParsedQuestion[];
  errors: ParseError[];
}

const MARKER_REGEX = /\(\s*giust[oa]\s*\)/i;
const OPTION_LINE_REGEX = /^([A-Da-d])(?:[.)\:\-]\s*|\s+)(\S.*)/;
const LEADING_NUMBERING_REGEX = /^\s*(\d+)[.)]\s*/;

export function sanitizeCell(s: string): string {
  return s
    .replace(/\t/g, " ")
    .replace(/\r?\n/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function snippetOf(buf: string[]): string {
  const s = buf.join(" ").trim();
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

interface ExtractedNumber {
  number: string | null;
  rest: string;
}

/** Estrae una numerazione di lista iniziale tipo "9. " o "12) ", se presente. */
export function extractNumber(line: string): ExtractedNumber {
  const m = line.match(LEADING_NUMBERING_REGEX);
  if (!m) return { number: null, rest: line };
  return { number: m[1], rest: line.slice(m[0].length).trim() };
}

interface SingleLineMatch {
  questionText: string;
  options: [string, string, string, string];
  number: string | null;
}

/**
 * Tenta di interpretare un'intera riga come domanda + 4 opzioni A/B/C/D inline.
 * Le lettere devono comparire come token isolati nell'ordine A→B→C→D.
 * Restituisce null se la riga non corrisponde a questo formato.
 */
function trySingleLineQuestion(line: string): SingleLineMatch | null {
  const { number, rest: stripped } = extractNumber(line);
  const words = stripped.split(/\s+/).filter(Boolean);

  function cleanToken(w: string): string {
    return w.replace(/[.,:;)\]]+$/, "");
  }
  function findFrom(letter: string, fromIdx: number): number {
    for (let i = fromIdx; i < words.length; i++) {
      if (cleanToken(words[i]) === letter && words[i].length <= letter.length + 2) return i;
    }
    return -1;
  }

  const idxA = findFrom("A", 0);
  if (idxA === -1) return null;
  const idxB = findFrom("B", idxA + 1);
  if (idxB === -1) return null;
  const idxC = findFrom("C", idxB + 1);
  if (idxC === -1) return null;
  const idxD = findFrom("D", idxC + 1);
  if (idxD === -1) return null;

  const questionText = words.slice(0, idxA).join(" ").trim();
  const optA = words.slice(idxA + 1, idxB).join(" ").trim();
  const optB = words.slice(idxB + 1, idxC).join(" ").trim();
  const optC = words.slice(idxC + 1, idxD).join(" ").trim();
  const optD = words.slice(idxD + 1).join(" ").trim();

  if (!questionText || !optA || !optB || !optC || !optD) return null;
  return { questionText, options: [optA, optB, optC, optD], number };
}

interface EvaluatedOptions {
  cleanOptions: [string, string, string, string];
  binary: string;
  hasBlockingError: boolean;
  errorMessage: string | null;
}

export function evaluateOptions(rawOptions: [string, string, string, string]): EvaluatedOptions {
  const correctPositions: number[] = [];
  const cleanOptions = rawOptions.map((opt, i) => {
    if (MARKER_REGEX.test(opt)) correctPositions.push(i);
    return sanitizeCell(opt.replace(MARKER_REGEX, ""));
  }) as [string, string, string, string];

  let binary = "0000";
  let hasBlockingError = false;
  let errorMessage: string | null = null;

  if (correctPositions.length === 1) {
    const arr = ["0", "0", "0", "0"];
    arr[correctPositions[0]] = "1";
    binary = arr.join("");
  } else if (correctPositions.length === 0) {
    hasBlockingError = true;
    errorMessage = "nessuna risposta marcata come corretta con (giusta)/(giusto)";
  } else {
    const arr = ["0", "0", "0", "0"];
    correctPositions.forEach((i) => (arr[i] = "1"));
    binary = arr.join("");
    hasBlockingError = true;
    errorMessage = `trovate ${correctPositions.length} risposte marcate come corrette, dovrebbe essere esattamente 1`;
  }

  return { cleanOptions, binary, hasBlockingError, errorMessage };
}

export function parseInput(rawText: string, capitolo: string): ParseResult {
  const text = (rawText || "")
    .replace(/\*\*/g, "") // rimuove markdown bold prima del parsing
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  const lines = text.split("\n");
  const questions: ParsedQuestion[] = [];
  const errors: ParseError[] = [];

  let questionBuffer: string[] = [];
  let currentOptions: Record<string, string> = {};
  let questionCounter = 0;
  let lastOptionLetter: string | null = null;
  let pendingNumber: string | null = null;
  let hasStartedQuestion = false;

  const hasOptions = () => Object.keys(currentOptions).length > 0;
  const isComplete = () => Object.keys(currentOptions).length === 4;

  function pushFinalQuestion(
    questionTextRaw: string,
    rawOptions: [string, string, string, string],
    explicitNumber: string | null
  ) {
    questionCounter++;
    const qText = sanitizeCell(questionTextRaw);
    const evalRes = evaluateOptions(rawOptions);
    const displayNumber = explicitNumber ?? String(questionCounter);

    if (evalRes.errorMessage) {
      errors.push({
        index: questionCounter,
        message: `Domanda #${displayNumber} ("${qText || "(testo mancante)"}"): ${evalRes.errorMessage}.`,
      });
    }
    if (!qText) {
      errors.push({
        index: questionCounter,
        message: `Domanda #${displayNumber}: testo della domanda mancante (opzioni trovate: ${rawOptions.join(" / ")}).`,
      });
    }

    questions.push({
      index: questionCounter,
      displayNumber,
      capitolo: capitolo.trim(),
      question: qText || "[DOMANDA MANCANTE]",
      options: evalRes.cleanOptions,
      binary: evalRes.binary,
      hasBlockingError: evalRes.hasBlockingError || !qText,
    });
  }

  /**
   * Finalizzazione "lazy": viene chiamata ai confini naturali (riga vuota,
   * nuova domanda, nuova lettera su set già completo, fine input). Questo
   * permette alle righe di continuazione (testo wrappato, "(giusta)" su
   * riga propria) di essere appese all'ultima opzione prima della chiusura.
   */
  function flush() {
    if (isComplete()) {
      pushFinalQuestion(
        questionBuffer.join(" "),
        (["A", "B", "C", "D"] as const).map((l) => currentOptions[l] ?? "") as [
          string,
          string,
          string,
          string
        ],
        pendingNumber
      );
    } else if (hasOptions()) {
      errors.push({
        index: questionCounter + 1,
        message: `Domanda incompleta scartata: trovate solo ${Object.keys(currentOptions).length}/4 risposte (testo: "${snippetOf(questionBuffer)}").`,
      });
    }
    questionBuffer = [];
    currentOptions = {};
    lastOptionLetter = null;
    pendingNumber = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // --- RIGA VUOTA: confine esplicito ---
    if (!line) {
      if (isComplete()) flush();
      else if (!hasOptions() && !hasStartedQuestion) {
        // Riga vuota nel testo pre-opzioni: resetta buffer/numero orfani.
        questionBuffer = [];
        pendingNumber = null;
      }
      continue;
    }

    // --- FORMATO MONO-RIGA ---
    const single = trySingleLineQuestion(line);
    if (single) {
      flush();
      hasStartedQuestion = true;
      pushFinalQuestion(single.questionText, single.options, single.number);
      continue;
    }

    // --- OPZIONE A/B/C/D ---
    const m = line.match(OPTION_LINE_REGEX);
    if (m) {
      const letter = m[1].toUpperCase();
      const content = m[2].replace(/^[.):\-]\s*/, "").trim();

      if (isComplete()) flush();
      hasStartedQuestion = true;

      if (currentOptions[letter] !== undefined) {
        errors.push({
          index: questionCounter + 1,
          message: `Lettera "${letter}" duplicata vicino a "${snippetOf(questionBuffer)}". Mantenuto il valore più recente.`,
        });
      }
      currentOptions[letter] = content;
      lastOptionLetter = letter;
      continue;
    }

    // --- CONTINUAZIONE O TESTO DOMANDA ---
    if (lastOptionLetter !== null) {
      if (LEADING_NUMBERING_REGEX.test(line)) {
        flush();
        const { number, rest } = extractNumber(line);
        pendingNumber = number;
        questionBuffer.push(rest);
      } else {
        currentOptions[lastOptionLetter] = (
          currentOptions[lastOptionLetter] +
          " " +
          line
        ).trim();
      }
      continue;
    }

    // Testo della domanda, prima delle opzioni: la prima riga del buffer
    // può contenere la numerazione originale, da preservare.
    if (questionBuffer.length === 0) {
      const { number, rest } = extractNumber(line);
      if (number) {
        pendingNumber = number;
        hasStartedQuestion = true;
      }
      if (hasStartedQuestion) questionBuffer.push(rest);
    } else {
      if (hasStartedQuestion) {
        questionBuffer.push(line);
      }
    }
  }

  flush();
  if (questionBuffer.length > 0) {
    errors.push({
      index: questionCounter + 1,
      message: `Testo finale ignorato (nessuna risposta associata): "${snippetOf(questionBuffer)}".`,
    });
  }

  return { questions, errors };
}

/* ── gestione file risposte ───────────────────────────────────────────── */

/**
 * Parser per il file risposte caricato dall'utente.
 *
 * Supporta due formati:
 *
 * 1) Formato "file di testo" — domanda su una riga, risposta sulla successiva:
 *    4. Fanon valuta il rapporto …:
 *    Come uno strumento di potere …
 *    5. Il ruolo dell'esperienza "vécue" …:
 *    È centrale …
 *
 * 2) Formato "PDF" — domanda e risposta sulla stessa riga separate da ":":
 *    1. Come il linguaggio interagisce …:
 *    Fanon sostiene che il linguaggio è un campo …
 *
 * Restituisce una mappa: domanda_normalizzata → risposta_corretta.
 */
export function parseAnswersFile(content: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = content.split("\n");
  let currentQuestion: string | null = null;
  let currentAnswer: string[] = [];

  function flush() {
    if (currentQuestion && currentAnswer.length > 0) {
      map.set(currentQuestion, currentAnswer.join(" ").replace(/\s+/g, " ").trim());
    }
    currentAnswer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const numMatch = line.match(/^\s*(\d+)[.)]\s*/);
    if (numMatch) {
      flush();
      const rest = line.slice(numMatch[0].length).trim();

      // Cerca ":" che separa domanda da risposta sulla stessa riga (formato PDF).
      // Usa l'ultimo ":" così se la domanda ne contiene uno interno (es. "nota:")
      // non viene spezzata erroneamente.
      const lastColon = rest.lastIndexOf(":");
      if (lastColon >= 0) {
        const before = rest.slice(0, lastColon).trim();
        const after = rest.slice(lastColon + 1).trim();
        if (before && after) {
          currentQuestion = before;
          currentAnswer.push(after);
          continue;
        }
      }

      // Formato classico: risposta sulla riga successiva
      currentQuestion = rest.replace(/:+$/, "").trim();
    } else if (currentQuestion) {
      currentAnswer.push(line);
    }
  }
  flush();

  return map;
}

export function _norm(s: string): string {
  return s.toLowerCase().replace(/[–—\-:;.,!?]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Dato il testo grezzo della textarea e la mappa domanda→risposta,
 * aggiunge il marker "(giusta)" accanto all'opzione corretta nel testo.
 * Il testo modificato può essere re-inserito nella textarea e processato
 * dal parser normale, che riconoscerà il marker.
 */
export function injectGiustaFromAnswers(
  rawText: string,
  answerMap: Map<string, string>
): string {
  if (!rawText.trim() || answerMap.size === 0) return rawText;

  const result = parseInput(rawText, "");
  if (result.questions.length === 0) return rawText;

  // Per ogni domanda, trova la risposta corretta e l'indice dell'opzione
  const correctOptionByQ: Map<number, number> = new Map();

  for (const q of result.questions) {
    const normQ = _norm(q.question);

    let matchedAnswer: string | null = null;
    for (const [aq, ans] of answerMap) {
      if (_norm(aq) === normQ) {
        matchedAnswer = ans;
        break;
      }
    }
    if (!matchedAnswer) continue;

    const normAnswer = _norm(matchedAnswer);
    const normOptions = q.options.map((o) => _norm(o));
    const idx = normOptions.indexOf(normAnswer);
    if (idx >= 0) {
      correctOptionByQ.set(q.index, idx);
    }
  }

  if (correctOptionByQ.size === 0) return rawText;

  const lines = rawText.split("\n");
  const optLetters = ["A", "B", "C", "D"];
  const alreadyMarked = (line: string) => /\(giust[oa]\)/i.test(line);
  const matchedIndices = new Set<number>();

  // ── Passo 1: formato multi-riga (ogni opzione su riga propria) ──
  let qi = 0;
  let optCount = 0;
  let started = false;

  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    if (!trimmed) continue;

    const optMatch = trimmed.match(/^([A-Da-d])(?:[.)\:\-]\s*|\s+)(.*)$/);
    if (!optMatch) continue;

    const letter = optMatch[1].toUpperCase();
    const optText = optMatch[2].trim();

    if (letter === "A" || optCount === 0) {
      if (started && optCount > 0) qi++;
      started = true;
      optCount = 1;
    } else {
      optCount++;
    }

    if (qi >= result.questions.length) break;

    const currentQ = result.questions[qi];
    const correctOptIdx = correctOptionByQ.get(currentQ.index);
    if (correctOptIdx === undefined) {
      if (letter === "D" || letter === "d") { qi++; optCount = 0; }
      continue;
    }

    const correctLetter = optLetters[correctOptIdx];
    if (letter === correctLetter && !alreadyMarked(lines[li])) {
      const expectedContent = currentQ.options[correctOptIdx];
      if (_norm(optText) === _norm(expectedContent)) {
        lines[li] = lines[li] + " (giusta)";
        matchedIndices.add(currentQ.index);
      }
    }

    if (letter === "D" || letter === "d") { qi++; optCount = 0; }
  }

  // ── Passo 2: formato singola-riga (A B C D inline con la domanda) ──
  for (let li = 0; li < lines.length; li++) {
    const trimmed = lines[li].trim();
    if (!trimmed || alreadyMarked(lines[li])) continue;

    // Salta righe già riconosciute come opzioni multi-riga
    if (/^[A-Da-d][.).:\-]\s/.test(trimmed)) continue;

    const single = trySingleLineQuestion(trimmed);
    if (!single) continue;

    const normQ = _norm(single.questionText);

    for (const q of result.questions) {
      if (matchedIndices.has(q.index)) continue;

      const correctOptIdx = correctOptionByQ.get(q.index);
      if (correctOptIdx === undefined) continue;
      if (_norm(q.question) !== normQ) continue;

      const correctLetter = optLetters[correctOptIdx];
      const correctOptionText = q.options[correctOptIdx];
      const escaped = correctOptionText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Sostituisce "Lettera + opzione" con "Lettera + opzione (giusta)"
      const regex = new RegExp(`(${correctLetter}\\s+)${escaped}`, "i");
      if (regex.test(lines[li])) {
        lines[li] = lines[li].replace(regex, `$1${correctOptionText} (giusta)`);
        matchedIndices.add(q.index);
      }
      break;
    }
  }

  return lines.join("\n");
}

export function buildRow(q: ParsedQuestion): string {
  const front = sanitizeCell(`${q.capitolo} - ${q.displayNumber}. ${q.question}`);
  return [
    front,
    q.options[0],
    q.options[1],
    q.options[2],
    q.options[3],
    q.binary,
    "2",
  ].join("\t");
}

export function buildTSV(
  questions: ParsedQuestion[],
  includeBlockingErrors: boolean
): string {
  const rows = questions
    .filter((q) => includeBlockingErrors || !q.hasBlockingError)
    .map(buildRow);
  return rows.join("\n");
}
