import fs from 'fs'
import path from 'path'
import { extractReceiptFromImage } from '@/services/receipts/extraction'

// Load .env and .env.local manually to ensure API keys are populated
function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      if (!process.env[key]) {
        process.env[key] = val
      }
    }
  }
}

loadEnvFile(path.join(process.cwd(), '.env'))
loadEnvFile(path.join(process.cwd(), '.env.local'))

async function runVisionTests() {
  console.log('====================================================')
  console.log('       StockPilot Receipt Vision Extraction Test    ')
  console.log('====================================================\n')

  const demoDir = path.join(process.cwd(), 'public/demo-receipts')
  if (!fs.existsSync(demoDir)) {
    console.error(`Demo directory not found: ${demoDir}`)
    process.exit(1)
  }

  // Find all .png files in public/demo-receipts/
  const files = fs
    .readdirSync(demoDir)
    .filter((f) => f.endsWith('.png'))
    .map((f) => path.join(demoDir, f))

  // Also check for receipt-magsafe-bulk-40.png in root or public if present
  const magSafeCandidates = [
    path.join(demoDir, 'receipt-magsafe-bulk-40.png'),
    path.join(process.cwd(), 'public', 'receipt-magsafe-bulk-40.png'),
    path.join(process.cwd(), 'receipt-magsafe-bulk-40.png'),
  ]
  for (const candidate of magSafeCandidates) {
    if (fs.existsSync(candidate) && !files.includes(candidate)) {
      files.push(candidate)
    }
  }

  if (files.length === 0) {
    console.warn('⚠️  No receipt images found to test.')
    return
  }

  console.log(`Found ${files.length} receipt image(s) to test:\n`)
  for (const file of files) {
    console.log(`  - ${path.basename(file)}`)
  }
  console.log('\n----------------------------------------------------\n')

  let passCount = 0
  let failCount = 0

  for (const filePath of files) {
    const filename = path.basename(filePath)
    console.log(`[TESTING] Extracting: ${filename}...`)
    const buffer = fs.readFileSync(filePath)

    try {
      const startTime = Date.now()
      const result = await extractReceiptFromImage(buffer, 'image/png', [])
      const durationMs = Date.now() - startTime

      console.log(`\n✅ Extraction Success for ${filename} (${durationMs}ms):`)
      console.log(`   Merchant:       ${result.merchant}`)
      console.log(`   Date:           ${result.date}`)
      console.log(`   Invoice #:      ${result.invoiceNumber || 'N/A'}`)
      console.log(`   Customer:       ${result.customer || 'N/A'}`)
      console.log(`   Currency:       ${result.currency}`)
      console.log(`   Reported Total: $${(result.totalCents / 100).toFixed(2)} (${result.totalCents} cents)`)
      console.log(`   Line Sum:       $${(result.lineSumCents / 100).toFixed(2)} (${result.lineSumCents} cents)`)
      console.log(
        `   Totals Match:   ${
          result.totalsMatch ? 'YES (line sum == total)' : `NO (discrepancy: $${(result.discrepancyCents / 100).toFixed(2)})`
        }`
      )
      console.log(`   Line Items (${result.lines.length}):`)
      for (const line of result.lines) {
        console.log(
          `     • [${line.quantity}x] ${line.description} (SKU: ${line.sku || 'N/A'}) @ $${(line.unitPriceCents / 100).toFixed(2)} -> Line Total: $${(line.lineTotalCents / 100).toFixed(2)}`
        )
      }

      console.log('\n   Parsed JSON Payload:')
      console.log(
        JSON.stringify(
          {
            merchant: result.merchant,
            date: result.date,
            invoiceNumber: result.invoiceNumber,
            customer: result.customer,
            currency: result.currency,
            totalCents: result.totalCents,
            totalsMatch: result.totalsMatch,
            lineSumCents: result.lineSumCents,
            lines: result.lines,
          },
          null,
          4
        )
          .split('\n')
          .map((l) => '     ' + l)
          .join('\n')
      )
      console.log('\n----------------------------------------------------\n')
      passCount++
    } catch (err: any) {
      console.error(`\n❌ Extraction FAILED for ${filename}:`, err?.message || err)
      console.log('\n----------------------------------------------------\n')
      failCount++
    }
  }

  console.log(`\nVision Test Summary: ${passCount} passed, ${failCount} failed out of ${files.length} receipts.`)
  if (failCount > 0) {
    process.exit(1)
  }
  process.exit(0)
}

runVisionTests().catch((err) => {
  console.error('Fatal vision test error:', err)
  process.exit(1)
})
