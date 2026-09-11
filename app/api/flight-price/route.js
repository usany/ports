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
    const url = `https://serpapi.com/search?q=flight+prices+${origin}+to+${destination}+${date}&api_key=${apiKey}`

    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log("SerpAPI Response:", JSON.stringify(data, null, 2))
    console.log("Available keys:", Object.keys(data))
    if (data.flights) {
      console.log("Flights data:", JSON.stringify(data.flights, null, 2))
    }
    if (data.shopping_results) {
      console.log("Shopping results:", JSON.stringify(data.shopping_results, null, 2))
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

    // Extract from SerpAPI flights data
    if (data.flights && data.flights.length > 0) {
      console.log("Extracting prices from SerpAPI flights data")
      data.flights.forEach((flight) => {
        if (flight.price) {
          const priceStr = flight.price.toString()
          const cleanPrice = priceStr.replace(/[^\d]/g, '')
          const priceNum = parseInt(cleanPrice)
          if (priceNum > 0) {
            priceInfo.push({
              price: flight.price,
              priceNum,
              source: "SerpAPI flights",
            })
            if (!minPrice || priceNum < minPrice) {
              minPrice = priceNum
            }
          }
        }
      })
    }

    // Extract from SerpAPI shopping results
    if (data.shopping_results && data.shopping_results.length > 0) {
      console.log("Extracting prices from SerpAPI shopping results")
      data.shopping_results.forEach((result) => {
        if (result.price) {
          const cleanPrice = result.price.toString().replace(/[^\d]/g, '')
          const priceNum = parseInt(cleanPrice)
          if (priceNum > 0) {
            priceInfo.push({
              price: result.price,
              priceNum,
              source: "SerpAPI shopping",
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
