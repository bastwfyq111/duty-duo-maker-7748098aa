export interface Shift {
  label: string;
}

export interface Schedule {
  cellId: number;
  name?: string;
  shifts: string[]; // shift codes per day, length = days
}

export function renderSchedulesToHTML(
  schedules: Schedule[],
  monthName: string,
  year: number,
  shiftColors: Record<string, string>,
  rtl = true
): string {
  const days = schedules.length > 0 ? schedules[0].shifts.length : 31;

  const css = `
  body { font-family: Arial, 'Segoe UI', Tahoma; padding: 12px; background: #fff; }
  .sheet { width: 100%; border: 1px solid #999; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #ccc; padding: 6px; text-align: center; font-size: 12px; }
  th.day { background: #f3f3f3; }
  td.name { text-align: right; padding-right: 10px; font-weight: 600; }
  .shift { color: #000; font-weight: 700; }
  .legend { margin: 8px 0; }
  .legend span { display: inline-block; padding: 4px 8px; margin-right: 8px; border-radius: 3px; color: #fff; font-weight:700 }
  .rtl { direction: rtl; }
  `;

  const legendHtml = Object.entries(shiftColors)
    .map(([k, v]) => `<span style="background:${v}">${k}</span>`)
    .join('');

  let html = `<!doctype html>
  <html ${rtl ? 'dir="rtl"' : ''}>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Schedule - ${monthName} ${year}</title>
    <style>${css}</style>
  </head>
  <body class="${rtl ? 'rtl' : ''}">
    <h2 style="text-align:center">جدول الورديات — ${monthName} ${year}</h2>
    <div class="legend">${legendHtml}</div>
    <div class="sheet">
      <table>
        <thead>
          <tr>
            <th style="width:40px">#</th>
            <th style="min-width:200px">الموظف</th>
`;

  for (let d = 1; d <= days; d++) {
    html += `            <th class="day">${d}</th>\n`;
  }

  html += `          </tr>\n        </thead>\n        <tbody>\n`;

  for (const s of schedules) {
    html += `          <tr>\n            <td>${s.cellId}</td>\n            <td class="name">${s.name ? s.name : ''}</td>\n`;
    for (let i = 0; i < days; i++) {
      const code = s.shifts[i] ?? '';
      const color = shiftColors[code] ?? '#ffffff';
      html += `            <td style="background:${color}"><span class="shift">${code}</span></td>\n`;
    }
    html += `          </tr>\n`;
  }

  html += `        </tbody>\n      </table>\n    </div>\n  </body>\n  </html>`;

  return html;
}
