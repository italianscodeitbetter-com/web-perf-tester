import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { EndpointRuleSummary, ResolvedPageTiming, SuiteSummary } from "./types.js";

const COLORS = {
  ink: "#0f172a",
  muted: "#64748b",
  border: "#e2e8f0",
  surface: "#f8fafc",
  accent: "#0284c7",
  pass: "#059669",
  passBg: "#ecfdf5",
  fail: "#dc2626",
  failBg: "#fef2f2",
  warn: "#d97706",
  warnBg: "#fffbeb",
  white: "#ffffff",
  header: "#0f172a",
};

const PAGE_MARGIN = 44;
const FOOTER_RESERVE = 36;
const HEADER_H = 26;
const BASE_ROW_H = 26;

function formatMs(ms: number): string {
  return `${Math.round(ms)} ms`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatReportDate(date = new Date()): string {
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function shortPath(p: string, maxLen = 52): string {
  if (p.length <= maxLen) return p;
  return `…${p.slice(-(maxLen - 1))}`;
}

function contentWidth(doc: PDFKit.PDFDocument): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom - FOOTER_RESERVE;
}

function pageTop(doc: PDFKit.PDFDocument): number {
  return doc.page.margins.top;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > pageBottom(doc)) {
    doc.addPage();
    doc.y = pageTop(doc);
  }
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  pageIndex: number,
  pageTotal: number,
): void {
  const y = doc.page.height - 28;
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  doc.save();
  doc
    .strokeColor(COLORS.border)
    .moveTo(x, y - 8)
    .lineTo(x + w, y - 8)
    .stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `@icib.dev/perf-web-tester  ·  Page ${pageIndex} of ${pageTotal}`,
      x,
      y,
      { width: w, align: "center", lineBreak: false },
    );
  doc.restore();
}

function fillRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
): void {
  doc.save();
  doc.roundedRect(x, y, w, h, r).fill(fill);
  doc.restore();
}

function strokeRoundedRect(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  stroke: string,
): void {
  doc.save();
  doc.roundedRect(x, y, w, h, r).stroke(stroke);
  doc.restore();
}

function drawBadge(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  label: string,
  passed: boolean,
): number {
  const padX = 10;
  doc.font("Helvetica-Bold").fontSize(9);
  const textW = doc.widthOfString(label);
  const w = textW + padX * 2;
  const h = 18;
  fillRoundedRect(doc, x, y, w, h, 9, passed ? COLORS.passBg : COLORS.failBg);
  doc
    .fillColor(passed ? COLORS.pass : COLORS.fail)
    .text(label, x + padX, y + 4, { lineBreak: false });
  return w;
}

function drawProgressBar(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  width: number,
  value: number,
  scaleMax: number,
  passed: boolean,
  budgetMarker?: number,
): void {
  const h = 8;
  fillRoundedRect(doc, x, y, width, h, 4, COLORS.border);
  const ratio = scaleMax > 0 ? value / scaleMax : 0;
  const fillW = Math.min(width * ratio, width);
  if (fillW > 0) {
    fillRoundedRect(
      doc,
      x,
      y,
      fillW,
      h,
      4,
      passed ? COLORS.pass : COLORS.fail,
    );
  }
  if (budgetMarker !== undefined && scaleMax > 0) {
    const markerX = x + width * Math.min(budgetMarker / scaleMax, 1);
    doc.save();
    doc
      .strokeColor(COLORS.ink)
      .lineWidth(1)
      .moveTo(markerX, y - 1)
      .lineTo(markerX, y + h + 1)
      .stroke();
    doc.restore();
  }
}

function measureTextHeight(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  font: string,
  size: number,
): number {
  doc.font(font).fontSize(size);
  return doc.heightOfString(text, { width });
}

