import { setTimeout as delay } from 'node:timers/promises';
import { normalizeName } from './destinations.js';

const ROOT = 'https://partners.api.skyscanner.net/apiservices/v3';
const maps = ['itineraries', 'legs', 'segments', 'places', 'carriers', 'agents'];
const divisors = { PRICE_UNIT_WHOLE: 1, PRICE_UNIT_CENTI: 100, PRICE_UNIT_MILLI: 1000, PRICE_UNIT_MICRO: 1000000 };

export function priceAmount(price) {
  const divisor = divisors[price?.unit];
  if (!divisor || !/^\d+(\.\d+)?$/.test(String(price?.amount))) return null;
  const number = Number(price.amount) / divisor;
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function mergeResults(previous, response) {
  if (response.action === 'RESULT_ACTION_NOT_MODIFIED') return previous;
  if (response.action === 'RESULT_ACTION_OMITTED') throw new Error('Skyscanner omitted flight results.');
  const next = response.content?.results;
  if (!next) {
    if (response.status === 'RESULT_STATUS_COMPLETE' && !Object.keys(previous).length) throw new Error('Skyscanner completed without a results object.');
    return previous;
  }
  if (response.action === 'RESULT_ACTION_REPLACED') return structuredClone(next);
  const merged = { ...previous };
  for (const key of maps) merged[key] = { ...previous[key], ...next[key] };
  return merged;
}

export function choosePlace(places, term) {
  if (!Array.isArray(places)) throw new Error('Skyscanner returned an invalid place response.');
  const normalized = normalizeName(term);
  const code = /^[A-Z]{3}$/i.test(term);
  const matches = places.filter(p => p.entityId && (code ? p.iataCode?.toUpperCase() === term.toUpperCase() : p.type === 'PLACE_TYPE_CITY' && normalizeName(p.name) === normalized));
  const unique = [...new Map(matches.map(p => [p.entityId, p])).values()];
  if (unique.length !== 1) {
    const candidates = places.filter(p => p.type === 'PLACE_TYPE_CITY' || p.type === 'PLACE_TYPE_AIRPORT').slice(0, 8).map(p => `${p.name} (${p.countryName || p.countryId || 'country unknown'}${p.iataCode ? `, ${p.iataCode}` : ''})`).join('; ');
    throw new Error(`Cannot uniquely resolve "${term}". ${candidates ? `Candidates: ${candidates}. Specify an airport code to disambiguate.` : 'No matching city found; check spelling or use an airport code.'}`);
  }
  return unique[0];
}

function dateObject(date) {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}
function localTime(value) {
  if (!value || ![value.year, value.month, value.day, value.hour, value.minute].every(Number.isInteger)) return null;
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}T${String(value.hour).padStart(2, '0')}:${String(value.minute).padStart(2, '0')}:${String(value.second || 0).padStart(2, '0')}`;
}
function safeLink(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

export function normalizeResults(results, input, place, retrievedAt) {
  const data = [];
  const carriers = Object.fromEntries(Object.entries(results.carriers || {}).map(([id, c]) => [c.iata || id, c.name || c.iata || id]));
  const destinationCodes = new Set();
  for (const [id, itinerary] of Object.entries(results.itineraries || {})) {
    if (itinerary.legIds?.length !== 2) continue;
    const legs = itinerary.legIds.map(key => results.legs?.[key]);
    if (legs.some(l => !l || l.stopCount !== 0 || l.segmentIds?.length !== 1)) continue;
    const segments = legs.map(l => results.segments?.[l.segmentIds[0]]);
    if (segments.some(s => !s)) continue;
    const airports = segments.map(s => [results.places?.[s.originPlaceId], results.places?.[s.destinationPlaceId]]);
    if (airports.flat().some(p => !p?.iata)) continue;
    // City-level searches must stay inside the resolved city, never a nearby city.
    const matches = p => String(p.entityId) === String(place.entityId) || String(p.parentId) === String(place.entityId);
    if (!matches(airports[0][1]) || !matches(airports[1][0])) continue;
    const times = segments.map(s => [localTime(s.departureDateTime), localTime(s.arrivalDateTime)]);
    if (times.flat().some(t => !t)) continue;
    const itineraries = segments.map((s, i) => ({ duration: `PT${legs[i].durationInMinutes}M`, segments: [{ id: legs[i].segmentIds[0], numberOfStops: legs[i].stopCount, carrierCode: results.carriers?.[s.marketingCarrierId]?.iata || s.marketingCarrierId, number: s.marketingFlightNumber, departure: { iataCode: airports[i][0].iata, at: times[i][0] }, arrival: { iataCode: airports[i][1].iata, at: times[i][1] } }] }));
    for (const option of itinerary.pricingOptions || []) {
      const total = priceAmount(option.price);
      // Multiple separate purchases cannot be represented by one quote link.
      if (total === null || option.items?.length !== 1 || !safeLink(option.items[0].deepLink)) continue;
      const seller = results.agents?.[option.items[0].agentId]?.name || option.items[0].agentId;
      destinationCodes.add(airports[0][1].iata);
      data.push({ id, price: { grandTotal: String(total), currency: 'SGD' }, itineraries, quote: { source: 'Skyscanner Flights Live Prices', retrievedAt, seller, bookingUrl: safeLink(option.items[0].deepLink), priceUpdateStatus: option.price.updateStatus || 'unknown', baggage: option.pricingOptionFare || null, basis: 'round-trip total for requested adults', itineraryId: id } });
    }
  }
  return { data, dictionaries: { carriers }, destinationCodes: [...destinationCodes], resolvedPlace: { name: place.name, country: place.countryName, entityId: place.entityId, type: place.type }, retrievedAt };
}

export class SkyscannerProvider {
  mode = 'skyscanner-live';
  constructor(env = process.env, fetcher = fetch, sleep = delay, maxPolls = 30) {
    if (!env.SKYSCANNER_API_KEY) throw new Error('Set SKYSCANNER_API_KEY to an approved Skyscanner partner key. The skyscanner-flight-quotes skill also supports browser searches without an API key.');
    this.key = env.SKYSCANNER_API_KEY;
    this.fetch = fetcher;
    this.sleep = sleep;
    this.maxPolls = maxPolls;
  }
  async request(path, body) {
    const response = await this.fetch(ROOT + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': this.key }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Skyscanner HTTP ${response.status}${response.status === 429 ? ': rate limited; retry later' : response.status === 401 || response.status === 403 ? ': check partner API access' : ''}.`);
    return response.json();
  }
  async resolve(term) {
    const response = await this.request('/autosuggest/flights', { query: { market: 'SG', locale: 'en-GB', searchTerm: term, includedEntityTypes: ['PLACE_TYPE_CITY', 'PLACE_TYPE_AIRPORT'] }, limit: 20, isDestination: true });
    return choosePlace(response.places, term);
  }
  async search(input, destination) {
    if (input.adults > 8) throw new Error('Skyscanner supports at most 8 adults per search.');
    const term = normalizeName(destination) === 'xian' ? "Xi'an" : destination;
    const place = await this.resolve(term);
    const target = { entityId: String(place.entityId) };
    const origin = { iata: 'SIN' };
    let response = await this.request('/flights/live/search/create', { query: { market: 'SG', locale: 'en-GB', currency: 'SGD', cabinClass: 'CABIN_CLASS_ECONOMY', adults: input.adults, childrenAges: [], nearbyAirports: false, queryLegs: [{ originPlaceId: origin, destinationPlaceId: target, date: dateObject(input.departure) }, { originPlaceId: target, destinationPlaceId: origin, date: dateObject(input.return) }] } });
    let results = {};
    let polls = 0;
    const degradation = new Set();
    const token = response.sessionToken;
    while (true) {
      for (const reason of response.degradationReasons || []) if (reason !== 'DEGRADATION_REASON_UNSPECIFIED') degradation.add(reason);
      if (response.status === 'RESULT_STATUS_FAILED') throw new Error('Skyscanner flight search failed.');
      results = mergeResults(results, response);
      if (response.status === 'RESULT_STATUS_COMPLETE') break;
      if (response.status !== 'RESULT_STATUS_INCOMPLETE') throw new Error('Skyscanner returned an unknown search status.');
      if (!token) throw new Error('Skyscanner did not return a search session token.');
      if (polls++ >= this.maxPolls) throw new Error('Skyscanner search remained incomplete; no partial fares quoted. Retry later.');
      await this.sleep(2000);
      response = await this.request(`/flights/live/search/poll/${encodeURIComponent(token)}`);
    }
    if (degradation.size) throw new Error(`Skyscanner reported degraded search coverage (${[...degradation].join(', ')}); retry before comparing destinations.`);
    return normalizeResults(results, input, place, new Date().toISOString());
  }
}
