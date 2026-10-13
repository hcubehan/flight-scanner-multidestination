export function validate(input, today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date())) {
  for (const key of ['departure', 'return']) {
    const date = input[key];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new Error(`${key} must be a valid YYYY-MM-DD date.`);
  }
  if (input.departure < today) throw new Error('Departure must be today or later (Singapore time).');
  if (input.return <= input.departure) throw new Error('Return must be after departure.');
  if (!Number.isInteger(input.adults) || input.adults < 1 || input.adults > 9) throw new Error('Adults must be between 1 and 9.');
  if (!input.destinations.length || input.destinations.length > 20 || input.destinations.some(d => typeof d !== 'string' || !d.trim() || d.length > 100 || /[\x00-\x1f]/.test(d) || /^(SIN|Singapore)$/i.test(d.trim()))) throw new Error('Provide 1–20 destination city names or IATA codes other than Singapore.');
  return { ...input, destinations: [...new Map(input.destinations.map(d => [d.toLowerCase(), d])).values()] };
}

export function rankOffers(data, input, destination) {
  const unique = new Map();
  for (const offer of data.data || []) {
    const legs = offer.itineraries;
    if (!Array.isArray(legs) || legs.length !== 2 || legs.some(l => l.segments?.length !== 1 || l.segments[0].numberOfStops !== 0)) continue;
    const [out, back] = legs.map(l => l.segments[0]);
    if (out.departure.iataCode !== 'SIN' || back.arrival.iataCode !== 'SIN' || out.arrival.iataCode !== back.departure.iataCode) continue;
    if (data.destinationCodes && !data.destinationCodes.includes(out.arrival.iataCode)) continue;
    if (out.departure.at.slice(0, 10) !== input.departure || back.departure.at.slice(0, 10) !== input.return) continue;
    const total = Number(offer.price?.grandTotal ?? offer.price?.total);
    if (offer.price?.currency !== 'SGD' || !Number.isFinite(total) || total <= 0) continue;
    const key = JSON.stringify(legs.map(l => l.segments.map(s => [s.carrierCode, s.number, s.departure, s.arrival])));
    const baggage = (offer.travelerPricings || []).flatMap(t => (t.fareDetailsBySegment || []).map(f => ({ segmentId: f.segmentId, travelerId: t.travelerId, checked: f.includedCheckedBags ?? null })));
    const row = { destination, total, perAdult: Math.round(total / input.adults * 100) / 100, currency: 'SGD', outbound: { ...out, duration: legs[0].duration }, inbound: { ...back, duration: legs[1].duration }, airlines: [...new Set([out.carrierCode, back.carrierCode])].map(c => data.dictionaries?.carriers?.[c] || c), baggage, offerId: offer.id, ...(offer.quote ? { quote: offer.quote } : {}) };
    if (!unique.has(key) || unique.get(key).total > total) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => a.total - b.total || a.outbound.departure.at.localeCompare(b.outbound.departure.at)).slice(0, 5);
}

export async function scan(input, provider) {
  const results = [];
  // Sequential calls avoid bursts against provider rate limits and isolate route failures.
  for (const destination of input.destinations) {
    try {
      const data = await provider.search(input, destination);
      if (!Array.isArray(data.data)) throw new Error('Provider returned an invalid offers response.');
      const offers = rankOffers(data, input, destination);
      results.push({ destination, status: offers.length ? 'ok' : 'empty', offers, resolvedPlace: data.resolvedPlace, retrievedAt: data.retrievedAt });
    } catch (error) { results.push({ destination, status: 'error', error: error.message, offers: [] }); }
  }
  results.sort((a, b) => (a.offers[0]?.total ?? Infinity) - (b.offers[0]?.total ?? Infinity));
  return { searchedAt: new Date().toISOString(), mode: provider.mode, origin: 'SIN', ...input, results, recommendation: results.find(r => r.offers.length)?.destination ?? null, notice: 'Cheapest returned nonstop round-trip offers, not a whole-market guarantee. Fares can change; confirm price and baggage before booking. All prices are in SGD for all adults. Flight times are airport-local.' };
}
