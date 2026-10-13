import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDestinations, localDestination } from '../src/destinations.js';
import { SkyscannerProvider, choosePlace, mergeResults, normalizeResults, priceAmount } from '../src/skyscanner.js';
import { rankOffers } from '../src/scanner.js';

const input = { departure: '2027-03-12', return: '2027-03-20', adults: 2, destinations: ['Chengdu'] };
const place = { entityId: 'city', name: 'Chengdu', type: 'PLACE_TYPE_CITY', countryName: 'China' };
const time = day => ({ year: 2027, month: 3, day, hour: 10, minute: 0 });
function fixture() {
  return {
    places: { sin: { entityId: 'singapore-airport', iata: 'SIN' }, tfu: { entityId: 'tianfu', parentId: 'city', iata: 'TFU' } },
    carriers: { airline: { name: 'Fixture Airline', iata: 'ZZ' } }, agents: { seller: { name: 'Fixture Seller' } },
    segments: { out: { originPlaceId: 'sin', destinationPlaceId: 'tfu', departureDateTime: time(12), arrivalDateTime: time(12), marketingCarrierId: 'airline', marketingFlightNumber: '100' }, back: { originPlaceId: 'tfu', destinationPlaceId: 'sin', departureDateTime: time(20), arrivalDateTime: time(20), marketingCarrierId: 'airline', marketingFlightNumber: '101' } },
    legs: { out: { stopCount: 0, segmentIds: ['out'], durationInMinutes: 240 }, back: { stopCount: 0, segmentIds: ['back'], durationInMinutes: 240 } },
    itineraries: { trip: { legIds: ['out', 'back'], pricingOptions: [{ price: { amount: '620000', unit: 'PRICE_UNIT_MILLI' }, items: [{ agentId: 'seller', deepLink: 'https://example.com/quote' }] }, { price: { amount: '61000', unit: 'PRICE_UNIT_CENTI' }, items: [{ agentId: 'seller', deepLink: 'https://example.com/cheaper' }] }] } },
  };
}
test('full city names, aliases, mixed codes and multiple Chengdu airports', () => {
  assert.deepEqual(parseDestinations('Chengdu, Nanjing, Hangzhou, Xi an, Xiamen'), ['Chengdu', 'Nanjing', 'Hangzhou', 'Xi’an', 'Xiamen']);
  assert.deepEqual(localDestination('CHENGDU').codes, ['TFU', 'CTU']);
  assert.equal(localDestination("Xi'an").codes[0], 'XIY');
  assert.equal(parseDestinations('Paris, nrt')[1], 'NRT');
  assert.throws(() => localDestination('Atlantis'), /not in the offline/);
});
test('city lookup requires unique exact matches rather than fuzzy first suggestion', () => {
  assert.equal(choosePlace([place], 'Chengdu'), place);
  assert.throws(() => choosePlace([place, { ...place, entityId: 'other', countryName: 'Other country' }], 'Chengdu'), /uniquely resolve/);
  assert.throws(() => choosePlace([place], 'Cheng'), /uniquely resolve/);
});
test('normalizes all supported price units and rejects unknown or invalid units', () => {
  for (const [unit, amount] of [['WHOLE', '123.45'], ['CENTI', '12345'], ['MILLI', '123450'], ['MICRO', '123450000']]) assert.equal(priceAmount({ unit: `PRICE_UNIT_${unit}`, amount }), 123.45);
  assert.equal(priceAmount({ unit: 'PRICE_UNIT_UNSPECIFIED', amount: '1' }), null);
  assert.equal(priceAmount({ unit: 'PRICE_UNIT_WHOLE', amount: '-1' }), null);
});
test('retains the cheapest seller quote, party total, link, and retrieval timestamp', () => {
  const rows = rankOffers(normalizeResults(fixture(), input, place, '2026-10-13T12:00:00Z'), input, 'Chengdu');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 610);
  assert.equal(rows[0].perAdult, 305);
  assert.equal(rows[0].quote.bookingUrl, 'https://example.com/cheaper');
  assert.equal(rows[0].quote.seller, 'Fixture Seller');
  assert.equal(rows[0].quote.retrievedAt, '2026-10-13T12:00:00Z');
});
test('excludes connections, wrong cities, dates and non-HTTPS seller links', () => {
  for (const mutate of [r => { r.legs.back.stopCount = 1; }, r => { r.places.tfu.parentId = 'other-city'; }, r => { r.segments.back.departureDateTime.day = 19; }, r => { for (const p of r.itineraries.trip.pricingOptions) p.items[0].deepLink = 'javascript:alert(1)'; }]) {
    const results = fixture(); mutate(results);
    assert.equal(rankOffers(normalizeResults(results, input, place, 'now'), input, 'Chengdu').length, 0);
  }
});
test('poll actions preserve unmodified results and replace stale itineraries', () => {
  const initial = { itineraries: { old: {} }, places: { sin: {} } };
  assert.equal(mergeResults(initial, { action: 'RESULT_ACTION_NOT_MODIFIED' }), initial);
  assert.deepEqual(mergeResults(initial, { action: 'RESULT_ACTION_REPLACED', content: { results: { itineraries: { new: {} } } } }), { itineraries: { new: {} } });
  assert.ok(mergeResults(initial, { content: { results: { itineraries: { new: {} } } } }).itineraries.old);
});
test('API resolves cities, sends exact SGD round trip, waits for complete poll', async () => {
  const calls = [];
  const responses = [{ places: [place] }, { sessionToken: 'mock-token', status: 'RESULT_STATUS_INCOMPLETE', action: 'RESULT_ACTION_REPLACED', content: { results: fixture() } }, { status: 'RESULT_STATUS_COMPLETE', action: 'RESULT_ACTION_NOT_MODIFIED' }];
  const provider = new SkyscannerProvider({ SKYSCANNER_API_KEY: 'fake' }, async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => responses.shift() }; }, async () => {});
  const data = await provider.search(input, 'Chengdu');
  assert.equal(data.data.length, 2);
  const query = JSON.parse(calls[1].options.body).query;
  assert.equal(query.currency, 'SGD'); assert.equal(query.market, 'SG'); assert.equal(query.adults, 2);
  assert.deepEqual(query.queryLegs[0].date, { year: 2027, month: 3, day: 12 });
  assert.deepEqual(query.queryLegs[1].date, { year: 2027, month: 3, day: 20 });
  assert.equal(query.queryLegs[0].destinationPlaceId.entityId, 'city');
  assert.ok(calls[2].url.endsWith('/poll/mock-token'));
});
test('incomplete searches and API errors never become empty successful quotes', async () => {
  const provider = new SkyscannerProvider({ SKYSCANNER_API_KEY: 'fake' }, async url => ({ ok: true, json: async () => url.endsWith('/autosuggest/flights') ? { places: [place] } : { sessionToken: 'token', status: 'RESULT_STATUS_INCOMPLETE' } }), async () => {}, 0);
  await assert.rejects(provider.search(input, 'Chengdu'), /incomplete/);
  const rateLimited = new SkyscannerProvider({ SKYSCANNER_API_KEY: 'fake' }, async () => ({ ok: false, status: 429 }));
  await assert.rejects(rateLimited.search(input, 'Chengdu'), /rate limited/);
  assert.throws(() => new SkyscannerProvider({}), /partner key/);
});
