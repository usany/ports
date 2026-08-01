const fs = require("fs")
const BASE = "https://www.notion.so/api/v3"
const SPACE_ID = "3283ce48-6b9b-4c12-845a-1c3b2888b2d1"
const PAGE_ID = "299195d3-4d6d-81ad-8d62-f3b191e63222"

const EXCHANGE = {
  key: "exchange",
  label: "2026 Fall Exchange Program University List",
  viewId: "299195d3-4d6d-81b6-9a36-000cf95d701e",
  collectionId: "299195d3-4d6d-81a0-a49f-000b4a04b486",
}
const STUDY = {
  key: "study_abroad",
  label: "2026 Fall Study Abroad Program University List",
  viewId: "299195d3-4d6d-8168-b87d-000c22e0bd02",
  collectionId: "299195d3-4d6d-818f-897a-000b0d9d2994",
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function post(path, payload, tries = 6) {
  for (let t = 0; t < tries; t++) {
    try {
      const res = await fetch(BASE + "/" + path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "notion-client-version": "23.9.0.33",
          "notion-audit-log-platform": "web",
        },
        body: JSON.stringify(payload),
      })
      if (res.status === 429) {
        await sleep(1500 * (t + 1) + Math.random() * 500)
        continue
      }
      if (!res.ok) throw new Error(path + " -> " + res.status + " " + (await res.text()).slice(0, 200))
      return res.json()
    } catch (e) {
      if (t === tries - 1) throw e
      await sleep(700 * (t + 1))
    }
  }
}

function unwrap(record) {
  if (!record) return null
  const v = record.value
  if (v && v.value && typeof v.value === "object") return v.value
  return v
}

function decodeProp(p) {
  if (Array.isArray(p)) {
    return p
      .map((seg) => (Array.isArray(seg) ? (seg[0] != null ? String(seg[0]) : "") : ""))
      .join("")
  }
  if (typeof p === "string") return p
  return ""
}

async function getSchema(collectionId) {
  const res = await post("syncRecordValues", {
    requests: [{ pointer: { table: "collection", id: collectionId, spaceId: SPACE_ID }, version: -1 }],
  })
  const rec = res.recordMap.collection[collectionId]
  const vv = unwrap(rec)
  if (!vv || !vv.schema) throw new Error("no schema for " + collectionId)
  const schema = {}
  for (const [pid, prop] of Object.entries(vv.schema)) {
    schema[pid] = { name: prop.name, type: prop.type }
  }
  return schema
}

async function getPageSort(viewId) {
  const chunk = await post("loadPageChunk", {
    pageId: PAGE_ID,
    limit: 100,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  })
  const v = chunk.recordMap.collection_view[viewId]
  const vv = unwrap(v)
  return vv.page_sort || []
}

function propsFromRow(rowValue, schema) {
  const properties = {}
  for (const [pid, val] of Object.entries(rowValue.properties || {})) {
    const meta = schema[pid]
    properties[pid] = {
      name: meta ? meta.name : pid,
      type: meta ? meta.type : "unknown",
      value: decodeProp(val),
    }
  }
  return properties
}

async function getContent(pageId) {
  const chunk = await post("loadPageChunk", {
    pageId,
    limit: 100,
    cursor: { stack: [] },
    chunkNumber: 0,
    verticalColumns: false,
  })
  if (!chunk || !chunk.recordMap || !chunk.recordMap.block) return []
  const content = []
  for (const b of Object.values(chunk.recordMap.block)) {
    const v = unwrap(b)
    if (!v || !v.type) continue
    if (v.type === "page" || v.type === "collection_view" || v.type === "collection_view_page" || v.type === "maps") continue
    const text = decodeProp(v.properties && (v.properties.title || v.properties.src || v.properties.caption))
    if (text) content.push({ type: v.type, text })
  }
  return content
}

async function runCollection(cfg) {
  const schema = await getSchema(cfg.collectionId)
  const pageSort = await getPageSort(cfg.viewId)
  console.log(`[${cfg.key}] page_sort entries:`, pageSort.length)

  // Batch-verify all candidates via syncRecordValues (gets properties too)
  const rows = []
  for (let i = 0; i < pageSort.length; i += 100) {
    const batch = pageSort.slice(i, i + 100)
    const res = await post("syncRecordValues", {
      requests: batch.map((id) => ({ pointer: { table: "block", id, spaceId: SPACE_ID }, version: -1 })),
    })
    for (const [id, rec] of Object.entries(res.recordMap.block || {})) {
      const vv = unwrap(rec)
      if (!vv || vv.type !== "page") continue
      rows.push({
        id,
        title: decodeProp(vv.properties && vv.properties.title),
        properties: propsFromRow(vv, schema),
        content: [],
      })
    }
    await sleep(150)
    console.log(`[${cfg.key}] verified ${Math.min(i + 100, pageSort.length)}/${pageSort.length}, valid so far: ${rows.length}`)
  }
  console.log(`[${cfg.key}] valid rows: ${rows.length}`)

  // Load content for each valid row
  for (let i = 0; i < rows.length; i += 5) {
    const batch = rows.slice(i, i + 5)
    await Promise.all(
      batch.map(async (row) => {
        row.content = await getContent(row.id)
      })
    )
    await sleep(120)
    if ((i + 5) % 30 === 0 || i + 5 >= rows.length) {
      console.log(`[${cfg.key}] content loaded ${Math.min(i + 5, rows.length)}/${rows.length}`)
    }
  }
  return { label: cfg.label, rows }
}

;(async () => {
  const [exchange, study] = await Promise.all([runCollection(EXCHANGE), runCollection(STUDY)])
  const out = { generatedAt: new Date().toISOString(), lists: { exchange, study } }
  fs.writeFileSync("scripts/universities.json", JSON.stringify(out, null, 2))
  console.log("saved scripts/universities.json")
  process.exit(0)
})()
