const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const outDir = path.join(__dirname, '../public/demo-receipts')
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

const receipts = [
  {
    filename: 'receipt-bulk-discount.png',
    merchant: 'METRO ELECTRONICS WHOLESALE & SUPPLY',
    address: '840 Market St, San Francisco, CA 94102',
    phone: '(415) 555-0199',
    date: '2026-11-10 14:22:18',
    orderNo: 'REC-98214',
    cashier: 'Alex M. (#12)',
    items: [
      {
        name: 'Multiport USB-C Hub (7-in-1)',
        sku: 'HUB-USBC-7IN1',
        qty: 16,
        unitPrice: '49.99',
        discount: '50.00',
        lineTotal: '749.84',
        note: 'Tier-2 Volume Discount applied (-$50.00)',
      },
      {
        name: 'Ultra-Slim Laptop Sleeve 15-inch',
        sku: 'ACC-SLV-15GRY',
        qty: 10,
        unitPrice: '29.99',
        discount: '25.00',
        lineTotal: '274.90',
        note: 'VIP Commercial Discount (-$25.00)',
      },
    ],
    subtotal: '1099.74',
    totalDiscount: '75.00',
    tax: '0.00',
    total: '1024.74',
    paymentMethod: 'Corporate Visa **** 4912',
  },
  {
    filename: 'receipt-store-sale.png',
    merchant: 'BAY AREA CONVENIENCE & DIGITAL',
    address: '220 4th Street, San Francisco, CA 94103',
    phone: '(415) 555-4821',
    date: '2026-11-10 16:45:00',
    orderNo: 'POS-44019',
    cashier: 'Sarah T.',
    items: [
      {
        name: 'Phone Charger (USB-C 20W PD)',
        sku: 'CHG-USBC-20W',
        qty: 3,
        unitPrice: '24.99',
        discount: '0.00',
        lineTotal: '74.97',
      },
      {
        name: 'Braided USB-C to USB-A Cable (1m)',
        sku: 'CBL-USBA-C1M',
        qty: 4,
        unitPrice: '12.99',
        discount: '0.00',
        lineTotal: '51.96',
      },
    ],
    subtotal: '126.93',
    totalDiscount: '0.00',
    tax: '0.00',
    total: '126.93',
    paymentMethod: 'Mastercard Debit **** 8820',
  },
  {
    filename: 'receipt-peripherals.png',
    merchant: 'PACIFIC TECH HARDWARE & SUPPLIES',
    address: '1050 Mission St, San Francisco, CA 94103',
    phone: '(415) 555-7310',
    date: '2026-11-11 10:15:30',
    orderNo: 'INV-88912',
    cashier: 'Dave K.',
    items: [
      {
        name: 'Wireless Mechanical Keyboard',
        sku: 'KB-MECH-RGB',
        qty: 2,
        unitPrice: '89.99',
        discount: '0.00',
        lineTotal: '179.98',
      },
      {
        name: 'Ergonomic Wireless Mouse',
        sku: 'MOU-ERGO-WL',
        qty: 2,
        unitPrice: '45.00',
        discount: '0.00',
        lineTotal: '90.00',
      },
    ],
    subtotal: '269.98',
    totalDiscount: '0.00',
    tax: '0.00',
    total: '269.98',
    paymentMethod: 'Amex Business **** 1004',
  },
]

