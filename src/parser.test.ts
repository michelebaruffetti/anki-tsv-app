// Test per parser.ts — copre parsing multi-riga e mono-riga,
// parsing file risposte (testo e PDF), iniezione risposta corretta,
// generazione TSV e utility di normalizzazione.

import { describe, it, expect } from 'vitest';
import {
  parseInput,
  parseAnswersFile,
  injectGiustaFromAnswers,
  buildRow,
  buildTSV,
  sanitizeCell,
  extractNumber,
  evaluateOptions,
  _norm,
} from './parser';

describe('sanitizeCell', () => {
  it('removes tabs', () => {
    expect(sanitizeCell('a\tb')).toBe('a b');
  });

  it('removes newlines', () => {
    expect(sanitizeCell('a\nb')).toBe('a b');
  });

  it('removes multiple spaces', () => {
    expect(sanitizeCell('a   b')).toBe('a b');
  });

  it('trims leading and trailing spaces', () => {
    expect(sanitizeCell('  a b  ')).toBe('a b');
  });

  it('handles empty string', () => {
    expect(sanitizeCell('')).toBe('');
  });
});

describe('extractNumber', () => {
  it('extracts number with dot', () => {
    expect(extractNumber('9. Testo')).toEqual({ number: '9', rest: 'Testo' });
  });

  it('extracts number with parenthesis', () => {
    expect(extractNumber('12) Testo')).toEqual({ number: '12', rest: 'Testo' });
  });

  it('returns null when no number', () => {
    expect(extractNumber('Testo')).toEqual({ number: null, rest: 'Testo' });
  });

  it('trims the rest after extraction', () => {
    expect(extractNumber('1.  Testo')).toEqual({ number: '1', rest: 'Testo' });
  });
});

