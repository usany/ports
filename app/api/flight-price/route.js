export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const origin = searchParams.get("origin")
  const destination = searchParams.get("destination")
  const date = searchParams.get("date")

  if (!origin || !destination || !date) {
    return Response.json({ error: "Missing origin, destination, or date" }, { status: 400 })
  }

  try {
    const searchKey = process.env.SEARCH_KEY
    if (!searchKey) {
      return Response.json({ error: "SEARCH_KEY environment variable is not set" }, { status: 400 })
    }
    const url = `https://api.search.brave.com/res/v1/web/search?q=flight+prices+${origin}+to+${destination}+${date}&count=20`
    const headers = {
      "Accept": "application/json",
      "X-Subscription-Token": searchKey,
    }

    console.log(`Fetching from Brave Search API: ${url}`)
    const response = await fetch(url, { headers })

    if (!response.ok) {
      throw new Error(`Brave Search API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    console.log("Brave Search API Response:", JSON.stringify(data, null, 2))
    console.log("Web results:", data.web?.results?.map(r => ({ title: r.title, url: r.url, description: r.description })))

    const results = data.web?.results || []
    let minPrice = null
    let priceInfo = []

    // Extract prices from search results
    results.forEach((result) => {
      const text = `${result.title} ${result.description}`

      // Look for price patterns: $999, ₩999,999, 999,999원, etc.
      const pricePatterns = [
        /\$[\d,]+/g,           // $999
        /₩[\d,]+/g,            // ₩999,999
        /[\d,]+원/g,           // 999,999원
        /from\s*[\d,]+/gi,     // from 999
        /starting\s*[\d,]+/gi, // starting 999
      ]

      pricePatterns.forEach((pattern) => {
        const matches = text.match(pattern)
        if (matches) {
          matches.forEach((match) => {
            const cleanPrice = match.replace(/[^\d]/g, '')
            const priceNum = parseInt(cleanPrice)
            if (priceNum > 0) {
              priceInfo.push({
                price: match,
                priceNum,
                source: result.title,
              })
              if (!minPrice || priceNum < minPrice) {
                minPrice = priceNum
              }
            }
          })
        }
      })
    })

    console.log("Extracted prices:", priceInfo)
    console.log("Minimum price found:", minPrice)

    return Response.json({
      success: true,
      origin,
      destination,
      date,
      price: minPrice,
      priceInfo,
      results,
      query: data.query,
    })
  } catch (error) {
    console.error("Error fetching from Brave Search API:", error.message)
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
