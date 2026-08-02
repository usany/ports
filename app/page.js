"use client"

import React from "react"
import { BrowserRouter, Routes, Route, Link } from "react-router-dom"
import MapComponent from "./components/Map"

export default function Home() {
  return (
    <BrowserRouter>
      <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <nav style={{
          backgroundColor: "#333",
          color: "white",
          padding: "15px 20px",
          display: "flex",
          gap: "20px",
          boxShadow: "0 2px 4px rgba(0,0,0,0.1)"
        }}>
          <Link to="/" style={{
            color: "white",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: "bold"
          }}>
            🗺️ University Map
          </Link>
        </nav>

        <Routes>
          <Route path="/" element={<MapComponent />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
