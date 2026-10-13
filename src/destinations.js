// Offline entries cover the initial destinations. Live Skyscanner resolves other
// names with Autosuggest instead of guessing airport codes.
const cities = [
  { name: 'Chengdu', codes: ['TFU', 'CTU'], aliases: ['成都'] },
  { name: 'Nanjing', codes: ['NKG'], aliases: ['南京'] },
  { name: 'Hangzhou', codes: ['HGH'], aliases: ['杭州'] },
  { name: 'Xi’an', codes: ['XIY'], aliases: ['Xi an', "Xi'an", 'Xian', '西安'] },
  { name: 'Xiamen', codes: ['XMN'], aliases: ['厦门'] },
];

export const normalizeName = value => value.normalize('NFKC').toLowerCase().replace(/[\s'’‘-]+/g, '').trim();

export function localDestination(value) {
  const city = cities.find(c => [c.name, ...c.aliases].some(a => normalizeName(a) === normalizeName(value)));
  if (city) return { ...city };
  if (/^[a-z]{3}$/i.test(value)) return { name: value.toUpperCase(), codes: [value.toUpperCase()] };
  throw new Error(`City "${value}" is not in the offline city list. Use --provider skyscanner for live city-name lookup, or enter an IATA code.`);
}

export function parseDestinations(text) {
  return text.split(/[,;\n]/).map(s => s.trim()).filter(Boolean).map(s => {
    try { return localDestination(s).name; } catch { return s; }
  });
}
