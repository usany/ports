const AIRPORT_CODES = {
  "nyc": "JFK", "new york": "JFK", "jfk": "JFK",
  "lax": "LAX", "los angeles": "LAX",
  "lhr": "LHR", "london": "LHR", "heathrow": "LHR",
  "icn": "ICN", "incheon": "ICN",
  "cdg": "CDG", "paris": "CDG",
  "aus": "AUS", "austin": "AUS",
  "sel": "SEL", "seoul": "SEL",
  "tao": "TAO", "qingdao": "TAO",
}

function normalizeAirportCode(input) {
  const upper = input.toUpperCase()
  if (upper.length === 3) return upper
  return AIRPORT_CODES[input.toLowerCase()] || upper
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const origin = "ICN"
  const destination = normalizeAirportCode(searchParams.get("destination") || "")
  const date = searchParams.get("date")

  if (!destination || !date) {
    return Response.json({ error: "Missing destination or date. Departure is fixed to ICN (Incheon)" }, { status: 400 })
  }

  try {
    const apiKey = process.env.BRIGHTDATA_KEY
    if (!apiKey) {
      return Response.json({ error: "BRIGHTDATA_KEY environment variable is not set" }, { status: 400 })
    }

    // Format date from YYYYMMDD to YYYY-MM-DD
    const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`
    const url = `https://api.brightdata.com/datasets?token=${apiKey}`

    const payload = {
      dataset: 'google_flights',
      params: {
        departure_id: origin,
        arrival_id: destination,
        outbound_date: formattedDate,
        type: 2,
        currency: 'USD',
        hl: 'en',
        gl: 'us'
      }
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      throw new Error(`Bright Data API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log("Bright Data Response:", JSON.stringify(data, null, 2))
    console.log("Available keys:", Object.keys(data))

    if (data.error) {
      console.log("Bright Data Error:", data.error)
    }
    if (data.search_information) {
      console.log("Search information:", data.search_information)
    }

    // Bright Data returns flights directly in best_flights/other_flights
    const siteResults = []
    if (data.google_flights_url) {
      siteResults.push({
        source: "Google Flights",
        url: data.google_flights_url,
      })
    }

    let minPrice = null
    let priceInfo = []

    // Extract from google_flights best_flights
    if (data.best_flights && data.best_flights.length > 0) {
      console.log("Extracting prices from google_flights best_flights")
      data.best_flights.forEach((flight) => {
        if (flight.price) {
          const cleanPrice = flight.price.toString().replace(/[^\d]/g, '')
          const priceNum = parseInt(cleanPrice)
          if (priceNum > 0) {
            priceInfo.push({
              price: flight.price,
              priceNum,
              source: "Google Flights",
              airline: flight.airline,
              departure_time: flight.departure_time,
            })
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum
            }
          }
        }
      })
    }

    // Fallback to other_flights
    if (!minPrice && data.other_flights && data.other_flights.length > 0) {
      console.log("Extracting prices from google_flights other_flights")
      data.other_flights.forEach((flight) => {
        if (flight.price) {
          const cleanPrice = flight.price.toString().replace(/[^\d]/g, '')
          const priceNum = parseInt(cleanPrice)
          if (priceNum > 0) {
            priceInfo.push({
              price: flight.price,
              priceNum,
              source: "Google Flights (Other)",
              airline: flight.airline,
            })
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum
            }
          }
        }
      })
    }

    // Extract from organic results snippets
    if (!minPrice && data.organic_results && data.organic_results.length > 0) {
      console.log("Extracting prices from organic results")
      data.organic_results.forEach((result) => {
        const text = `${result.title} ${result.snippet}`
        const priceMatches = text.match(/\$[\d,]+|₩[\d,]+|[\d,]+원/g) || []
        priceMatches.forEach((priceMatch) => {
          const cleanPrice = priceMatch.replace(/[^\d]/g, '')
          const priceNum = parseInt(cleanPrice)
          if (priceNum > 0) {
            priceInfo.push({
              price: priceMatch,
              priceNum,
              source: "Bright Data organic results",
              title: result.title,
              url: result.link,
            })
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum
            }
          }
        })
      })
    }

    // Fallback to prices extracted from Google Flights URL
    if (!minPrice && siteResults.length > 0 && siteResults[0].prices) {
      console.log("Extracting prices from Google Flights page")
      siteResults[0].prices.forEach((priceMatch) => {
        const cleanPrice = priceMatch.replace(/[^\d]/g, '')
        const priceNum = parseInt(cleanPrice)
        if (priceNum > 0) {
          priceInfo.push({
            price: priceMatch,
            priceNum,
            source: "Google Flights page",
            url: siteResults[0].url,
          })
          if (!minPrice || priceNum < minPrice) {
            minPrice = priceNum
          }
        }
      })
    }

    console.log("Final extracted price info:", priceInfo)
    console.log("Minimum price:", minPrice)

    return Response.json({
      success: minPrice !== null,
      origin,
      destination,
      date,
      price: minPrice,
      priceInfo,
      siteResults,
      organicResults: data.organic_results?.map(r => ({
        title: r.title,
        link: r.link,
        snippet: r.snippet,
      })) || [],
      message: minPrice === null ? "No flight prices found in search results" : undefined,
    })
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
        message: "Failed to fetch flight data from Bright Data API.",
      },
      { status: 500 }
    )
  }
}
