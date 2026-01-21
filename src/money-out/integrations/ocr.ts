import fs from 'node:fs/promises';
import { ReceiptParser, ReceiptExtractedData } from '../utils/receipt-parser.js';

export interface OCRResult {
  text: string;
  confidence: number;
  blocks: Array<{
    text: string;
    confidence: number;
    boundingBox: { top: number; left: number; width: number; height: number };
  }>;
}

export interface OCRService {
  extractText(imageUrl: string): Promise<OCRResult>;
  extractStructuredData(imageUrl: string): Promise<ReceiptExtractedData>;
}

class StubOCRService implements OCRService {
  private parser = new ReceiptParser();

  async extractText(imageUrl: string): Promise<OCRResult> {
    try {
      const buffer = await fs.readFile(imageUrl);
      const text = buffer.toString('utf8');
      const trimmed = text.trim();
      return {
        text: trimmed,
        confidence: trimmed ? 80 : 0,
        blocks: []
      };
    } catch {
      return { text: '', confidence: 0, blocks: [] };
    }
  }

  async extractStructuredData(imageUrl: string): Promise<ReceiptExtractedData> {
    const result = await this.extractText(imageUrl);
    return this.parser.parseReceiptText(result.text);
  }
}

class GeminiOCRService extends StubOCRService {}

class MindeeOCRService extends StubOCRService {
  async extractText(imageUrl: string): Promise<OCRResult> {
    const base = await super.extractText(imageUrl);
    const lines = base.text.split(/\r?\n/).filter(Boolean);
    return {
      ...base,
      blocks: lines.map((line, index) => ({
        text: line,
        confidence: base.confidence,
        boundingBox: {
          top: index * 10,
          left: 0,
          width: Math.min(400, line.length * 6),
          height: 10
        }
      }))
    };
  }
}

export interface RoutedOCRResult {
  provider: 'gemini_flash' | 'mindee';
  ocr: OCRResult;
  extracted: ReceiptExtractedData;
}

class HybridOCRRouter {
  private parser = new ReceiptParser();
  private gemini = new GeminiOCRService();
  private mindee = new MindeeOCRService();

  async extract(imageUrl: string): Promise<RoutedOCRResult> {
    const geminiResult = await this.gemini.extractText(imageUrl);
    const parsed = this.parser.parseReceiptText(geminiResult.text);
    const totalCents = Number(parsed.total_amount_cents ?? 0);
    const isComplex = (parsed.line_items?.length ?? 0) > 5 || geminiResult.text.length > 2000;
    const useMindee = totalCents >= 5000 || isComplex;

    if (!useMindee) {
      return { provider: 'gemini_flash', ocr: geminiResult, extracted: parsed };
    }

    const mindeeResult = await this.mindee.extractText(imageUrl);
    const mindeeParsed = this.parser.parseReceiptText(mindeeResult.text);
    return { provider: 'mindee', ocr: mindeeResult, extracted: mindeeParsed };
  }
}

export const ocrRouter = new HybridOCRRouter();
