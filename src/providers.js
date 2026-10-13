import { localDestination } from './destinations.js';

export class AmadeusProvider {
  constructor(env = process.env, fetcher = fetch) {
    if (!env.AMADEUS_CLIENT_ID || !env.AMADEUS_CLIENT_SECRET) throw new Error('Set AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET, or use --demo.');
    const environment = env.AMADEUS_ENV || 'test';
    if (!['test', 'production'].includes(environment)) throw new Error('AMADEUS_ENV must be test or production.');
    this.base = environment === 'production' ? 'https://api.amadeus.com' : 'https://test.api.amadeus.com';
    this.mode = `amadeus-${environment}`;
    this.env = env;
    this.fetch = fetcher;
  }
  async request(path, options) {
    const response = await this.fetch(this.base + path, { ...options, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Amadeus HTTP ${response.status}${response.status === 429 ? ': rate limit reached; retry later' : ''}.`);
    return response.json();
  }
  async authenticate() {
    if (this.token && Date.now() < this.expires) return;
    const token = await this.request('/v1/security/oauth2/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.env.AMADEUS_CLIENT_ID, client_secret: this.env.AMADEUS_CLIENT_SECRET }) });
    if (!token.access_token) throw new Error('Amadeus authentication failed.');
    this.token = token.access_token;
    this.expires = Date.now() + Math.max(0, Number(token.expires_in || 0) - 60) * 1000;
  }
  async search(input, destination) {
    const place = localDestination(destination);
    const combined = { data: [], dictionaries: { carriers: {} }, resolvedPlace: place, destinationCodes: place.codes };
    for (const code of place.codes) {
      const response = await this.searchAirport(input, code);
      if (!Array.isArray(response.data)) throw new Error('Amadeus returned an invalid offers response.');
      combined.data.push(...response.data);
      Object.assign(combined.dictionaries.carriers, response.dictionaries?.carriers);
    }
    combined.retrievedAt = new Date().toISOString();
    return combined;
  }
  async searchAirport(input, destination) {
    await this.authenticate();
    const query = new URLSearchParams({ originLocationCode: 'SIN', destinationLocationCode: destination, departureDate: input.departure, returnDate: input.return, adults: String(input.adults), nonStop: 'true', currencyCode: 'SGD', travelClass: 'ECONOMY', max: '250' });
    return this.request(`/v2/shopping/flight-offers?${query}`, { headers: { Authorization: `Bearer ${this.token}` } });
  }
}

export class DemoProvider {
  mode = 'demo-synthetic';
  async search(input, destination) {
    const place = localDestination(destination);
    destination = place.codes[0];
    const seed = [...destination].reduce((n, c) => n + c.charCodeAt(0), 0);
    return { resolvedPlace: place, destinationCodes: [destination], dictionaries: { carriers: { ZZ: 'Example Air (fictional)' } }, data: Array.from({ length: 7 }, (_, i) => ({
      id: `demo-${destination}-${i}`, price: { currency: 'SGD', grandTotal: ((160 + seed % 120 + i * 23) * input.adults).toFixed(2) },
      itineraries: [['SIN', destination, input.departure], [destination, 'SIN', input.return]].map(([from, to, date], j) => ({ duration: 'PT3H', segments: [{ id: String(j + 1), carrierCode: 'ZZ', number: String(100 + i * 2 + j), numberOfStops: 0, departure: { iataCode: from, at: `${date}T${String(8 + i).padStart(2, '0')}:00:00` }, arrival: { iataCode: to, at: `${date}T${String(11 + i).padStart(2, '0')}:00:00` } }] }))
    })) };
  }
}
