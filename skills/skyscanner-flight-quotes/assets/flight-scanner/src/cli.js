import { parseArgs } from 'node:util';
import { writeFile } from 'node:fs/promises';
import { validate, scan } from './scanner.js';
import { AmadeusProvider, DemoProvider } from './providers.js';
import { collectAnswers } from './prompts.js';
import { parseDestinations } from './destinations.js';
import { SkyscannerProvider } from './skyscanner.js';

try {
  const { values } = parseArgs({ options: { departure: { type: 'string' }, return: { type: 'string' }, destinations: { type: 'string' }, adults: { type: 'string', default: '1' }, provider: { type: 'string', default: 'skyscanner' }, demo: { type: 'boolean' }, json: { type: 'boolean' }, output: { type: 'string' }, help: { type: 'boolean', short: 'h' } } });
  if (values.help) {
    console.log('Flight Scanner\nnode src/cli.js [--demo]\nAsks for city names, fly-off date and return date, in that order.\nFor automation: node src/cli.js --departure YYYY-MM-DD --return YYYY-MM-DD --destinations "Chengdu,Nanjing,Hangzhou,Xi an,Xiamen" [--adults 1] [--provider skyscanner|amadeus] [--demo] [--json] [--output report.json]\nExact dates, economy, nonstop round trips from SIN. Default provider: Skyscanner (SKYSCANNER_API_KEY).');
  } else {
    const answers = await collectAnswers(values);
    const input = validate({ departure: answers.departure, return: answers.return, destinations: parseDestinations(answers.destinations || ''), adults: Number(values.adults) });
    if (!['skyscanner', 'amadeus'].includes(values.provider)) throw new Error('--provider must be skyscanner or amadeus.');
    const report = await scan(input, values.demo ? new DemoProvider() : values.provider === 'skyscanner' ? new SkyscannerProvider() : new AmadeusProvider());
    if (values.output) await writeFile(values.output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    if (values.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`\nFlight Scanner | ${report.mode} | ${input.departure} → ${input.return} | ${input.adults} adult(s)`);
      if (values.demo) console.log('DEMO ONLY — fictional airlines, schedules and fares.');
      if (report.mode === 'amadeus-test') console.log('TEST ENVIRONMENT — limited test data; not reliable booking fares.');
      console.log(report.notice + '\n');
      for (const route of report.results) {
        console.log(`SIN ↔ ${route.destination}`);
        if (route.resolvedPlace) console.log(`  Resolved destination: ${route.resolvedPlace.name}${route.resolvedPlace.country ? `, ${route.resolvedPlace.country}` : ''}${route.resolvedPlace.codes ? ` (${route.resolvedPlace.codes.join(', ')})` : ''}`);
        if (route.status === 'error') console.log(`  Search failed: ${route.error}`);
        else if (!route.offers.length) console.log('  No qualifying offers returned.');
        route.offers.forEach((o, i) => {
          console.log(`  ${i + 1}. SGD ${o.total.toFixed(2)} total | ${o.airlines.join(' / ')} | SGD ${o.perAdult.toFixed(2)} per adult`);
          for (const leg of [o.outbound, o.inbound]) console.log(`     ${leg.carrierCode}${leg.number} ${leg.departure.iataCode} ${leg.departure.at} → ${leg.arrival.iataCode} ${leg.arrival.at} (${leg.duration})`);
          console.log(`     Checked baggage: ${o.quote?.baggage ? JSON.stringify(o.quote.baggage) : o.baggage.length ? JSON.stringify(o.baggage) : 'not supplied; verify with airline'}`);
          if (o.quote) console.log(`     ${o.quote.source} | ${o.quote.seller} | retrieved ${o.quote.retrievedAt}\n     Quote link: ${o.quote.bookingUrl}`);
        });
        console.log('');
      }
      console.log(report.recommendation ? `Lowest returned fare destination: ${report.recommendation}. Compare schedules and baggage before choosing.` : 'No destination recommendation available.');
      if (report.results.some(r => r.status === 'error')) console.log('Comparison is incomplete because one or more destination searches failed.');
    }
    if (report.results.every(r => r.status === 'error')) process.exitCode = 1;
  }
} catch (error) { console.error(`Error: ${error.message}`); process.exitCode = 1; }