function drawCover(doc: PDFKit.PDFDocument, summary: SuiteSummary): void {
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const bannerH = 96;
  const bannerTop = doc.y;
  const pad = 20;

  fillRoundedRect(doc, x, bannerTop, w, bannerH, 12, COLORS.header);

  doc.font("Helvetica-Bold").fontSize(22).fillColor(COLORS.white);
  doc.text("Web Performance Report", x + pad, bannerTop + 22, {
    width: w - pad * 2 - 80,
    lineBreak: false,
  });

  doc.font("Helvetica").fontSize(10).fillColor("#94a3b8");
  doc.text("@icib.dev/perf-web-tester", x + pad, bannerTop + 54, {
    width: w - pad * 2,
    lineBreak: false,
  });

  const badgeLabel = summary.passed ? "PASS" : "FAIL";
  doc.font("Helvetica-Bold").fontSize(9);
  const badgeW = doc.widthOfString(badgeLabel) + 20;
  drawBadge(
    doc,
    x + w - pad - badgeW,
    bannerTop + 22,
    badgeLabel,
    summary.passed,
  );

  doc.y = bannerTop + bannerH + 20;

  const passedPages = summary.pages.filter((p) => p.passed).length;
  const failedPages = summary.pages.length - passedPages;
  const totalEndpoints = summary.pages.reduce(
    (n, p) => n + p.endpointRules.length,
    0,
  );
  const failedEndpoints = summary.pages.reduce(
    (n, p) => n + p.endpointRules.filter((r) => !r.passed).length,
    0,
  );

  const cards = [
    { label: "Pages tested", value: String(summary.pages.length) },
    { label: "Pages passed", value: String(passedPages), tone: COLORS.pass },
    {
      label: "Pages failed",
      value: String(failedPages),
      tone: failedPages ? COLORS.fail : COLORS.pass,
    },
    { label: "Endpoints watched", value: String(totalEndpoints) },
    {
      label: "Endpoint failures",
      value: String(failedEndpoints),
      tone: failedEndpoints ? COLORS.fail : COLORS.pass,
    },
    { label: "Budget metric", value: summary.budgetMetric.toUpperCase() },
  ];

  const gap = 10;
  const cardW = (w - gap * 2) / 3;
  const cardH = 54;
  let cardX = x;
  let cardY = doc.y;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    if (i > 0 && i % 3 === 0) {
      cardX = x;
      cardY += cardH + gap;
    }
    fillRoundedRect(doc, cardX, cardY, cardW, cardH, 8, COLORS.surface);
    strokeRoundedRect(doc, cardX, cardY, cardW, cardH, 8, COLORS.border);
    doc.rect(cardX, cardY + 10, 3, cardH - 20).fill(COLORS.accent);
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(card.label, cardX + 14, cardY + 12, { width: cardW - 20 });
    doc
      .font("Helvetica-Bold")
      .fontSize(16)
      .fillColor(card.tone ?? COLORS.ink)
      .text(card.value, cardX + 14, cardY + 28, {
        width: cardW - 20,
        align: "right",
      });
    cardX += cardW + gap;
  }

  doc.y = cardY + cardH + 14;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(
      `${passedPages} of ${summary.pages.length} pages passed  ·  ${failedEndpoints} endpoint failure${failedEndpoints === 1 ? "" : "s"}`,
      x,
      doc.y,
      { width: w },
    );
  doc.y += 16;
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(
      `Generated ${formatReportDate()}  ·  ${summary.pages.length} page${summary.pages.length === 1 ? "" : "s"}  ·  ${totalEndpoints} endpoint${totalEndpoints === 1 ? "" : "s"}`,
      x,
      doc.y,
      { width: w },
    );
  doc.y += 14;
  doc.text(`Output: ${shortPath(summary.runOutputDir)}`, x, doc.y, { width: w });
  doc.y += 24;
}

type TableCol = { title: string; width: number };

function buildTableColumns(w: number): TableCol[] {
  const ratios = [0.09, 0.26, 0.1, 0.12, 0.18, 0.25];
  const cols = ratios.map((ratio, i) => ({
    title: ["Status", "Endpoint", "Method", "Calls", "Payload", "Failed runs"][i]!,
    width: Math.floor(w * ratio),
  }));
  cols[cols.length - 1]!.width =
    w - cols.slice(0, -1).reduce((sum, c) => sum + c.width, 0);
  return cols;
}

