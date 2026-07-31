import "./globals.css"

export const metadata = {
  title: "Maps",
  description: "Leaflet world map",
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
