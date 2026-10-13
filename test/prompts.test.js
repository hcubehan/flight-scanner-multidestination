import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable, Writable } from 'node:stream';
import { collectAnswers } from '../src/prompts.js';

function outputBuffer() {
  let text = '';
  return { output: new Writable({ write(chunk, encoding, callback) { text += chunk; callback(); } }), text: () => text };
}
test('asks destinations then departure then return and accepts piped answers', async () => {
  const buffer = outputBuffer();
  const result = await collectAnswers({}, Readable.from(['BKK,DPS\n2027-01-10\n2027-01-17\n']), buffer.output);
  assert.deepEqual(result, { destinations: 'BKK,DPS', departure: '2027-01-10', return: '2027-01-17' });
  const text = buffer.text();
  assert.ok(text.indexOf('Tell me the destinations you want to go.') < text.indexOf('fly-off date'));
  assert.ok(text.indexOf('fly-off date') < text.indexOf('return date'));
});
test('skips supplied flags and reprompts empty answers', async () => {
  const buffer = outputBuffer();
  const result = await collectAnswers({ destinations: 'NRT', departure: '2027-01-10' }, Readable.from(['\n2027-01-17\n']), buffer.output);
  assert.equal(result.return, '2027-01-17');
  assert.ok(!buffer.text().includes('Tell me'));
  assert.ok(buffer.text().includes('Please enter an answer.'));
});
test('reports incomplete input instead of waiting forever', async () => {
  const buffer = outputBuffer();
  await assert.rejects(collectAnswers({}, Readable.from(['BKK\n']), buffer.output), /Input ended/);
});
