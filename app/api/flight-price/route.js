import { chromium } from "playwright"

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const origin = searchParams.get("origin")
  const destination = searchParams.get("destination")
  const date = searchParams.get("date")

  if (!origin || !destination || !date) {
    return Response.json({ error: "Missing origin, destination, or date" }, { status: 400 })
  }

  let browser = null
  try {
    const url = `https://flight.naver.com/flights/international/${origin}:city-${destination}:airport-${date}?adult=1&isDirect=false&fareType=Y`

    browser = await chromium.launch({
      headless: false, // Use non-headless mode for better compatibility
      args: ["--disable-dev-shm-usage", "--no-sandbox"],
    })

    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    })
    const page = await context.newPage()

    // Navigate and wait long enough for everything to load
    console.log(`Navigating to: ${url}`)
    await page.goto(url, { waitUntil: "load", timeout: 40000 })

    // Wait even longer for dynamic content
    await page.waitForTimeout(5000)

    // Get page info
    const pageInfo = await page.evaluate(() => ({
      title: document.title,
      url: window.location.href,
      bodyLength: document.body.innerText.length,
      html: document.body.innerHTML.substring(0, 2000),
      text: document.body.innerText.substring(0, 2000),
    }))

    console.log("Page info:", {
      title: pageInfo.title,
      bodyLength: pageInfo.bodyLength,
    })

    // Extract flight data including prices and transfer info
    const flightData = await page.evaluate(() => {
      const flights = []

      // Find all flight result containers - look for elements with price + time + transfer info
      const allDivs = Array.from(document.querySelectorAll("div, li"))

      allDivs.forEach((element) => {
        const text = element.textContent || ""

        // Skip if element doesn't have flight-like info
        if (!(text.includes("시간") || text.includes("분"))) return
        if (!(text.includes("직항") || text.includes("경유"))) return

        // Skip if too large (probably a container, not a result)
        if (text.length > 2000) return

        // Extract ALL prices from this element and get the first/largest valid one
        const priceMatches = text.match(/(\d{1,3}(?:,\d{3})+|\d{5,})/g) || []
        let price = null

        for (const priceMatch of priceMatches) {
          const priceStr = priceMatch.replace(/,/g, "")
          const priceNum = parseInt(priceStr)
          // Get the first valid price found
          if (priceNum >= 100000 && priceNum <= 9999999) {
            price = priceNum
            break
          }
        }

        if (!price) return

        // Extract duration
        const durationMatch = text.match(/(\d+)\s*시간\s*(\d+)\s*분/)
        const duration = durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null

        // Extract stops/direct - prioritize "회 경유" pattern
        let stops = null
        let isDirect = false

        const stopsMatch = text.match(/(\d+)\s*회\s*경유/)
        if (stopsMatch) {
          stops = parseInt(stopsMatch[1])
        } else if (text.includes("경유")) {
          stops = 1
        } else if (text.includes("직항")) {
          isDirect = true
          stops = 0
        }

        // Add valid flight
        if (price && (duration || isDirect)) {
          flights.push({
            price,
            duration,
            stops,
            isDirect,
            text: text.substring(0, 300),
          })
        }
      })

      // Sort by price - return cheapest first
      flights.sort((a, b) => a.price - b.price)
      const bestFlights = flights.slice(0, 10)

      console.log("Flight data extracted:", {
        totalFlights: flights.length,
        allFlights: flights.map((f) => ({ price: f.price, duration: f.duration, stops: f.stops })),
        bestFlights: bestFlights.map((f) => ({ price: f.price, duration: f.duration, stops: f.stops })),
        priceRange: flights.length > 0 ? { min: flights[0].price, max: flights[flights.length - 1].price } : null,
      })

      return {
        prices: bestFlights.map((f) => f.price),
        flights: bestFlights,
        pageLength: document.body.innerText.length,
      }
    })

    await browser.close()

    // Ensure we return a price if flights were found
    let mainPrice = null
    if (flightData.flights && flightData.flights.length > 0) {
      mainPrice = flightData.flights[0].price
    } else if (flightData.prices && flightData.prices.length > 0) {
      mainPrice = flightData.prices[0]
    }

    return Response.json({
      success: true,
      origin,
      destination,
      date,
      price: mainPrice,
      allPrices: flightData.prices?.slice(0, 10) || [],
      flights: flightData.flights || [],
      url,
    })
  } catch (error) {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
    console.error("Error scraping:", error.message)
    return Response.json(
      {
        success: false,
        error: error.message,
        message:
          "Naver Flight appears to be blocking automated access. Manual API key signup or alternative flight data source required.",
      },
      { status: 500 }
    )
  }
}
