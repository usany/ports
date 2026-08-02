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
      const lowestPriceElement = Array.from(document.querySelectorAll("i, span, div, em, b")).find(
        (el) => el.textContent && el.textContent.trim() === "최저가"
      )

      // If found, get the parent container with flight info
      let lowestPriceContainer = null
      if (lowestPriceElement) {
        let parent = lowestPriceElement.parentElement
        // Go up the DOM tree to find the flight result container
        for (let i = 0; i < 15 && parent; i++) {
          const parentText = parent.textContent || ""
          if (
            (parentText.includes("시간") || parentText.includes("분")) &&
            (parentText.includes("직항") || parentText.includes("경유"))
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

        // Extract price - look for price pattern near "최저가"
        // Prices typically appear as "₩171,510" or "171510" or "171,510"
        let price = null

        // Look for numbers followed by Korean won symbol or in price context
        const pricePatterns = [
          /₩\s*(\d{1,3}(?:,\d{3})+)/,        // ₩171,510
          /\d{1,3}(?:,\d{3})+\s*원?/,         // 171,510 or 171,510원
          /(\d{4,7})\s*원/,                   // 171510원
        ]

        for (const pattern of pricePatterns) {
          const match = containerText.match(pattern)
          if (match) {
            const priceStr = match[0].replace(/[₩원\s,]/g, "")
            const priceNum = parseInt(priceStr)
            // Only accept if it's a reasonable flight price
            if (priceNum >= 100000 && priceNum <= 5000000) {
              price = priceNum
              break
            }
          }
        }

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

      // Return extracted flight data from "최저가" element
      return {
        prices: flights.map((f) => f.price).filter(Boolean),
        flights: flights,
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
