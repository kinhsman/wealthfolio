// money-hub patch: Settings, Banks, Email alerts with made-up data (one Gmail, MB set up from the
// owner's sample email), for a picture before shipping (vite.preview.config.ts). ?theme=light|dark.
// The helper's answers are faked here; nothing reaches a server.
import React from "react";
import ReactDOM from "react-dom/client";

import "../src/globals.css";
import "../src/i18n/i18n";

import { TooltipProvider } from "@wealthfolio/ui";
import { EmailBanksSection } from "../src/pages/settings/banks/email-banks-section";

const mbText = [
  "Cảm ơn Quý khách đã sử dụng dịch vụ MB eBanking.", "Ngày, giờ giao dịch", "03-10-2026 05:39:39", "Loại giao dịch",
  "Chuyển tiền nhanh ngoài MB", "Số tham chiếu", "26100300000000001", "Tài khoản trích nợ", "NGUYEN VAN A - 12345678 (VND)",
  "Người thụ hưởng", "NGUYEN VAN A - 87654321", "Số tiền giao dịch", "(VND) 10,000.00", "Nội dung chuyển tiền",
  "NGUYEN VAN A chuyen tien", "Tình trạng", "Giao dịch thành công",
].join("\n");
const preset = {
  key: "mb", name: "MB Bank (transfers you make)", bankName: "MB Bank", currency: "VND",
  match: { mode: "all", conditions: [
    { field: "from", op: "contains", value: "mbebanking@mbbank.com.vn" },
    { field: "subject", op: "contains", value: "Thong bao giao dich thanh cong" },
    { field: "body", op: "contains", value: "Giao dịch thành công" },
  ] },
  fields: {
    date: { before: "Ngày, giờ giao dịch", after: "" }, time: { before: "Ngày, giờ giao dịch", after: "" },
    amount: { before: "Số tiền giao dịch", after: "" }, account: { before: "Tài khoản trích nợ", after: "" },
    description: { before: "Nội dung chuyển tiền", after: "" }, counterparty: { before: "Người thụ hưởng", after: "" },
    reference: { before: "Số tham chiếu", after: "" }, balance: { before: "", after: "" },
  },
  dateFormat: "DMY", numberStyle: "comma", timeZone: "Asia/Ho_Chi_Minh",
  direction: { default: "out", useSign: true, inWords: [], outWords: [] },
};
const status = {
  clientReady: true, lastRun: new Date().toISOString(), busy: false,
  mailboxes: [{ id: "g1", email: "you@gmail.com", linkedAt: "2026-10-02T23:00:00Z", error: null, expiresAt: null }],
  banks: [{
    ...preset, id: "b1", accountName: "MB checking", mailboxId: "g1", type: "bank", startDate: "2026-09-01", ownWords: ["NGUYEN VAN A"],
    balanceSet: { amount: 2500000, at: "2026-10-02T23:00:00Z" }, enabled: true, lastCheck: new Date().toISOString(), emails: 1, problems: [],
    imported: { added: 1, updated: 0, removed: 0 }, error: null,
  }],
  presets: [preset, { ...preset, key: "acb", name: "ACB (balance change alert)", bankName: "ACB" }],
};
const previewAnswer = {
  query: "from:(mbebanking@mbbank.com.vn)", balance: 2490000,
  rows: [{
    id: "m1", from: "mbebanking@mbbank.com.vn", subject: "Thong bao giao dich thanh cong", date: Date.now(), text: mbText, ok: true, problems: [],
    values: { date: "2026-10-03", time: "05:39:39", amount: 10000, out: true, account: "NGUYEN VAN A - 12345678 (VND)",
      description: "NGUYEN VAN A chuyen tien", counterparty: "NGUYEN VAN A - 87654321", reference: "26100300000000001", balance: null, own: true },
  }, {
    id: "m2", from: "mbebanking@mbbank.com.vn", subject: "Thong bao giao dich thanh cong", date: Date.now() - 86400000, text: mbText, ok: false,
    problems: ["Amount words not found"],
    values: { date: "2026-10-02", time: "18:02:11", amount: null, out: true, account: null, description: null, counterparty: null, reference: null, balance: null, own: false },
  }],
};
window.fetch = (async (input: RequestInfo | URL) => {
  const url = String(input);
  const pic = (fill: string, text: string) =>
    `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#fff"/><text x="64" y="76" font-size="34" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="${fill}">${text}</text></svg>`)}`;
  const choices = { choices: [{ key: "k1", dataUrl: pic("#1d4ed8", "BANK") }, { key: "k2", dataUrl: pic("#64748b", "~~~") }] };
  const body = url.endsWith("/preview") ? previewAnswer : url.endsWith("/logo-choices") ? choices : status;
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <div className="bg-background text-foreground min-h-screen p-4 sm:p-8">
        <div className="mx-auto max-w-3xl"><EmailBanksSection /></div>
      </div>
    </TooltipProvider>
  </React.StrictMode>,
);