function generateHtml(r) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #f4f4f4;
      font-family: 'Courier New', Courier, monospace;
      color: #111;
      display: flex;
      justify-content: center;
      padding: 24px;
    }
    .receipt {
      width: 420px;
      background: #ffffff;
      padding: 30px 24px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.1);
      border-radius: 4px;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .title { font-size: 17px; letter-spacing: 1px; margin-bottom: 6px; }
    .subtitle { font-size: 11px; color: #444; margin-bottom: 2px; }
    .divider {
      border-top: 1px dashed #444;
      margin: 14px 0;
    }
    .double-divider {
      border-top: 2px solid #222;
      margin: 14px 0;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      margin-bottom: 4px;
      color: #333;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    .item-header {
      border-bottom: 1px solid #222;
      padding-bottom: 4px;
      font-size: 11px;
      font-weight: bold;
    }
    .item-row td {
      padding-top: 8px;
      vertical-align: top;
    }
    .sku {
      font-size: 10px;
      color: #555;
      margin-top: 2px;
    }
    .note {
      font-size: 10px;
      color: #0b7285;
      font-style: italic;
      margin-top: 2px;
    }
    .text-right { text-align: right; }
    .totals-section {
      margin-top: 12px;
      font-size: 12px;
    }
    .totals-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .grand-total {
      font-size: 16px;
      font-weight: bold;
      margin-top: 8px;
      padding-top: 6px;
      border-top: 2px solid #111;
    }
    .barcode {
      text-align: center;
      margin-top: 20px;
      letter-spacing: 4px;
      font-size: 16px;
    }
    .footer {
      text-align: center;
      font-size: 10px;
      color: #666;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="center">
      <div class="title bold">${r.merchant}</div>
      <div class="subtitle">${r.address}</div>
      <div class="subtitle">Tel: ${r.phone}</div>
    </div>

    <div class="divider"></div>

    <div class="meta-row">
      <span>DATE: ${r.date}</span>
      <span>ORDER: ${r.orderNo}</span>
    </div>
    <div class="meta-row">
      <span>CASHIER: ${r.cashier}</span>
      <span>TERMINAL: #01-POS</span>
    </div>

    <div class="divider"></div>

    <table class="items-table">
      <thead>
        <tr class="item-header">
          <th style="text-align: left;">ITEM / SKU</th>
          <th class="text-right">QTY</th>
          <th class="text-right">PRICE</th>
          <th class="text-right">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${r.items
          .map(
            (it) => `
          <tr class="item-row">
            <td>
              <div class="bold">${it.name}</div>
              <div class="sku">SKU: ${it.sku}</div>
              ${it.note ? `<div class="note">${it.note}</div>` : ''}
            </td>
            <td class="text-right bold">${it.qty}</td>
            <td class="text-right">$${it.unitPrice}</td>
            <td class="text-right bold">$${it.lineTotal}</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>

    <div class="divider"></div>

    <div class="totals-section">
      <div class="totals-row">
        <span>SUBTOTAL:</span>
        <span>$${r.subtotal}</span>
      </div>
      ${
        r.totalDiscount !== '0.00'
          ? `<div class="totals-row" style="color: #c92a2a; font-weight: bold;">
        <span>DISCOUNT / SAVINGS:</span>
        <span>-$${r.totalDiscount}</span>
      </div>`
          : ''
      }
      <div class="totals-row">
        <span>SALES TAX (0.0%):</span>
        <span>$${r.tax}</span>
      </div>
      <div class="totals-row grand-total">
        <span>TOTAL DUE:</span>
        <span>$${r.total}</span>
      </div>
      <div class="totals-row" style="margin-top: 8px; font-size: 11px; color: #555;">
        <span>PAYMENT:</span>
        <span>${r.paymentMethod}</span>
      </div>
    </div>

    <div class="double-divider"></div>

    <div class="barcode">||| | |||| | |||||| || | |||</div>
    <div class="footer">
      THANK YOU FOR YOUR BUSINESS!<br>
      ALL RETURNS REQUIRE RECEIPT WITHIN 30 DAYS
    </div>
  </div>
</body>
</html>`
}

for (const r of receipts) {
  const html = generateHtml(r)
  const tempHtmlPath = path.join('/tmp', `${r.filename}.html`)
  const outPngPath = path.join(outDir, r.filename)
  fs.writeFileSync(tempHtmlPath, html, 'utf8')

  console.log(`Rendering ${r.filename}...`)
  execSync(
    `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --screenshot="${outPngPath}" --window-size=480,820 "file://${tempHtmlPath}"`,
    { stdio: 'inherit' }
  )
  console.log(`Rendered ${outPngPath}`)
}

console.log('All receipts generated successfully!')
