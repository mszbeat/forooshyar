import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { parse as parseCsv } from 'csv-parse/sync';
import ExcelJS from 'exceljs';
import { fromBuffer } from 'yauzl';
import { z } from 'zod';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../logging/audit.service';

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 1000;
const MAX_COLUMNS = 20;
type Cell = string | number | null | undefined;
type Row = { number: number; cells: Cell[]; unsupported?: number[] };

// Read each ZIP entry with a bound before handing the archive to ExcelJS. This
// limits both declared and actual expanded size; never extract to the filesystem.
async function validateArchive(buffer: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) return reject(new Error('Invalid Excel archive'));
      let total = 0; let count = 0; let settled = false;
      const fail = () => { if (!settled) { settled = true; zip.close(); reject(new Error('Invalid or oversized Excel archive')); } };
      zip.on('error', fail);
      zip.on('entry', entry => {
        count++;
        if (count > 1000 || (entry.generalPurposeBitFlag & 1) !== 0 || entry.uncompressedSize > MAX_EXPANDED_BYTES || total + entry.uncompressedSize > MAX_EXPANDED_BYTES) return fail();
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) return fail();
          stream.on('data', (chunk: Buffer) => { total += chunk.length; if (total > MAX_EXPANDED_BYTES) { stream.destroy(); fail(); } });
          stream.on('error', fail);
          stream.on('end', () => { if (!settled) zip.readEntry(); });
        });
      });
      zip.on('end', () => { if (!settled) { settled = true; resolve(); } });
      zip.readEntry();
    });
  });
}

async function readRows(filename: string, buffer: Buffer): Promise<Row[]> {
  if (buffer.length === 0 || buffer.length > MAX_FILE_BYTES) throw new BadRequestException('File must be between 1 byte and 2 MiB');
  const ext = filename.toLowerCase().split('.').pop();
  try {
    if (ext === 'csv') {
      const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      const rows = parseCsv(decoded, { bom: true, skip_empty_lines: false, relax_column_count: true, info: true, max_record_size: 65536 }) as { record: string[]; info: { lines: number } }[];
      if (rows.length > MAX_ROWS + 1) throw new Error('Too many rows');
      if (rows.some(row => row.record.length > MAX_COLUMNS)) throw new Error('Too many columns');
      return rows.map(row => ({ number: row.info.lines, cells: row.record }));
    }
    if (ext === 'xlsx') {
      await validateArchive(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.worksheets[0];
      if (!sheet || sheet.rowCount > MAX_ROWS + 1 || sheet.columnCount > MAX_COLUMNS) throw new Error('Invalid worksheet dimensions');
      const rows: Row[] = [];
      sheet.eachRow({ includeEmpty: true }, (row, number) => {
        const cells: Cell[] = [];
        const unsupported: number[] = [];
        for (let col = 1; col <= sheet.columnCount; col++) {
          const value = row.getCell(col).value;
          // Formulas, hyperlinks, rich text, dates and errors are intentionally not evaluated.
          if (value !== null && typeof value !== 'string' && typeof value !== 'number') unsupported.push(col - 1);
          cells.push(value === null || typeof value === 'string' || typeof value === 'number' ? value : undefined);
        }
        rows.push({ number, cells, unsupported });
      });
      return rows;
    }
    throw new Error('Only CSV and XLSX are supported');
  } catch {
    throw new BadRequestException('Invalid file, unsupported format, or file exceeds import limits');
  }
}

const aliases: Record<string, string> = {
  title: 'title', name: 'title', 'نام': 'title', 'نام محصول': 'title',
  price: 'price', 'قیمت': 'price', stock: 'stock', 'موجودی': 'stock',
  size: 'size', 'سایز': 'size', color: 'color', 'رنگ': 'color', sku: 'sku',
  type: 'type', 'نوع': 'type', category: 'category', 'دسته': 'category',
};
function normalizeHeader(value: Cell): string {
  return String(value ?? '').trim().toLowerCase().replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ');
}
function normalizeNumber(value: Cell): number | null {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/[۰-۹٠-٩]/g, c => String(c.charCodeAt(0) - (c >= '۰' && c <= '۹' ? 1776 : 1632))).replace(/[٬,\s]/g, '');
  if (!/^\d+$/.test(normalized)) return null;
  return Number(normalized);
}
const integer = z.number().int().min(0).max(2147483647);
const schema = z.object({
  title: z.string().trim().min(1).max(200),
  price: integer,
  stock: integer,
  size: z.string().trim().max(2000),
  color: z.string().trim().max(2000),
  sku: z.string().trim().max(200).optional(),
  type: z.enum(['PRODUCT', 'SERVICE']).optional(),
  category: z.string().trim().max(200).optional(),
  /** ویژگی‌های آزاد: هر ستون اضافه با نام دلخواه یک ویژگی است. */
  attributes: z.record(z.string(), z.string().trim().max(2000)).optional(),
});
type ValidRow = z.infer<typeof schema>;

