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
      const prices = []

      // Extract ALL prices from the page
      const priceRegex = /(\d{2,3},\d{3}|\d{5,})\s*원?/g
      let priceMatch
      while ((priceMatch = priceRegex.exec(text)) !== null) {
        const priceStr = priceMatch[1].replace(/,/g, "")
        const priceNum = parseInt(priceStr)
        // Only collect reasonable flight prices (100k - 5M won)
        if (priceNum >= 100000 && priceNum <= 5000000) {
          prices.push(priceNum)
        }
      }

      // Remove duplicates and sort
      const uniquePrices = [...new Set(prices)].sort((a, b) => a - b)

      // Get the minimum price (most likely to be direct/cheapest)
      const lowestPrice = uniquePrices.length > 0 ? uniquePrices[0] : null

      // Now find flight details near the lowest price or first result
      const allElements = Array.from(document.querySelectorAll("div, li, section, article, span"))

      // Look for element containing flight info (time + transfer info)
      let flightElement = allElements.find((el) => {
        const text = el.textContent || ""
        return (
          (text.includes("시간") || text.includes("분")) &&
          (text.includes("직항") || text.includes("경유"))
        )
      })

      // Extract flight details from the element
      if (flightElement) {
        const flightText = flightElement.textContent || ""

        // Extract duration
        const durationMatch = flightText.match(/(\d+)\s*시간\s*(\d+)\s*분/)
        const duration = durationMatch ? `${durationMatch[1]}시간 ${durationMatch[2]}분` : null

        // Extract stops/direct
        let stops = null
        let isDirect = false

        const stopsMatch = flightText.match(/(\d+)\s*회\s*경유/)
        if (stopsMatch) {
          stops = parseInt(stopsMatch[1])
        } else if (flightText.includes("경유")) {
          stops = 1
        } else if (flightText.includes("직항")) {
          isDirect = true
          stops = 0
        }

        if (lowestPrice) {
          flights.push({
            price: lowestPrice,
            duration,
            stops,
            isDirect,
          })
        }
      } else if (lowestPrice) {
        // If we can't find transfer details, at least return the price
        flights.push({
          price: lowestPrice,
          duration: null,
          stops: null,
          isDirect: false,
        })
      }

      console.log("Flight data extracted:", {
        allPrices: uniquePrices,
        lowestPrice: lowestPrice,
        flights: flights,
      })

      return {
        prices: uniquePrices,
        flights: flights,
        pageLength: text.length,
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
