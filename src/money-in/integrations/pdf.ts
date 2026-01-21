import PDFDocument from 'pdfkit';
import { saveBuffer } from './storage.js';

export interface InvoicePdfInput {
  invoiceNumber: string;
  clientName: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  lineItems: Array<{ description: string; quantity: number; unit_price_cents: number; amount_cents: number }>;
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  notes?: string | null;
  terms?: string | null;
}

export async function generateInvoicePdf(data: InvoicePdfInput) {
  const doc = new PDFDocument({ margin: 50 });
  const buffers: Buffer[] = [];

  doc.on('data', (chunk) => buffers.push(chunk));

  doc.fontSize(20).text(`Invoice ${data.invoiceNumber}`, { align: 'left' });
  doc.moveDown();
  doc.fontSize(12).text(`Client: ${data.clientName}`);
  doc.text(`Issue Date: ${data.issueDate}`);
  doc.text(`Due Date: ${data.dueDate}`);
  doc.moveDown();

  doc.fontSize(12).text('Line Items', { underline: true });
  doc.moveDown(0.5);

  data.lineItems.forEach((item) => {
    doc.text(`${item.description} - ${item.quantity} x ${item.unit_price_cents} = ${item.amount_cents}`);
  });

  doc.moveDown();
  doc.text(`Subtotal: ${data.subtotal_cents}`);
  doc.text(`Discount: ${data.discount_cents}`);
  doc.text(`Tax: ${data.tax_cents}`);
  doc.text(`Total: ${data.total_cents} ${data.currency}`);

  if (data.notes) {
    doc.moveDown();
    doc.text(`Notes: ${data.notes}`);
  }

  if (data.terms) {
    doc.moveDown();
    doc.text(`Terms: ${data.terms}`);
  }

  doc.end();

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', (err) => reject(err));
  });

  return saveBuffer(`${data.invoiceNumber}.pdf`, buffer);
}
