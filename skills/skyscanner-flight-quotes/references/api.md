# Official API access and workflow

Skyscanner requires partner approval and a key supplied in the HTTPS `x-api-key` header. API access is not a public free endpoint. The MCP server is also offered case by case; do not invent its address or configure an unapproved third-party substitute. Keep credentials in the environment and out of source files, logs and quoted URLs.

The bundled CLI defaults to Skyscanner. Set `SKYSCANNER_API_KEY` in the local environment and run its `src/cli.js`. Fully supplied flags avoid interactive questions; `--json` emits machine-readable results. `--output <path>` saves JSON without overwriting a file. No packages need installing. Supported party: 1–8 adults for Skyscanner. Request market `SG`, locale `en-GB`, currency `SGD`, economy and two date-specific query legs. Children/infants and flexible dates require an extension; do not silently include them in this adult-only implementation.

Resolve names with `POST /apiservices/v3/autosuggest/flights`, selecting an exact city match and preserving country/entity ID. Airport codes may select a matching airport or city. Require disambiguation instead of choosing the first fuzzy match. Create using `POST /apiservices/v3/flights/live/search/create`, then poll `POST /apiservices/v3/flights/live/search/poll/{sessionToken}`. The CLI waits two seconds between polls, allows 30 polls, and times out each HTTP request after 30 seconds. Timeouts, unknown statuses, rate limits, degraded results and failed sessions are explicit failures; incomplete responses are not quoted as final results.

Keep dictionaries and itineraries aligned. Apply `RESULT_ACTION_REPLACED` as replacement, `RESULT_ACTION_NOT_MODIFIED` without discarding prior results, and merge other response maps by ID. Require `RESULT_STATUS_COMPLETE`. Normalize price according to `PRICE_UNIT_WHOLE`, `CENTI`, `MILLI` or `MICRO`; skip unspecified units. Prices from the API describe the requested traveling party; averages divide by adults. Require two legs, zero stops and one segment per leg; check SIN endpoints and dates. Confirm destination airports belong to the resolved city. Rank unique outbound/return flight pairs.

The current CLI retains pricing options with a single HTTPS seller deep link, excluding options that require multiple separate purchases. It keeps supplied baggage data and labels absent data unknown. Completed live-search prices may still be cached or change; the quote includes provider price update status. For an explicit price reconfirmation, use the official itinerary refresh workflow or check the selected seller in the browser, then rerank if prices change. Do not claim a quote was refreshed unless this happened.

Official references, checked 2026-10-13:

- [Authentication and partner access](https://developers.skyscanner.net/docs/getting-started/authentication)
- [Autosuggest quick start](https://developers.skyscanner.net/docs/autosuggest/quick-start)
- [Live-price API schema](https://developers.skyscanner.net/api/flights-live-pricing)
- [Create/poll and completeness](https://developers.skyscanner.net/docs/flights-live-prices/overview)
- [Query fields](https://developers.skyscanner.net/docs/flights-live-prices/query-object)
- [Status, action and price-unit enums](https://developers.skyscanner.net/docs/getting-started/enums)
- [Price totals and averages](https://skyscannerpartnersupport.zendesk.com/hc/en-us/articles/115003148465-How-do-you-display-price-for-more-than-one-passengers)
- [MCP access](https://developers.skyscanner.net/docs/mcp-server)

Check the current official schema when modifying the client or diagnosing an API mismatch. Do not rely on legacy v1 session endpoints or deprecated baggage request flags.
