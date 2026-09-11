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

        // Extract content from flights-results class
        const flightsResultsContent = await page.evaluate(() => {
          const flightsResultsElement = document.querySelector(".flights-results")
          if (!flightsResultsElement) {
            return null
          }
          return {
            html: flightsResultsElement.innerHTML,
            text: flightsResultsElement.textContent,
            className: flightsResultsElement.className,
          }
        })

        if (flightsResultsContent) {
          // Extract prices from flights-results content
          const priceMatches = flightsResultsContent.text?.match(/[\d,]+(?:원|₩|\$)/g) || []

          siteResults.push({
            source: "Google Search",
            url: googleSearchUrl,
            prices: priceMatches,
            content: flightsResultsContent.text?.substring(0, 1000),
          })
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

    // Extract prices from flights-results content (from siteResults)
    if (siteResults.length > 0 && siteResults[0].prices) {
      siteResults[0].prices.forEach((priceMatch) => {
        const cleanPrice = priceMatch.replace(/[^\d]/g, '')
        const priceNum = parseInt(cleanPrice)
        if (priceNum > 0) {
          priceInfo.push({
            price: priceMatch,
            priceNum,
            source: "flights-results class",
          })
          if (!minPrice || priceNum < minPrice) {
            minPrice = priceNum
          }
        }
      })
    }

    return Response.json({
      success: true,
      origin,
      destination,
      date,
      price: minPrice,
      priceInfo,
      siteResults,
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