@Injectable()
export class ImportService {
  constructor(private readonly db: PrismaService, private readonly audit: AuditService) {}
  async importFile(shopId: string, actorId: string, filename: string, buffer: Buffer) {
    const rows = await readRows(filename, buffer);
    if (rows.length === 0) throw new BadRequestException('File is empty');
    // ستون‌های شناخته‌شده + ستون‌های اضافه (ویژگی آزاد). نام ویژگی از هدر اصلی حفظ می‌شود.
    const rawHeaders = rows[0].cells.map(value => String(value ?? '').trim());
    const headers = rawHeaders.map(value => aliases[normalizeHeader(value)] ?? '');
    const populated = headers.filter(Boolean);
    if (new Set(populated).size !== populated.length || !['title', 'price', 'stock'].every(key => populated.includes(key))) {
      throw new BadRequestException('Headers must include title, price and stock without duplicates');
    }
    const results: { row: number; status: 'imported' | 'error'; productId?: string; variantId?: string; errors?: string[] }[] = [];
    for (const row of rows.slice(1)) {
      if (row.unsupported?.some(index => Boolean(headers[index]) || rawHeaders[index] !== '')) {
        results.push({ row: row.number, status: 'error', errors: ['Formula or unsupported cell value'] });
        continue;
      }
      if (row.cells.every(cell => cell === '' || cell === null || cell === undefined)) continue;
      const input: Record<string, Cell> = {};
      const attributeValues: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) input[header] = row.cells[index];
        else if (rawHeaders[index] !== '') attributeValues[rawHeaders[index]] = row.cells[index] == null ? '' : String(row.cells[index]);
      });
      const typeRaw = typeof input.type === 'string' ? input.type.trim().toUpperCase() : undefined;
      const parsed = schema.safeParse({
        title: typeof input.title === 'string' ? input.title : '',
        price: normalizeNumber(input.price),
        stock: normalizeNumber(input.stock),
        size: input.size == null ? '' : String(input.size),
        color: input.color == null ? '' : String(input.color),
        sku: input.sku == null || String(input.sku).trim() === '' ? undefined : String(input.sku),
        type: typeRaw === 'SERVICE' || typeRaw === 'خدمت' ? 'SERVICE' : typeRaw === 'PRODUCT' || typeRaw === 'کالا' ? 'PRODUCT' : undefined,
        category: input.category == null || String(input.category).trim() === '' ? undefined : String(input.category),
        attributes: Object.keys(attributeValues).length ? attributeValues : undefined,
      });
      if (!parsed.success) {
        results.push({ row: row.number, status: 'error', errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) });
        continue;
      }
      try {
        const created = await this.createRow(shopId, actorId, parsed.data);
        results.push({ row: row.number, status: 'imported', ...created });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          results.push({ row: row.number, status: 'error', errors: ['SKU already exists in this shop'] });
        } else { throw error; }
      }
    }
    const summary = {
      imported: results.filter(row => row.status === 'imported').length,
      failed: results.filter(row => row.status === 'error').length,
      results,
    };
    this.audit.record({
      action: 'catalog.import',
      entity: 'catalog',
      shopId,
      userId: actorId,
      meta: {
        filename,
        rows: results.length,
        imported: summary.imported,
        failed: summary.failed,
        // first few failures are enough to reproduce the problem later
        errorSample: results.filter(row => row.status === 'error').slice(0, 5),
      },
    });
    return summary;
  }
  /**
   * اکسپورت کاتالوگ به CSV (UTF-8 با BOM برای اکسل فارسی):
   * هر ردیف یک واریانت است؛ ستون‌های ویژگی از روی `optionsJson` ساخته می‌شوند
   * تا فایل دوباره قابل ایمپورت باشد (round-trip).
   */
  async exportCsv(shopId: string): Promise<{ filename: string; content: string }> {
    const products = await this.db.product.findMany({
      where: { shopId },
      include: { variants: { where: { active: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    });
    const attributeNames: string[] = [];
    for (const product of products) {
      for (const variant of product.variants) {
        const options = (variant.optionsJson as Record<string, string>) ?? {};
        for (const name of Object.keys(options)) {
          if (!attributeNames.includes(name)) attributeNames.push(name);
        }
      }
    }
    const escape = (value: string | number | null | undefined) => {
      const text = value == null ? '' : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const header = ['نام', 'نوع', 'دسته', 'قیمت', 'موجودی', 'سایز', 'رنگ', 'SKU', ...attributeNames];
    const lines = [header.map(escape).join(',')];
    for (const product of products) {
      for (const variant of product.variants) {
        const options = (variant.optionsJson as Record<string, string>) ?? {};
        const row = [
          product.title,
          product.type === 'SERVICE' ? 'خدمت' : 'کالا',
          product.category,
          variant.price,
          variant.stock,
          variant.size,
          variant.color,
          variant.sku ?? '',
          ...attributeNames.map((name) => options[name] ?? ''),
        ];
        lines.push(row.map(escape).join(','));
      }
    }
    this.audit.record({ action: 'catalog.export', entity: 'catalog', shopId, meta: { products: products.length } });
    return { filename: 'catalog.csv', content: '\uFEFF' + lines.join('\r\n') };
  }

  private createRow(shopId: string, actorId: string, data: ValidRow) {
    return this.db.$transaction(async tx => {
      const product = await tx.product.create({
        data: {
          shopId,
          title: data.title,
          type: data.type ?? 'PRODUCT',
          category: data.category ?? '',
          defaultPrice: data.price,
          defaultStock: data.stock,
        },
      });
      // ویژگی‌های آزاد + size/color به‌عنوان ویژگی‌های «سایز»/«رنگ»
      const options: Record<string, string> = { ...(data.attributes ?? {}) };
      if (data.size) options['سایز'] = data.size;
      if (data.color) options['رنگ'] = data.color;
      const names = Object.keys(options).filter(name => options[name] !== '');
      for (let i = 0; i < names.length; i++) {
        await tx.productAttribute.create({
          data: {
            shopId, productId: product.id, name: names[i], sortOrder: i,
            values: { create: [{ value: options[names[i]], sortOrder: 0 }] },
          },
        });
      }
      const variant = await tx.variant.create({
        data: {
          shopId, productId: product.id, price: data.price, stock: data.stock,
          size: data.size, color: data.color, sku: data.sku,
          optionsJson: options as Prisma.InputJsonValue,
        },
      });
      if (data.stock > 0) await tx.stockMovement.create({ data: { shopId, variantId: variant.id, actorId, delta: data.stock, reason: 'import' } });
      return { productId: product.id, variantId: variant.id };
    });
  }
}