function drawTableHeader(
  doc: PDFKit.PDFDocument,
  x: number,
  tableY: number,
  w: number,
  cols: TableCol[],
  continued: boolean,
): void {
  doc.rect(x, tableY, w, HEADER_H).fill(COLORS.header);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.white);
  let cx = x + 8;
  const suffix = continued ? " (continued)" : "";
  for (let i = 0; i < cols.length; i++) {
    const title = i === 0 ? `Status${suffix}` : cols[i]!.title;
    doc.text(title, cx, tableY + 9, {
      width: cols[i]!.width - 10,
      lineBreak: false,
    });
    cx += cols[i]!.width;
  }
}

function drawTableGrid(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  cols: TableCol[],
): void {
  doc.save();
  doc.strokeColor(COLORS.border).lineWidth(0.5);
  doc.rect(x, y, w, h).stroke();
  let cx = x;
  for (const col of cols) {
    cx += col.width;
    if (cx < x + w) {
      doc.moveTo(cx, y).lineTo(cx, y + h).stroke();
    }
  }
  doc.restore();
}

function failedRunsText(rule: EndpointRuleSummary): string {
  const parts: string[] = [];
  if (rule.failedRunsMaxCalls.length > 0) {
    parts.push(`calls: ${rule.failedRunsMaxCalls.join(", ")}`);
  }
  if (rule.failedRunsMaxBytes.length > 0) {
    parts.push(`bytes: ${rule.failedRunsMaxBytes.join(", ")}`);
  }
  return parts.join(" · ") || "—";
}

function drawEndpointTable(
  doc: PDFKit.PDFDocument,
  rules: EndpointRuleSummary[],
): void {
  if (rules.length === 0) return;

  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const cols = buildTableColumns(w);
  const failedColWidth = cols[cols.length - 1]!.width - 10;

  ensureSpace(doc, HEADER_H + BASE_ROW_H * 3 + 24);

  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(COLORS.ink)
    .text(`Endpoint analysis (${rules.length})`, x, doc.y);
  doc.y += 16;

  let tableY = doc.y;
  let continued = false;

  const drawHeader = () => {
    drawTableHeader(doc, x, tableY, w, cols, continued);
    tableY += HEADER_H;
  };

  drawHeader();

  for (let ri = 0; ri < rules.length; ri++) {
    const rule = rules[ri]!;
    const failedText = failedRunsText(rule);
    const failedH = measureTextHeight(
      doc,
      failedText,
      failedColWidth,
      "Helvetica",
      7.5,
    );
    const rowH = Math.max(BASE_ROW_H, failedH + 14);

    if (tableY + rowH > pageBottom(doc)) {
      doc.addPage();
      doc.y = pageTop(doc);
      tableY = doc.y;
      continued = true;
      drawHeader();
    }

    const bg = ri % 2 === 0 ? COLORS.white : COLORS.surface;
    doc.rect(x, tableY, w, rowH).fill(bg);
    drawTableGrid(doc, x, tableY, w, rowH, cols);

    let cx = x + 8;
    const textY = tableY + (rowH - 10) / 2;

    doc.font("Helvetica-Bold").fontSize(8);
    doc.fillColor(rule.passed ? COLORS.pass : COLORS.fail);
    doc.text(rule.passed ? "OK" : "FAIL", cx, textY, {
      width: cols[0]!.width - 10,
      lineBreak: false,
    });
    cx += cols[0]!.width;

    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.ink);
    doc.text(rule.id, cx, tableY + 7, {
      width: cols[1]!.width - 10,
      height: rowH - 8,
      ellipsis: true,
    });
    cx += cols[1]!.width;

    doc.text(rule.method, cx, textY, {
      width: cols[2]!.width - 10,
      lineBreak: false,
    });
    cx += cols[2]!.width;

    const calls =
      rule.maxCalls !== undefined
        ? `${rule.maxCallCountInAnyRun} / ${rule.maxCalls}`
        : String(rule.maxCallCountInAnyRun);
    doc.text(calls, cx, textY, {
      width: cols[3]!.width - 10,
      lineBreak: false,
    });
    cx += cols[3]!.width;

    const bytes =
      rule.maxTotalResponseBytes !== undefined
        ? `${formatBytes(rule.maxTotalBytesInAnyRun)} / ${formatBytes(rule.maxTotalResponseBytes)}`
        : formatBytes(rule.maxTotalBytesInAnyRun);
    doc.text(bytes, cx, textY, {
      width: cols[4]!.width - 10,
      lineBreak: false,
    });
    cx += cols[4]!.width;

    doc.fillColor(COLORS.muted);
    doc.text(failedText, cx, tableY + 7, {
      width: failedColWidth,
      lineGap: 1,
    });

    tableY += rowH;
  }

  doc.y = tableY + 8;
  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor(COLORS.muted)
    .text("OK = within budget  ·  FAIL = budget exceeded", x, doc.y, { width: w });
  doc.y += 16;
}