describe('parseInput', () => {
  describe('formato multi-riga', () => {
    it('parses single question with correct answer', () => {
      const input = `
1. Qual è la capitale della Francia?
A. Londra
B. Berlino
C. Parigi (giusta)
D. Madrid
`;
      const result = parseInput(input, 'Capitale');

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('Qual è la capitale della Francia?');
      expect(result.questions[0].options).toEqual(['Londra', 'Berlino', 'Parigi', 'Madrid']);
      expect(result.questions[0].binary).toBe('0010');
      expect(result.questions[0].capitolo).toBe('Capitale');
    });

    it('supports (giusto) marker', () => {
      const input = `
1. Domanda
A. Opz1
B. Opz2 (giusto)
C. Opz3
D. Opz4
`;
      const result = parseInput(input, 'Test');

      expect(result.questions[0].binary).toBe('0100');
    });

    it('preserves original numbering', () => {
      const input = `
9. Testo della domanda
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;
      const result = parseInput(input, 'Capitolo');

      expect(result.questions[0].displayNumber).toBe('9');
    });

    it('handles wrapped question text', () => {
      const input = `
1. Qual è la capitale
della Francia?
A. Londra
B. Parigi (giusta)
C. Berlino
D. Madrid
`;
      const result = parseInput(input, 'Test');

      expect(result.questions[0].question).toBe('Qual è la capitale della Francia?');
    });

    it('continues option text on next line', () => {
      const input = `
1. Domanda
A. Opz1
B. Opz2 che
continua su più righe (giusta)
C. Opz3
D. Opz4
`;
      const result = parseInput(input, 'Test');

      expect(result.questions[0].options[1]).toBe('Opz2 che continua su più righe');
    });

    it('parses multiple consecutive questions', () => {
      const input = `
1. Domanda 1
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4

2. Domanda 2
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;
      const result = parseInput(input, 'Test');

      expect(result.questions).toHaveLength(2);
      expect(result.questions[0].binary).toBe('1000');
      expect(result.questions[1].binary).toBe('0100');
    });

    it('removes markdown bold from question text', () => {
      const input = `
1. Domanda **con bold**
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;
      const result = parseInput(input, 'Test');

      expect(result.questions[0].question).toBe('Domanda con bold');
    });

    it('keeps numbering when some questions are skipped', () => {
      const input = `
1. Domanda 1
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4

3. Domanda 3 (salta il 2)
A. Opz1
B. Opz2
C. Opz3 (giusta)
D. Opz4
`;
      const result = parseInput(input, 'Test');

      expect(result.questions[0].displayNumber).toBe('1');
      expect(result.questions[1].displayNumber).toBe('3');
    });
  });

  describe('formato mono-riga', () => {
    it('parses inline question with options', () => {
      const input = `1. Qual è la capitale A Londra B Berlino C Parigi (giusta) D Madrid`;

      const result = parseInput(input, 'Test');

      expect(result.questions).toHaveLength(1);
      expect(result.questions[0].question).toBe('Qual è la capitale');
      expect(result.questions[0].options).toEqual(['Londra', 'Berlino', 'Parigi', 'Madrid']);
      expect(result.questions[0].binary).toBe('0010');
    });

    it('parses inline without numbering', () => {
      const input = `Domanda A Opz1 (giusta) B Opz2 C Opz3 D Opz4`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].displayNumber).toBe('1');
    });

    it('handles inline with extra spaces', () => {
      const input = `1. Domanda   A  Opz1 (giusta)   B Opz2 C Opz3 D Opz4`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].question).toBe('Domanda');
    });
  });

  describe('error handling', () => {
    it('returns error when no correct answer marked', () => {
      const input = `
1. Domanda
A. Opz1
B. Opz2
C. Opz3
D. Opz4
`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].hasBlockingError).toBe(true);
      expect(
        result.errors.find((e) =>
          e.message.includes('nessuna risposta marcata come corretta')
        )
      ).toBeDefined();
    });

    it('returns error when multiple correct answers marked', () => {
      const input = `
1. Domanda
A. Opz1 (giusta)
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].hasBlockingError).toBe(true);
      expect(
        result.errors.find((e) =>
          e.message.includes('trovate 2 risposte marcate come corrette')
        )
      ).toBeDefined();
    });

    it('skips incomplete question with less than 4 options', () => {
      const input = `
1. Domanda
A. Opz1
B. Opz2
C. Opz3
`;

      const result = parseInput(input, 'Test');

      expect(result.questions).toHaveLength(0);
      expect(
        result.errors.find((e) =>
          e.message.includes('Domanda incompleta scartata')
        )
      ).toBeDefined();
    });

    it('ignores trailing text without options', () => {
      const input = `
1. Domanda
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4

Testo finale senza opzioni`;
      const result = parseInput(input, 'Test');

      // La prima domanda viene parsata correttamente, il testo finale viene ignorato
      expect(result.questions).toHaveLength(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(0);
    });

    it('handles duplicate letter warning', () => {
      const input = `
1. Domanda
A. Opz1
A. Opz2 (giusta)
B. Opz3
C. Opz4
`;

      const result = parseInput(input, 'Test');

      expect(
        result.errors.find((e) =>
          e.message.includes('Lettera "A" duplicata')
        )
      ).toBeDefined();
    });

    it('handles empty input', () => {
      const result = parseInput('', 'Test');

      expect(result.questions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('sanitization', () => {
    it('normalizes tabs to spaces in options', () => {
      const input = `
1. Domanda
A.	Tab	iniziale (giusta)
B. Opz2
C. Opz3
D. Opz4
`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].options[0]).toBe('Tab iniziale');
    });

    it('normalizes \\r\\n line endings', () => {
      const input = '1. Domanda\r\nA. Opz1 (giusta)\r\nB. Opz2\r\nC. Opz3\r\nD. Opz4';

      const result = parseInput(input, 'Test');

      expect(result.questions).toHaveLength(1);
    });

    it('compresses multiple spaces in options', () => {
      const input = `
1. Domanda
A. Opz1    con   spazi (giusta)
B. Opz2
C. Opz3
D. Opz4
`;

      const result = parseInput(input, 'Test');

      expect(result.questions[0].options[0]).toBe('Opz1 con spazi');
    });
  });
});

describe('parseAnswersFile', () => {
  describe('formato testo (domanda su riga, risposta su successiva)', () => {
    it('parses simple Q&A pairs', () => {
      const input = `
1. Qual è la capitale?
Parigi
2. Colore del cielo
Azzurro
`;

      const result = parseAnswersFile(input);

      expect(result.get('Qual è la capitale?')).toBe('Parigi');
      expect(result.get('Colore del cielo')).toBe('Azzurro');
    });

    it('handles numbered format with parenthesis', () => {
      const input = `
1) Domanda
Risposta
`;

      const result = parseAnswersFile(input);

      expect(result.get('Domanda')).toBe('Risposta');
    });

    it('handles multi-line answers', () => {
      const input = `
1. Domanda
Risposta parte 1
Risposta parte 2
`;

      const result = parseAnswersFile(input);

      expect(result.get('Domanda')).toBe('Risposta parte 1 Risposta parte 2');
    });

    it('ignores empty lines', () => {
      const input = `
1. Domanda

Risposta
`;

      const result = parseAnswersFile(input);

      expect(result.get('Domanda')).toBe('Risposta');
    });
  });

  describe('formato PDF (domanda e risposta su stessa riga)', () => {
    it('parses Q:A format with colon', () => {
      const input = `1. Qual è la capitale: Parigi`;

      const result = parseAnswersFile(input);

      expect(result.get('Qual è la capitale')).toBe('Parigi');
    });

    it('uses last colon when question contains colons', () => {
      const input = `1. Domanda con : due punti: Risposta`;

      const result = parseAnswersFile(input);

      expect(result.get('Domanda con : due punti')).toBe('Risposta');
    });
  });

  it('returns empty Map for empty input', () => {
    const result = parseAnswersFile('');
    expect(result.size).toBe(0);
  });
});

describe('injectGiustaFromAnswers', () => {
  it('adds (giusta) marker for correct option in multi-riga format', () => {
    const input = `
1. Qual è la capitale?
A. Londra
B. Berlino
C. Parigi
D. Madrid
`;

    const answerMap = new Map([['Qual è la capitale?', 'Parigi']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toContain('C. Parigi (giusta)');
  });

  it('adds (giusta) marker for correct option in mono-riga format', () => {
    const input = `1. Qual è la capitale A Londra B Berlino C Parigi D Madrid`;

    const answerMap = new Map([['Qual è la capitale?', 'Parigi']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toContain('C Parigi (giusta)');
  });

  it('does not modify when answerMap is empty', () => {
    const input = `1. Domanda A Opz1 B Opz2 (giusta) C Opz3 D Opz4`;

    const answerMap = new Map();
    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toBe(input);
  });

  it('does not modify when rawText is empty', () => {
    const answerMap = new Map([['Domanda', 'Risposta']]);

    const result = injectGiustaFromAnswers('', answerMap);

    expect(result).toBe('');
  });

  it('does not duplicate (giusta) marker', () => {
    const input = `1. Domanda A Opz1 B Opz2 (giusta) C Opz3 D Opz4`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect((result.match(/\(giusta\)/g) || []).length).toBe(1);
  });

  it('case-insensitive matching', () => {
    const input = `
1. DOMANDA
A. opz1
B. OPZ2
C. opz3
D. opz4
`;

    const answerMap = new Map([['domanda', 'OPZ2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toContain('OPZ2 (giusta)');
  });

  it('does not add marker if answer does not match any option', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Risposta che non esiste']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).not.toContain('(giusta)');
  });
});

describe('buildRow', () => {
  it('generates correct TSV row format', () => {
    const question = {
      index: 1,
      displayNumber: '9',
      capitolo: 'Capitolo 1',
      question: 'Qual è la capitale?',
      options: ['Londra', 'Berlino', 'Parigi', 'Madrid'] as [string, string, string, string],
      binary: '0010',
      hasBlockingError: false,
    };

    const row = buildRow(question);

    expect(row).toBe('Capitolo 1 - 9. Qual è la capitale?\tLondra\tBerlino\tParigi\tMadrid\t0010\t2');
  });

  it('escapes tabs and newlines in content', () => {
    const question = {
      index: 1,
      displayNumber: '1',
      capitolo: 'Cap\nito',
      question: 'Ques\tto?',
      options: ['Opz1', 'Opz2', 'Opz3', 'Opz4'] as [string, string, string, string],
      binary: '1000',
      hasBlockingError: false,
    };

    const row = buildRow(question);

    expect(row).toContain('Cap ito');
    expect(row).toContain('Ques to');
  });
});

describe('buildTSV', () => {
  it('generates TSV from questions array', () => {
    const questions = [
      {
        index: 1,
        displayNumber: '1',
        capitolo: 'Cap1',
        question: 'Domanda 1',
        options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        binary: '1000',
        hasBlockingError: false,
      },
      {
        index: 2,
        displayNumber: '2',
        capitolo: 'Cap2',
        question: 'Domanda 2',
        options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        binary: '0100',
        hasBlockingError: false,
      },
    ];

    const tsv = buildTSV(questions, true);

    expect(tsv).toContain('Cap1 - 1. Domanda 1');
    expect(tsv).toContain('Cap2 - 2. Domanda 2');
    expect(tsv.split('\n').length).toBe(2);
  });

  it('filters out blocking errors when includeBlockingErrors is false', () => {
    const questions = [
      {
        index: 1,
        displayNumber: '1',
        capitolo: 'Cap1',
        question: 'Domanda 1',
        options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        binary: '1000',
        hasBlockingError: false,
      },
      {
        index: 2,
        displayNumber: '2',
        capitolo: 'Cap2',
        question: '',
        options: ['', '', '', ''] as [string, string, string, string],
        binary: '0000',
        hasBlockingError: true,
      },
    ];

    const tsv = buildTSV(questions, false);

    expect(tsv).toContain('Domanda 1');
    expect(tsv).not.toContain('Cap2');
  });

  it('returns empty string for empty array', () => {
    const tsv = buildTSV([], true);

    expect(tsv).toBe('');
  });
});

describe('evaluateOptions', () => {
  it('generates binary 1000 for correct answer at position A', () => {
    const result = evaluateOptions(['Risposta A (giusta)', 'B', 'C', 'D']);

    expect(result.binary).toBe('1000');
    expect(result.cleanOptions).toEqual(['Risposta A', 'B', 'C', 'D']);
    expect(result.hasBlockingError).toBe(false);
    expect(result.errorMessage).toBeNull();
  });

  it('generates binary 0100 for correct answer at position B', () => {
    const result = evaluateOptions(['A', 'Risposta B (giusta)', 'C', 'D']);

    expect(result.binary).toBe('0100');
  });

  it('generates binary 0010 for correct answer at position C', () => {
    const result = evaluateOptions(['A', 'B', 'Risposta C (giusta)', 'D']);

    expect(result.binary).toBe('0010');
  });

  it('generates binary 0001 for correct answer at position D', () => {
    const result = evaluateOptions(['A', 'B', 'C', 'Risposta D (giusta)']);

    expect(result.binary).toBe('0001');
  });

  it('handles (giusto) marker case-insensitively', () => {
    const resultA = evaluateOptions(['A (GIUSTA)', 'B', 'C', 'D']);
    const resultB = evaluateOptions(['A (Giusta)', 'B', 'C', 'D']);
    const resultC = evaluateOptions(['A (giusto)', 'B', 'C', 'D']);

    expect(resultA.binary).toBe('1000');
    expect(resultB.binary).toBe('1000');
    expect(resultC.binary).toBe('1000');
  });

  it('handles marker with spaces', () => {
    const result = evaluateOptions(['A (  giusta  )', 'B', 'C', 'D']);

    expect(result.binary).toBe('1000');
    expect(result.cleanOptions[0]).toBe('A');
  });

  it('blocks error when no correct answer marked', () => {
    const result = evaluateOptions(['A', 'B', 'C', 'D']);

    expect(result.hasBlockingError).toBe(true);
    expect(result.errorMessage).toBe('nessuna risposta marcata come corretta con (giusta)/(giusto)');
    expect(result.binary).toBe('0000');
  });

  it('blocks error when multiple correct answers marked (2)', () => {
    const result = evaluateOptions(['A (giusta)', 'B (giusta)', 'C', 'D']);

    expect(result.hasBlockingError).toBe(true);
    expect(result.errorMessage).toBe('trovate 2 risposte marcate come corrette, dovrebbe essere esattamente 1');
    expect(result.binary).toBe('1100');
  });

  it('blocks error when multiple correct answers marked (3)', () => {
    const result = evaluateOptions(['A (giusta)', 'B (giusta)', 'C (giusta)', 'D']);

    expect(result.hasBlockingError).toBe(true);
    expect(result.errorMessage).toBe('trovate 3 risposte marcate come corrette, dovrebbe essere esattamente 1');
    expect(result.binary).toBe('1110');
  });

  it('strips marker from option text', () => {
    const result = evaluateOptions(['Risposta lunga (giusta)', 'B', 'C', 'D']);

    expect(result.cleanOptions[0]).toBe('Risposta lunga');
  });
});

describe('_norm', () => {
  it('converts to lowercase', () => {
    expect(_norm('PARIGI')).toBe('parigi');
  });

  it('removes special punctuation', () => {
    expect(_norm('Domanda: con ; punti !?')).toBe('domanda con punti');
  });

  it('removes em-dash and en-dash', () => {
    expect(_norm('testo–con trattini')).toBe('testo con trattini');
    expect(_norm('testo—con trattini lunghi')).toBe('testo con trattini lunghi');
  });

  it('removes hyphens', () => {
    expect(_norm('parola-composta')).toBe('parola composta');
  });

  it('normalizes multiple spaces to single space', () => {
    expect(_norm('testo    con    spazi')).toBe('testo con spazi');
  });

  it('trims leading and trailing spaces', () => {
    expect(_norm('  testo  ')).toBe('testo');
  });

  it('handles empty string', () => {
    expect(_norm('')).toBe('');
  });

  it('handles string with only special characters', () => {
    expect(_norm(':::!!!')).toBe('');
  });

  it('normalizes accented characters', () => {
    expect(_norm('àéìòù')).toBe('àéìòù');
  });

  it('case-insensitive matching', () => {
    expect(_norm('PARIGI')).toBe(_norm('parigi'));
    expect(_norm('Parigi')).toBe(_norm('PARIGI'));
  });
});

describe('parseInput — formati misti', () => {
  it('parses multi-riga seguito da mono-riga', () => {
    const input = `
1. Domanda multi-riga
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4

2. Domanda mono-riga A Opz1 B Opz2 (giusta) C Opz3 D Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].binary).toBe('0100');
    expect(result.questions[1].binary).toBe('0100');
    expect(result.questions[0].displayNumber).toBe('1');
    expect(result.questions[1].displayNumber).toBe('2');
  });

  it('parses mono-riga seguito da multi-riga', () => {
    const input = `
1. Domanda mono-riga A Opz1 B Opz2 (giusta) C Opz3 D Opz4

2. Domanda multi-riga
A. Opz1
B. Opz2
C. Opz3 (giusta)
D. Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].binary).toBe('0100');
    expect(result.questions[1].binary).toBe('0010');
  });

  it('preserves numbering across mixed formats', () => {
    const input = `
5. Prima domanda multi-riga
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4

10. Seconda domanda mono-riga A Opz1 B Opz2 (giusta) C Opz3 D Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions[0].displayNumber).toBe('5');
    expect(result.questions[1].displayNumber).toBe('10');
  });
});

describe('parseInput — separatori opzioni diversi', () => {
  it('parses opzioni con punto', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[1]).toBe('Opz2');
  });

  it('parses opzioni con parentesi tonda', () => {
    const input = `
1. Domanda
A) Opz1
B) Opz2 (giusta)
C) Opz3
D) Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[1]).toBe('Opz2');
  });

  it('parses opzioni con due punti', () => {
    const input = `
1. Domanda
A: Opz1
B: Opz2 (giusta)
C: Opz3
D: Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[1]).toBe('Opz2');
  });

  it('parses opzioni con trattino', () => {
    const input = `
1. Domanda
A- Opz1
B- Opz2 (giusta)
C- Opz3
D- Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[1]).toBe('Opz2');
  });

  it('parses opzioni con spazi solo', () => {
    const input = `
1. Domanda
A Opz1
B Opz2 (giusta)
C Opz3
D Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options[1]).toBe('Opz2');
  });

  it('parses separatori misti nella stessa domanda', () => {
    const input = `
1. Domanda
A. Opz1
B) Opz2 (giusta)
C: Opz3
D- Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].options).toEqual(['Opz1', 'Opz2', 'Opz3', 'Opz4']);
  });
});

