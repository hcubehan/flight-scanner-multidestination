import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, rankOffers, scan } from '../src/scanner.js';
import { DemoProvider, AmadeusProvider } from '../src/providers.js';

const input = { departure: '2027-01-10', return: '2027-01-17', adults: 2, destinations: ['BKK', 'DPS'] };
test('validates calendar dates, order, passengers and destinations', () => {
  for (const change of [{ departure: '2027-02-30' }, { return: '2027-01-09' }, { adults: 0 }, { destinations: ['SIN'] }, { destinations: [] }]) assert.throws(() => validate({ ...input, ...change }, '2026-10-13'));
  assert.deepEqual(validate({ ...input, destinations: ['BKK', 'BKK'] }, '2026-10-13').destinations, ['BKK']);
});
test('rejects stops, wrong dates/currency and keeps cheapest unique top five', async () => {
  const data = await new DemoProvider().search(input, 'BKK');
  const clone = i => structuredClone(data.data[i]);
  const duplicate = clone(0); duplicate.price.grandTotal = '100.00';
  const stop = clone(1); stop.itineraries[1].segments[0].numberOfStops = 1; stop.price.grandTotal = '1';
  const connection = clone(2); connection.itineraries[0].segments.push(connection.itineraries[0].segments[0]); connection.price.grandTotal = '1';
  const wrongDate = clone(3); wrongDate.itineraries[0].segments[0].departure.at = '2027-01-11T08:00:00'; wrongDate.price.grandTotal = '1';
  const currency = clone(4); currency.price.currency = 'USD'; currency.price.grandTotal = '1';
  data.data.push(duplicate, stop, connection, wrongDate, currency);
  const ranked = rankOffers(data, input, 'BKK');
  assert.equal(ranked.length, 5);
  assert.equal(ranked[0].total, 100);
  assert.equal(ranked[0].perAdult, 50);
  assert.ok(ranked.every(o => o.total >= 100));
});
test('isolates failures and distinguishes empty results', async () => {
  const provider = { mode: 'mock', async search(_, destination) { if (destination === 'BKK') throw new Error('timeout'); return { data: [] }; } };
  const report = await scan(input, provider);
  assert.equal(report.results[0].status, 'error');
  assert.equal(report.results[1].status, 'empty');
  assert.equal(report.recommendation, null);
});
test('Amadeus sends exact round-trip search filters and reuses token', async () => {
  const calls = [];
  const provider = new AmadeusProvider({ AMADEUS_CLIENT_ID: 'fake', AMADEUS_CLIENT_SECRET: 'fake' }, async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => url.endsWith('/token') ? { access_token: 'fake-token', expires_in: 1800 } : { data: [] } };
  });
  await provider.search(input, 'BKK'); await provider.search(input, 'DPS');
  assert.equal(calls.length, 3);
  const query = new URL(calls[1].url).searchParams;
  for (const [key, value] of Object.entries({ originLocationCode: 'SIN', destinationLocationCode: 'BKK', returnDate: input.return, departureDate: input.departure, nonStop: 'true', currencyCode: 'SGD', adults: '2', max: '250' })) assert.equal(query.get(key), value);
});