function drawRunTimeline(
  doc: PDFKit.PDFDocument,
  page: ResolvedPageTiming,
  maxReadyMs: number,
): void {
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const labelW = 24;
  const valueW = 52;
  const barX = x + labelW + 4;
  const barW = w - labelW - valueW - 8;

  ensureSpace(doc, 50 + page.results.length * 16);

  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink);
  doc.text("Run timeline", x, doc.y);
  doc.y += 14;
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(`Budget: ${formatMs(maxReadyMs)}`, x, doc.y);
  doc.y += 14;

  const scaleMax = Math.max(
    maxReadyMs * 1.1,
    ...page.results.map((r) => r.readyMs),
    1,
  );

  for (const run of page.results) {
    const rowY = doc.y;
    const passed = run.readyMs <= maxReadyMs;
    doc
      .font("Helvetica")
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`#${run.run}`, x, rowY + 2, { width: labelW, lineBreak: false });
    drawProgressBar(
      doc,
      barX,
      rowY + 1,
      barW,
      run.readyMs,
      scaleMax,
      passed,
      maxReadyMs,
    );
    doc
      .font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(passed ? COLORS.pass : COLORS.fail)
      .text(formatMs(run.readyMs), barX + barW + 8, rowY + 2, {
        width: valueW,
        align: "right",
        lineBreak: false,
      });
    doc.y = rowY + 16;
  }
  doc.y += 8;
}