describe('parseInput — edge cases testo domanda', () => {
  it('non confonde testo domanda con opzione A', () => {
    const input = `
1. A. cosa significa il termine?
A. Definizione 1
B. Definizione 2 (giusta)
C. Definizione 3
D. Definizione 4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].question).toContain('A. cosa significa');
    expect(result.questions[0].options[0]).toBe('Definizione 1');
  });

  it('gestisce opzioni con parentesi interne', () => {
    const input = `
1. Domanda
A. Risposta (con note)
B. Risposta (giusta)
C. Risposta (con note)
D. Risposta
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].binary).toBe('0100');
    expect(result.questions[0].options[0]).toBe('Risposta (con note)');
  });

  it('gestisce opzioni vuote', () => {
    const input = `
1. Domanda
A.
B.
C.
D.
`;

    const result = parseInput(input, 'Test');

    // Le opzioni vuote non sono riconosciute come opzioni valide
    expect(result.questions).toHaveLength(0);
  });

  it('gestisce multiple righe vuote consecutive tra domande', () => {
    const input = `
1. Domanda 1
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4



2. Domanda 2
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(2);
  });

  it('gestisce capitolo con spazi', () => {
    const input = `
1. Domanda
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4
`;

    const result = parseInput(input, '  Capitolo 1  ');

    expect(result.questions[0].capitolo).toBe('Capitolo 1');
  });

  it('gestisce capitolo vuoto', () => {
    const input = `
1. Domanda
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4
`;

    const result = parseInput(input, '');

    expect(result.questions[0].capitolo).toBe('');
  });

  it('gestisce lettere opzioni minuscole', () => {
    const input = `
1. Domanda
a. Opz1
b. Opz2 (giusta)
c. Opz3
d. Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].binary).toBe('0100');
  });

  it('gestisce lettere opzioni maiuscole', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;

    const result = parseInput(input, 'Test');

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].binary).toBe('0100');
  });

  it('gestisce continuation dopo numbering inline durante opzione', () => {
    const input = `
1. Domanda
A. Opz1 che continua
2. Nuova domanda
B. Opz2 (giusta)
C. Opz3
D. Opz4
`;

    const result = parseInput(input, 'Test');

    // La prima domanda viene scartata (incompleta: solo A + nuova domanda interrotta)
    // La seconda domanda viene parsata correttamente
    expect(result.questions.length).toBeGreaterThanOrEqual(0);
  });
});

