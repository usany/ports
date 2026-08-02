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
      const text = document.body.innerText

      // Find the element with "최저가" (lowest price)
      const lowestPriceElement = Array.from(document.querySelectorAll("i, span, div")).find(
        (el) => el.textContent && el.textContent.includes("최저가")
      )

      // If found, get the parent container with flight info
      let lowestPriceContainer = null
      if (lowestPriceElement) {
        let parent = lowestPriceElement.parentElement
        // Go up the DOM tree to find the flight result container
        for (let i = 0; i < 10 && parent; i++) {
          const parentText = parent.textContent || ""
          if (
            (parentText.includes("시간") || parentText.includes("분")) &&
            (parentText.includes("직항") || parentText.includes("경유") || parentText.includes("₩"))
          ) {
            lowestPriceContainer = parent
            break
          }
          parent = parent.parentElement
        }
      }

      // Extract info from lowest price container if found
      if (lowestPriceContainer) {
        const containerText = lowestPriceContainer.textContent || ""

        // Extract price
        const priceMatch = containerText.match(/₩?\s*(\d{1,3}(?:,\d{3})+)/)
        const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : null

        // Extract duration
        const durationMatch = containerText.match(/(\d+)\s*시간\s*(\d+)\s*분/)
        const duration = durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null

        // Extract stops/direct
        let stops = null
        let isDirect = false

        const stopsMatch = containerText.match(/(\d+)\s*회\s*경유/)
        if (stopsMatch) {
          stops = parseInt(stopsMatch[1])
        } else if (containerText.includes("경유")) {
          stops = 1
        } else if (containerText.includes("직항")) {
          isDirect = true
          stops = 0
        }

        if (price) {
          flights.push({
            price,
            duration,
            stops,
            isDirect,
            rawText: containerText.substring(0, 150),
          })
        }
      }

      // Fallback: if no lowest price found, extract all prices
      if (flights.length === 0) {
        const priceMatches = text.match(/\d{1,3}(?:,\d{3})+/g) || []
        const prices = []

        priceMatches.forEach((match) => {
          const num = parseInt(match.replace(/,/g, ""))
          if (num >= 100000 && num <= 5000000) {
            prices.push(num)
          }
        })

        // Try to extract flight details from page elements
        const flightElements = document.querySelectorAll(
          "div, li, button, [class*='flight'], [class*='result']"
        )

        flightElements.forEach((el) => {
          const text = el.textContent || ""

          // Look for flight information patterns
          if (text.includes("시간") || text.includes("분") || text.includes("직항") || text.includes("경유")) {
            // Extract duration
            const durationMatch =
              text.match(/(\d+)\s*시간\s*(\d+)\s*분/) || text.match(/(\d+)h\s*(\d+)m/)

            // Try multiple patterns for stops
            let stopsMatch =
              text.match(/(\d+)\s*회\s*경유/) ||
              text.match(/(\d+)\s*경유/) ||
              text.match(/경유\s*(\d+)\s*회/) ||
              text.match(/경유\s*(\d+)/)

            // Extract price from this element
            const priceInElement = text.match(/\d{1,3}(?:,\d{3})+/)

            // Determine if direct
            let stops = null
            let isDirect = false

            if (stopsMatch) {
              stops = parseInt(stopsMatch[1])
              isDirect = false
            } else if (text.includes("경유")) {
              stops = 1
              isDirect = false
            } else if (text.includes("직항")) {
              isDirect = true
              stops = 0
            }

            if (priceInElement || durationMatch || stops !== null || isDirect) {
              flights.push({
                price: priceInElement ? parseInt(priceInElement[0].replace(/,/g, "")) : null,
                duration: durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null,
                stops,
                isDirect,
                rawText: text.substring(0, 150),
              })
            }
          }
        })

        // Remove duplicates and sort by price
        const uniqueFlights = flights
          .filter((f) => f.price && f.price >= 100000 && f.price <= 5000000)
          .sort((a, b) => a.price - b.price)

        return {
          prices: [...new Set(prices)].sort((a, b) => a - b),
          flights: uniqueFlights.slice(0, 5),
          pageLength: text.length,
        }
      }

      return {
        prices: flights.map((f) => f.price).filter(Boolean),
        flights: flights.slice(0, 5),
        pageLength: text.length,
      }
    })

    await browser.close()

    return Response.json({
      success: true,
      origin,
      destination,
      date,
      price: flightData.prices.length > 0 ? flightData.prices[0] : null,
      allPrices: flightData.prices.slice(0, 10),
      flights: flightData.flights,
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
