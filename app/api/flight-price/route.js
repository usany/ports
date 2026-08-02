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
    const flightData = await page.evaluate((destination) => {
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

        // For airport results, try to match destination airport code if provided
        // Look for destination airport code or city name in the element
        if (destination && destination.length > 0) {
          // Check if this element contains the destination airport/city
          const hasDestination = text.includes(destination.toUpperCase()) || text.includes(destination)
          if (!hasDestination) return
        }

        // Check if this element has "최저가" (lowest price) badge
        const hasLowestPrice = text.includes("최저가")
        if (!hasLowestPrice) return

        // Extract ALL prices from this element and get the LAST/HIGHEST valid one
        // (The most relevant price is typically at the end)
        const priceMatches = text.match(/(\d{1,3}(?:,\d{3})+|\d{5,})/g) || []
        let price = null

        // Get the last valid price (usually the main price)
        for (let i = priceMatches.length - 1; i >= 0; i--) {
          const priceStr = priceMatches[i].replace(/,/g, "")
          const priceNum = parseInt(priceStr)
          // Get the last valid price found
          if (priceNum >= 100000 && priceNum <= 9999999) {
            price = priceNum
            break
          }
        }

        if (!price) return

        // Extract airline - look for common airline names or 항공 (airline)
        let airline = null
        const airlinePatterns = [
          /아시아나항공|Asiana/i,
          /대한항공|Korean Air|KE/i,
          /진에어|Jin Air/i,
          /에어부산|Air Busan/i,
          /제주항공|Jeju Air/i,
          /에어서울|Air Seoul/i,
          /이스타항공|Eastair/i,
          /스카이팀/i,
          /탈린|Talin/i,
          /델타|Delta/i,
          /아메리칸|American/i,
          /유나이티드|United/i,
          /루프트한자|Lufthansa/i,
          /에미레이트|Emirates/i,
          /카타르항공|Qatar/i,
          /싱가포르항공|Singapore/i,
          /([A-Z][A-Za-z\s]+항공)/,  // Generic airline with 항공
        ]

        for (const pattern of airlinePatterns) {
          const match = text.match(pattern)
          if (match) {
            airline = match[1] || match[0]
            break
          }
        }

        // Extract duration
        const durationMatch = text.match(/(\d+)\s*시간\s*(\d+)\s*분/)
        const duration = durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null

        // Extract stops/direct - try multiple patterns
        let stops = null
        let isDirect = false

        // Try various patterns for transfer info
        const stopsPatterns = [
          /(\d+)\s*회\s*경유/,           // "2회 경유" or "2 회 경유"
          /(\d+)회경유/,                  // "2회경유" (no space)
          /경유\s*(\d+)\s*회/,            // "경유 2회"
          /경유\s*(\d+)/,                 // "경유 2"
          /(\d+)\s*경유/,                 // "2 경유"
        ]

        for (const pattern of stopsPatterns) {
          const match = text.match(pattern)
          if (match) {
            stops = parseInt(match[1])
            break
          }
        }

        // If no stops found but "경유" is mentioned, assume 1 stop
        if (stops === null && text.includes("경유")) {
          stops = 1
        }

        // Check for direct flight
        if (text.includes("직항")) {
          isDirect = true
          stops = 0
        }

        // Add valid flight (with or without complete duration)
        if (price) {
          flights.push({
            price,
            duration,
            stops,
            isDirect,
            airline,
            text: text.substring(0, 300),
          })
        }
      })

      // Sort by price - return cheapest first
      flights.sort((a, b) => a.price - b.price)
      const bestFlights = flights.slice(0, 10)

      console.log("Flight data extracted:", {
        destination: destination,
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
    }, destination)

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
