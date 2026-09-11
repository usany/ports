export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const origin = searchParams.get("origin")
  const destination = searchParams.get("destination")
  const date = searchParams.get("date")

  if (!origin || !destination || !date) {
    return Response.json({ error: "Missing origin, destination, or date" }, { status: 400 })
  }

  try {
    const apiKey = process.env.SERPAPI_KEY
    if (!apiKey) {
      return Response.json({ error: "SERPAPI_KEY environment variable is not set" }, { status: 400 })
    }

    // Format date from YYYYMMDD to YYYY-MM-DD
    const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`
    const url = `https://serpapi.com/search?engine=google_flights&departure_id=${origin}&arrival_id=${destination}&outbound_date=${formattedDate}&type=2&api_key=${apiKey}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log("SerpAPI Response:", JSON.stringify(data, null, 2))
    console.log("Available keys:", Object.keys(data))

    if (data.error) {
      console.log("SerpAPI Error:", data.error)
    }
    if (data.search_information) {
      console.log("Search information:", data.search_information)
    }

    // Get google_flights_url from SerpAPI response and fetch it to extract prices
    const googleFlightsUrl = data.google_flights_url
    const siteResults = []

    if (googleFlightsUrl) {
      try {
        console.log("Fetching Google Flights URL to extract prices:", googleFlightsUrl)
        const googleFlightsResponse = await fetch(googleFlightsUrl)
        if (googleFlightsResponse.ok) {
          const googleFlightsHtml = await googleFlightsResponse.text()

          // Extract prices from HTML - look for price patterns
          const priceMatches = googleFlightsHtml.match(/[\$₩][\d,]+|[\d,]+\s*(?:USD|KRW|元)/g) || []

          siteResults.push({
            source: "Google Flights",
            url: googleFlightsUrl,
            prices: priceMatches,
          })

          console.log("Prices found in Google Flights:", priceMatches)
        }
      } catch (err) {
        console.log("Error fetching Google Flights URL:", err.message)
        siteResults.push({
          source: "Google Flights",
          url: googleFlightsUrl,
        })
      }
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
              source: "SerpAPI organic results",
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
        message: "Failed to fetch flight data from Brave Search API.",
      },
      { status: 500 }
    )
  }
}
