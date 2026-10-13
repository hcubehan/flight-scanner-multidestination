# Singapore Flight Scanner

A command-line agent that accepts full city names and compares exact-date nonstop economy round trips from Singapore Changi (SIN). It returns up to five unique itineraries per destination, sorted by total fare in SGD, and ranks destinations by their cheapest returned offer. Both directions must be nonstop. Requires Node.js 22 or newer; no dependency installation is needed. Skyscanner is the default live provider.

## Try it

Start the question-driven agent:

```powershell
node src/cli.js --demo
```

It asks, in order:

1. Tell me the destinations you want to go.
2. What is your fly-off date? (YYYY-MM-DD)
3. What is your return date? (YYYY-MM-DD)

Enter full city names, such as `Chengdu, Nanjing, Hangzhou, Xi an, Xiamen`. Comma-separated IATA codes also work. Names ignore case; `Xi an`, `Xi'an`, `Xi’an` and `Xian` are accepted aliases. The default is one adult. For live searches, configure the credentials below and run `node src/cli.js`. Flags skip their corresponding questions. Prompts go to stderr, so `--json` keeps stdout machine-readable. Dates and inputs are validated before searching.

You can also provide all answers as flags:

```powershell
node src/cli.js --departure 2027-01-10 --return 2027-01-17 --destinations BKK,DPS,NRT --demo
```

Demo mode uses synthetic fares, fictional airlines and illustrative schedules. It makes no network calls and does not indicate real route availability.

## Real Skyscanner fares

Skyscanner's official API requires an approved partner key: [access requirements](https://developers.skyscanner.net/docs/getting-started/authentication) and [application](https://www.partners.skyscanner.net/contact/travel-api).

```powershell
$env:SKYSCANNER_API_KEY = 'your-approved-partner-key'
node src/cli.js
node src/cli.js --destinations "Chengdu,Nanjing,Hangzhou,Xi an,Xiamen" --departure 2027-03-12 --return 2027-03-20 --provider skyscanner
```

The client uses live Autosuggest to resolve full city names, requests Singapore-market SGD fares for two exact-date query legs, and polls until the search is complete. Ambiguous names return candidate cities/countries; use an airport code to disambiguate in the CLI. City-level search includes airports belonging to the resolved city. Each quote retains seller, HTTPS booking link, retrieval time, price-update status and supplied baggage data. The CLI supports 1–8 adults with Skyscanner. API prices are party totals; per-adult values are calculated averages. It excludes options requiring multiple separate purchases and keeps the cheapest returned seller for each unique itinerary. It does not refresh prices with the retailer or issue tickets.

Polls are two seconds apart, limited to 30 polls per city; each HTTP request has a 30-second timeout. Incomplete searches, degraded coverage, unknown statuses and HTTP failures are explicit route errors. There is no fallback to fake fares. Set the key locally; do not paste it into chat or commit it.

## Reusable Skyscanner skill

Skill source: [skills/skyscanner-flight-quotes/SKILL.md](skills/skyscanner-flight-quotes/SKILL.md). It supports the approved API, an available connected Skyscanner service, and agent-assisted Skyscanner website searches without a partner key. The browser workflow quotes only visibly loaded exact-date results and stops at a CAPTCHA. Browser searches run inside a capable agent session; the terminal CLI uses the API. Invoke an installed skill as `$skyscanner-flight-quotes` in a session that discovers it.

The skill carries a standalone copy of this Node CLI. After changing application files, refresh the skill bundle with `node scripts/bundle-skill.mjs`.

## Optional Amadeus provider

Create an Amadeus for Developers application and configure credentials in your terminal. Do not commit or share credentials.

```powershell
$env:AMADEUS_CLIENT_ID = 'your-client-id'
$env:AMADEUS_CLIENT_SECRET = 'your-client-secret'
$env:AMADEUS_ENV = 'test'
node src/cli.js --provider amadeus --departure 2027-01-10 --return 2027-01-17 --destinations BKK,DPS,NRT --adults 2
```

The default test environment contains limited test data. Once your Amadeus application has production access, use its production credentials and set `AMADEUS_ENV` to `production`. The CLI reads environment variables; it does not automatically load `.env` files.

Use up to 20 comma-separated city names or IATA codes. Skyscanner resolves arbitrary city names online. The offline list used by demo and Amadeus covers Chengdu, Nanjing, Hangzhou, Xi’an and Xiamen, including Chinese aliases; unknown names are reported explicitly. Amadeus searches both TFU and CTU for Chengdu and combines results before ranking. Demo uses illustrative TFU offers. This does not establish real nonstop route availability. City codes such as TYO can include multiple airports. Dates describe departure from Singapore and departure from the destination in airport-local time. Amadeus supports 1–9 adults; Skyscanner supports 1–8. Children, infants, flexible dates and booking are outside this version.

## Save or automate

```powershell
node src/cli.js --departure 2027-01-10 --return 2027-01-17 --destinations BKK,DPS --demo --json
node src/cli.js --departure 2027-01-10 --return 2027-01-17 --destinations BKK,DPS --demo --output comparison.json
node --test
```

JSON includes search time, provider mode, route status, flight segments, baggage details when supplied, total fare and average fare per adult. Output files are created without overwriting existing files. Individual route failures are reported while other routes continue; all routes failing produces exit code 1. An empty route is distinct from a failed search.

## What the ranking means

The agent ranks qualifying returned results. Amadeus retrieves up to 250 offers per queried airport; Skyscanner polls a completed live search. Different sellers/fare bundles for the same itinerary are reduced to the cheapest returned option. It never pads a route to five results. Amadeus prices use `grandTotal`, falling back to `total`; Skyscanner price units are normalized to SGD. Prices are for the whole traveling party; per-adult figures are averages. Optional extras may cost more; missing baggage information means unknown.

The recommendation is based on flight price alone, not accommodation costs or destination preferences. A route failure makes the comparison incomplete. Recheck fares and conditions with the airline before booking; this tool does not issue tickets or provide a guaranteed bookable quote.

Amadeus Self-Service documents coverage exclusions, including low-cost carriers, which matter when comparing holidays from Singapore. This provider therefore cannot guarantee the cheapest whole-market fare. A production rollout aimed at budget airlines needs a provider whose contracted coverage includes those airlines. The provider interface (`mode` and `search(input, destination)`) allows another data source to be added without changing the ranking pipeline.

Official references: [Flight Offers Search specification](https://github.com/amadeus4dev/amadeus-open-api-specification/blob/main/spec/json/FlightOffersSearch_v2_swagger_specification.json), [flight search and coverage documentation](https://github.com/amadeus4dev/developer-guides/blob/master/docs/resources/flights.md), [API authorization](https://developers.amadeus.com/self-service/apis-docs/guides/authorization-262).

Skyscanner references: [API schema](https://developers.skyscanner.net/api/flights-live-pricing), [Autosuggest](https://developers.skyscanner.net/docs/autosuggest/quick-start), [create and poll](https://developers.skyscanner.net/docs/flights-live-prices/overview), [price units](https://developers.skyscanner.net/docs/getting-started/enums), [party totals](https://skyscannerpartnersupport.zendesk.com/hc/en-us/articles/115003148465-How-do-you-display-price-for-more-than-one-passengers).

Live APIs have not been verified without credentials. Automated tests cover city-name resolution, ambiguity, validation, nonstop filtering, deduplication, price normalization, poll actions, ranking, route failures and API requests using mocked responses. The initial website check encountered Skyscanner's CAPTCHA; no real fares were retrieved from that blocked check.
