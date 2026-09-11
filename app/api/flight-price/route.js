import { chromium } from "playwright"

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

    let browser = null
    const siteResults = []

    try {
      browser = await chromium.launch({
        headless: true,
        args: ["--disable-dev-shm-usage", "--no-sandbox"],
      })

      // Visit Google search results
      const searchQuery = `flight prices ${origin} to ${destination} ${date}`
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`

      try {
        const context = await browser.newContext({
          userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
        const page = await context.newPage()
        await page.goto(googleSearchUrl, { waitUntil: "networkidle", timeout: 15000 })

        // Extract content from Google flights
        const flightsContent = await page.evaluate(() => {
          // Try multiple selectors for Google flights
          let element = document.querySelector(".flights-results")
          if (!element) element = document.querySelector("[data-view-type='flights']")
          if (!element) element = document.querySelector(".yg3J7d") // Google flights container
          if (!element) element = document.querySelector("div[role='listitem']")

          // If still not found, get the page text and look for prices
          if (!element) {
            const bodyText = document.body.textContent
            return {
              text: bodyText,
              html: null,
              className: null,
            }
          }

          return {
            html: element.innerHTML,
            text: element.textContent,
            className: element.className,
          }
        })

        if (flightsContent) {
          // Extract prices from content - look for currency patterns
          const priceMatches = flightsContent.text?.match(/\$[\d,]+|₩[\d,]+|[\d,]+원/g) || []

          if (priceMatches.length > 0) {
            siteResults.push({
              source: "Google Search",
              url: googleSearchUrl,
              prices: priceMatches,
              content: flightsContent.text?.substring(0, 1000),
            })
          }
        }

        await context.close()
      } catch (err) {
        // Silently handle error
      }
    } catch (err) {
      // Silently handle Chromium errors
    } finally {
      if (browser) {
        await browser.close().catch(() => {})
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

    // Fallback to Chromium extracted prices
    if (!minPrice && siteResults.length > 0 && siteResults[0].prices) {
      console.log("Falling back to Chromium extracted prices")
      siteResults[0].prices.forEach((priceMatch) => {
        const cleanPrice = priceMatch.replace(/[^\d]/g, '')
        const priceNum = parseInt(cleanPrice)
        if (priceNum > 0) {
          priceInfo.push({
            price: priceMatch,
            priceNum,
            source: "Chromium extraction",
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
