---
name: skyscanner-flight-quotes
description: Compare real Skyscanner nonstop round-trip fares from Singapore across multiple destination cities on exact departure and return dates. Use for flight quotes and holiday destination comparisons through the Skyscanner website, an available Skyscanner connector, or approved partner API access.
---

# Skyscanner Flight Quotes

Ask for missing inputs in this order, one question at a time: "Tell me the destinations you want to go.", "What is your fly-off date?", then "What is your return date?" Accept full city names, including "Xi an" and "Xi'an". Reuse destinations and dates already given in the conversation. Default to Singapore Changi (SIN), one adult, economy, round trip and SGD; state these assumptions with the results. Dates are exact airport-local departure dates, not a flexible travel window.

Resolve city names against Skyscanner's city suggestions. Prefer the city/all-airports option for a city request; retain the actual airports in each itinerary. When several countries have a matching city, ask which city/country or airport the user means. Never infer route availability from an offline airport list. Compare destinations individually and return up to five distinct round-trip itineraries per city, sorted by total fare, requiring no stops in both directions. Deduplicate sellers and fare bundles for the same pair of flights; retain the cheapest qualifying seller. Do not pad results to five.

## Choose an available access path

- If a connected Skyscanner service is available, inspect its tools and use its live search and place lookup capabilities. An indicative-prices tool alone cannot provide exact-date live quotes. Do not assume a connector or MCP server is installed or publicly accessible.
- With an approved `SKYSCANNER_API_KEY` in the environment, read [the API workflow](references/api.md) and use the bundled CLI. Do not ask the user to paste a key into chat. The standalone bundle is under `assets/flight-scanner/` relative to this skill and needs Node.js 22+. Example:

  ```powershell
  node "<skill-directory>/assets/flight-scanner/src/cli.js" --provider skyscanner --destinations "Chengdu,Nanjing,Hangzhou,Xi an,Xiamen" --departure 2027-03-12 --return 2027-03-20 --json
  ```

  Substitute the actual skill directory and user's dates. The CLI resolves cities, waits for complete results and returns ranked quotes. It reports route failures separately. Demo mode is for software tests only; never use it to answer a request for real fares.
- Without API access, use an available browser tool and read [the browser workflow](references/browser.md). Browser access is an agent-assisted path, not a capability of the terminal CLI. If neither a browser nor live API/connector is available, report the missing access and provide search instructions without inventing prices.

## Quote and compare

For each result include the destination and actual airports, airline and flight numbers when available, outbound/return dates and local times, nonstop status, SGD round-trip total for the requested passengers, average per adult when useful, seller, baggage information or "unknown", and a source/booking link. State the retrieval time in Asia/Singapore and identify API versus browser results. An API search-session token is operational data; do not show it or put it in a link.

Verify currency and whether a website price is a group total or average per passenger before comparing it. Preserve the supplied total and label any calculated average. Do not treat a search link, airline route page, cached search-engine snippet, calendar/month "from" price or previous demo result as a real exact-date quote. Use only completed live search results or visibly loaded exact-date website results. Skyscanner quotes can change at checkout; describe them as retrieved quotes, not guaranteed fares.

Rank destinations by their lowest qualifying returned total and explain that this assesses flight cost only. When a destination fails, label the overall comparison incomplete and distinguish failed/blocked searches from successfully searched cities with no matching offers. Never claim no nonstop route exists based only on no returned offers. Do not book tickets or create price alerts as part of a quote request.
