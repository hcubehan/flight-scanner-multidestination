import { createInterface } from 'node:readline';

// An iterator preserves pasted or piped answers arriving before the next prompt.
export async function collectAnswers(values, input = process.stdin, output = process.stderr) {
  if (values.destinations !== undefined && values.departure !== undefined && values.return !== undefined) return values;
  const reader = createInterface({ input, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  const answers = { ...values };
  try {
    for (const [key, question] of [
      ['destinations', 'Tell me the destinations you want to go.'],
      ['departure', 'What is your fly-off date? (YYYY-MM-DD)'],
      ['return', 'What is your return date? (YYYY-MM-DD)'],
    ]) {
      if (answers[key] !== undefined) continue;
      output.write(`${question}\n`);
      if (key === 'destinations') output.write('Enter comma-separated city names, e.g. Chengdu, Nanjing, Hangzhou, Xi an, Xiamen. Airport codes also work.\n');
      while (true) {
        output.write('> ');
        const next = await lines.next();
        if (next.done) throw new Error('Input ended before all questions were answered.');
        const answer = next.value.trim();
        if (answer) { answers[key] = answer; break; }
        output.write('Please enter an answer.\n');
      }
    }
    return answers;
  } finally { reader.close(); }
}