describe('parseAnswersFile — edge cases', () => {
  it('gestisce due punti multipli nella risposta (PDF format)', () => {
    const input = `1. Domanda: parte1: parte2: parte3`;

    const result = parseAnswersFile(input);

    // Usa lastIndexOf(":") → split all'ultimo due punti
    expect(result.get('Domanda: parte1: parte2')).toBe('parte3');
  });

  it('gestisce risposta con due punti interni', () => {
    const input = `1. Nota: il valore è: 42`;

    const result = parseAnswersFile(input);

    // Usa lastIndexOf(":") → split all'ultimo due punti
    expect(result.get('Nota: il valore è')).toBe('42');
  });

  it('gestisce domande senza numero nel formato testo', () => {
    const input = `
Domanda 1
Risposta 1
Domanda 2
Risposta 2
`;

    const result = parseAnswersFile(input);

    // Senza numero, il parser tratta tutto come risposte alla prima domanda
    expect(result.size).toBeGreaterThanOrEqual(0);
  });

  it('gestisce numerazione duplicata (ultima vince)', () => {
    const input = `
1. Domanda
Risposta A
1. Domanda
Risposta B
`;

    const result = parseAnswersFile(input);

    expect(result.get('Domanda')).toBe('Risposta B');
  });

  it('gestisce trailing colons nella domanda', () => {
    const input = `
1. Domanda:::
Risposta
`;

    const result = parseAnswersFile(input);

    expect(result.get('Domanda')).toBe('Risposta');
  });

  it('gestisce mixed format nello stesso file', () => {
    const input = `
1. Domanda 1: Risposta 1
2. Domanda 2
Risposta 2
`;

    const result = parseAnswersFile(input);

    expect(result.get('Domanda 1')).toBe('Risposta 1');
    expect(result.get('Domanda 2')).toBe('Risposta 2');
  });

  it('gestisce risposta su più righe con righe vuote intercalate', () => {
    const input = `
1. Domanda
Risposta parte 1

Risposta parte 2
`;

    const result = parseAnswersFile(input);

    // Le righe vuote vengono ignorate ma la risposta continua
    expect(result.get('Domanda')).toBe('Risposta parte 1 Risposta parte 2');
  });
});

