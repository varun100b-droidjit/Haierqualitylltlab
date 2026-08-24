export interface PDFExportData {
  title: string;
  unitType: string;
  modelName: string;
  serialNumber: string;
  status: string;
  details: { label: string; value: string }[];
  remarks?: string;
  purpose?: string;
  observations?: { id: string; text: string; timestamp: string }[];
  extraInfo?: { label: string; value: string }[];
}

export function exportUnitToPDF(data: PDFExportData) {
  const printWindow = window.open('', '_blank', 'width=850,height=950');
  if (!printWindow) {
    alert('Please allow popups for this site to download the PDF.');
    return;
  }

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${data.modelName}_${data.serialNumber}_Report</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body {
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            color: #0f172a;
            margin: 0;
            padding: 24px;
            background: #ffffff;
            font-size: 13px;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #0891b2;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .logo-title {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .header h1 {
            margin: 0;
            font-size: 20px;
            color: #0e7490;
            letter-spacing: -0.5px;
          }
          .header p {
            margin: 2px 0 0 0;
            font-size: 11px;
            color: #64748b;
            font-weight: 500;
          }
          .badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            background: #ecfeff;
            color: #0891b2;
            border: 1px solid #a5f3fc;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            color: #0891b2;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 4px;
            margin-top: 22px;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 10px;
            margin-bottom: 14px;
            page-break-inside: avoid;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 8px 12px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .card .label {
            font-size: 9px;
            text-transform: uppercase;
            color: #64748b;
            font-weight: 700;
            display: block;
            margin-bottom: 2px;
          }
          .card .value {
            font-size: 12px;
            font-weight: 700;
            color: #0f172a;
          }
          .box {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 10px 12px;
            margin-bottom: 10px;
            font-size: 11px;
            color: #334155;
            line-height: 1.5;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .obs-item {
            border-left: 3px solid #06b6d4;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-left-width: 4px;
            padding: 8px 12px;
            margin-bottom: 6px;
            border-radius: 0 8px 8px 0;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .obs-text {
            font-weight: 600;
            color: #1e293b;
            font-size: 12px;
          }
          .obs-time {
            font-size: 10px;
            color: #64748b;
            font-family: monospace;
            margin-top: 4px;
          }
          .footer {
            margin-top: 36px;
            border-top: 1px solid #e2e8f0;
            padding-top: 12px;
            text-align: center;
            font-size: 10px;
            color: #94a3b8;
          }
          @media print {
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="logo-title">
              <h1>${data.title}</h1>
            </div>
            <p>${data.unitType} &bull; Inspection & Specification Report</p>
          </div>
          <div style="text-align: right;">
            <span class="badge">${data.status}</span>
            <p style="margin-top: 6px;">Generated: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <span class="label">Model Name</span>
            <span class="value" style="color: #0891b2;">${data.modelName}</span>
          </div>
          <div class="card">
            <span class="label">Serial Number</span>
            <span class="value">${data.serialNumber}</span>
          </div>
          ${data.details.map(d => `
            <div class="card">
              <span class="label">${d.label}</span>
              <span class="value">${d.value}</span>
            </div>
          `).join('')}
        </div>

        ${data.purpose ? `
          <div class="section-title">Testing Purpose</div>
          <div class="box">${data.purpose}</div>
        ` : ''}

        ${data.remarks ? `
          <div class="section-title">Remarks / Notes</div>
          <div class="box">${data.remarks}</div>
        ` : ''}

        ${data.extraInfo && data.extraInfo.length > 0 ? `
          <div class="section-title">Additional Specifications / Parts Info</div>
          <div class="grid">
            ${data.extraInfo.map(e => `
              <div class="card">
                <span class="label">${e.label}</span>
                <span class="value">${e.value}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div class="section-title">Observation Notes (${data.observations?.length || 0})</div>
        ${data.observations && data.observations.length > 0 ? `
          <div>
            ${data.observations.map(obs => `
              <div class="obs-item">
                <div class="obs-text">${obs.text}</div>
                <div class="obs-time">&bull; Logged: ${obs.timestamp}</div>
              </div>
            `).join('')}
          </div>
        ` : `
          <div style="color: #94a3b8; font-style: italic; font-size: 11px;">No observation notes recorded for this unit.</div>
        `}

        <div class="footer">
          R&D Machine Tracking System &bull; Confidential Report
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