function drawPageSection(
  doc: PDFKit.PDFDocument,
  page: ResolvedPageTiming,
  budgetMetric: SuiteSummary["budgetMetric"],
  index: number,
): void {
  ensureSpace(doc, 180);
  const x = doc.page.margins.left;
  const w = contentWidth(doc);
  const cardPad = 14;
  const cardTop = doc.y;

  doc.font("Helvetica").fontSize(8.5);
  const urlH = measureTextHeight(doc, page.url, w - cardPad * 2, "Helvetica", 8.5);
  const metricsH = 42;
  const budgetBarBlock = 28;
  const estimatedMin =
    cardPad * 2 + 52 + urlH + metricsH + budgetBarBlock + 40;
  ensureSpace(doc, Math.min(estimatedMin, 220));

  const sectionStart = doc.y;
  let innerY = sectionStart + cardPad;

  fillRoundedRect(doc, x, sectionStart, w, 4, 2, page.passed ? COLORS.pass : COLORS.fail);
  innerY += 10;

  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(COLORS.ink)
    .text(`Page ${index + 1}`, x + cardPad, innerY, { lineBreak: false });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text(`  ·  ${page.runs} runs`, x + cardPad + 52, innerY + 2, {
      lineBreak: false,
    });
  innerY += 20;

  drawBadge(
    doc,
    x + cardPad,
    innerY,
    page.passed ? "PASS" : "FAIL",
    page.passed,
  );
  innerY += 26;

  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.muted)
    .text(page.url, x + cardPad, innerY, { width: w - cardPad * 2 });
  innerY += urlH + 12;

  const metrics = [
    { label: budgetMetric.toUpperCase(), value: formatMs(page.metricValueMs) },
    { label: "Budget", value: formatMs(page.maxReadyMs) },
    { label: "Median", value: formatMs(page.medianReadyMs) },
    { label: "P95", value: formatMs(page.p95ReadyMs) },
    { label: "Min", value: formatMs(page.minReadyMs) },
    { label: "Max", value: formatMs(page.maxObservedReadyMs) },
  ];
  const metricGap = 8;
  const metricW = (w - cardPad * 2 - metricGap * 5) / 6;
  let mx = x + cardPad;
  const metricsY = innerY;
  for (const m of metrics) {
    fillRoundedRect(doc, mx, metricsY, metricW, metricsH, 6, COLORS.surface);
    strokeRoundedRect(doc, mx, metricsY, metricW, metricsH, 6, COLORS.border);
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor(COLORS.muted)
      .text(m.label, mx + 8, metricsY + 8, { width: metricW - 12 });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(COLORS.ink)
      .text(m.value, mx + 8, metricsY + 22, {
        width: metricW - 12,
        align: "right",
      });
    mx += metricW + metricGap;
  }
  innerY = metricsY + metricsH + 14;

  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(COLORS.muted)
    .text("Time-to-ready vs budget", x + cardPad, innerY);
  innerY += 14;
  drawProgressBar(
    doc,
    x + cardPad,
    innerY,
    w - cardPad * 2,
    page.metricValueMs,
    page.maxReadyMs,
    page.timingPassed,
  );
  innerY += budgetBarBlock;

  doc.y = innerY;
  strokeRoundedRect(
    doc,
    x,
    sectionStart,
    w,
    innerY - sectionStart,
    8,
    COLORS.border,
  );

  doc.y = innerY + 8;
  drawEndpointTable(doc, page.endpointRules);
  drawRunTimeline(doc, page, page.maxReadyMs);

  const untracked = page.results.flatMap((r) =>
    r.untrackedRepeatApis.map((u) => ({ run: r.run, ...u })),
  );
  if (untracked.length > 0) {
    ensureSpace(doc, 36 + untracked.length * 24);
    doc
      .font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(COLORS.warn)
      .text("Untracked repeat APIs", x, doc.y);
    doc.y += 16;
    for (const u of untracked) {
      const rowTop = doc.y;
      const rowH = 20;
      fillRoundedRect(doc, x, rowTop, w, rowH, 4, COLORS.warnBg);
      strokeRoundedRect(doc, x, rowTop, w, rowH, 4, "#fcd34d");
      doc
        .font("Helvetica")
        .fontSize(8)
        .fillColor(COLORS.ink)
        .text(
          `Run ${u.run}  ·  ${u.method}  ·  ${u.url}  ·  ${u.count}×`,
          x + 8,
          rowTop + 6,
          { width: w - 16, ellipsis: true },
        );
      doc.y = rowTop + rowH + 6;
    }
  }

  doc.y += 12;
}

export function writeSuiteReportPdf(
  summary: SuiteSummary,
  destPath: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const doc = new PDFDocument({
      margin: PAGE_MARGIN,
      size: "A4",
      bufferPages: true,
    });
    const stream = fs.createWriteStream(destPath);
    doc.pipe(stream);

    drawCover(doc, summary);

    for (let i = 0; i < summary.pages.length; i++) {
      if (i > 0 && doc.y > pageBottom(doc) - 200) {
        doc.addPage();
        doc.y = pageTop(doc);
      }
      drawPageSection(doc, summary.pages[i]!, summary.budgetMetric, i);
    }

    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      drawFooter(doc, i - range.start + 1, range.count);
    }

    doc.end();
    stream.on("finish", () => resolve());
    stream.on("error", reject);
    doc.on("error", reject);
  });
}

/** @internal Count pages in a written PDF buffer (for tests). */
export function countPdfPages(buffer: Buffer): number {
  const s = buffer.toString("latin1");
  const matches = s.match(/\/Type\s*\/Page\b/g);
  return matches?.length ?? 0;
}