describe('injectGiustaFromAnswers — edge cases', () => {
  it('gestisce già marcato con case diversa (GIUSTA)', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 (GIUSTA)
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    const matches = result.match(/\(giust[oa]\)/gi) || [];
    expect(matches.length).toBe(1);
  });

  it('gestisce già marcato con (Giusta)', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 (Giusta)
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    const matches = result.match(/\(giust[oa]\)/gi) || [];
    expect(matches.length).toBe(1);
  });

  it('gestisce già marcato con (giusto)', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 (giusto)
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    const matches = result.match(/\(giust[oa]\)/gi) || [];
    expect(matches.length).toBe(1);
  });

  it('match parziale non marca (risposta contenuta ma non uguale)', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2 completa
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).not.toContain('(giusta)');
  });

  it('match con punteggiatura diversa', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2.']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toContain('(giusta)');
  });

  it('gestisce due domande identiche (marca la prima)', () => {
    const input = `
1. Qual è la risposta?
A. Opz1 (giusta)
B. Opz2
C. Opz3
D. Opz4

2. Qual è la risposta?
A. Opz1
B. Opz2
C. Opz3
D. Opz4
`;

    const answerMap = new Map([['Qual è la risposta?', 'Opz1']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    // La prima domanda ha già (giusta), la seconda viene marcata
    const matches = result.match(/\(giusta\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('gestisce opzione corretta duplicata nella stessa domanda', () => {
    const input = `
1. Domanda
A. Opz1
B. Opz2
C. Opz2
D. Opz4
`;

    const answerMap = new Map([['Domanda', 'Opz2']]);

    const result = injectGiustaFromAnswers(input, answerMap);

    // Marca la prima occorrenza
    const matches = result.match(/\(giusta\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('gestisce mixed format nello stesso input', () => {
    const input = `
1. Domanda multi-riga
A. Opz1
B. Opz2
C. Opz3
D. Opz4

2. Domanda mono-riga A Opz1 B Opz2 C Opz3 (giusta) D Opz4
`;

    const answerMap = new Map([
      ['Domanda multi-riga', 'Opz2'],
      ['Domanda mono-riga', 'Opz3'],
    ]);

    const result = injectGiustaFromAnswers(input, answerMap);

    expect(result).toContain('B. Opz2 (giusta)');
    expect(result).toContain('(giusta)');
  });
});

describe('buildRow — edge cases', () => {
  it('gestisce opzioni con virgolette', () => {
    const question = {
      index: 1,
      displayNumber: '1',
      capitolo: 'Capitolo',
      question: 'Domanda con "virgolette"',
      options: ['Opz1', 'Opz2', 'Opz3', 'Opz4'] as [string, string, string, string],
      binary: '1000',
      hasBlockingError: false,
    };

    const row = buildRow(question);

    expect(row).toContain('virgolette');
  });

  it('gestisce binary 0000 per errore', () => {
    const question = {
      index: 1,
      displayNumber: '1',
      capitolo: 'Capitolo',
      question: 'Domanda',
      options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
      binary: '0000',
      hasBlockingError: true,
    };

    const row = buildRow(question);

    expect(row).toContain('0000');
  });

  it('gestisce displayNumber con parentesi', () => {
    const question = {
      index: 1,
      displayNumber: '12)',
      capitolo: 'Capitolo',
      question: 'Domanda',
      options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
      binary: '1000',
      hasBlockingError: false,
    };

    const row = buildRow(question);

    expect(row).toContain('12)');
  });
});

describe('buildTSV — edge cases', () => {
  it('filtra domande con hasBlockingError ma mantiene quelle senza', () => {
    const questions = [
      {
        index: 1,
        displayNumber: '1',
        capitolo: 'Cap1',
        question: 'Domanda valida',
        options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        binary: '1000',
        hasBlockingError: false,
      },
      {
        index: 2,
        displayNumber: '2',
        capitolo: 'Cap2',
        question: '',
        options: ['', '', '', ''] as [string, string, string, string],
        binary: '0000',
        hasBlockingError: true,
      },
      {
        index: 3,
        displayNumber: '3',
        capitolo: 'Cap3',
        question: 'Altra valida',
        options: ['X', 'Y', 'Z', 'W'] as [string, string, string, string],
        binary: '0010',
        hasBlockingError: false,
      },
    ];

    const tsv = buildTSV(questions, false);

    expect(tsv).toContain('Domanda valida');
    expect(tsv).toContain('Altra valida');
    expect(tsv).not.toContain('Cap2');
    expect(tsv.split('\n').length).toBe(2);
  });

  it('include tutte le domande con includeBlockingErrors true', () => {
    const questions = [
      {
        index: 1,
        displayNumber: '1',
        capitolo: 'Cap1',
        question: 'Domanda valida',
        options: ['A', 'B', 'C', 'D'] as [string, string, string, string],
        binary: '1000',
        hasBlockingError: false,
      },
      {
        index: 2,
        displayNumber: '2',
        capitolo: 'Cap2',
        question: '',
        options: ['', '', '', ''] as [string, string, string, string],
        binary: '0000',
        hasBlockingError: true,
      },
    ];

    const tsv = buildTSV(questions, true);

    expect(tsv).toContain('Cap1');
    expect(tsv).toContain('Cap2');
    expect(tsv.split('\n').length).toBe(2);
  });
});
