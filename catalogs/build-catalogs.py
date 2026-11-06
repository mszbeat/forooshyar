#!/usr/bin/env python3
"""Builds the demo catalog files used to test the import screen.

Run from this directory:  python3 build-catalogs.py
Outputs:  forooshyar-catalog-30.csv / .xlsx, forooshyar-import-errors-demo.csv

Rules enforced by the backend importer (keep these files in sync with it):
  * headers: title/name/نام/نام محصول, price/قیمت, stock/موجودی,
             size/سایز, color/رنگ, sku   (any other column is ignored)
  * title is required (1..200 chars); price and stock must be non-negative
    integers; Persian digits, commas and spaces inside numbers are accepted
  * sku is optional but must be unique inside one shop
  * every row creates ONE new product with ONE variant
  * UTF-8 (BOM allowed), max 2 MiB, max 1000 rows
"""
import csv

HEAD = ['نام محصول', 'قیمت', 'موجودی', 'سایز', 'رنگ', 'sku']

ROWS = [
    ('مانتو کتان تابستانه دخترانه مدل نیلا', 890000, 12, 'M', 'کرم', 'MN-KTN-M-KRM'),
    ('مانتو کتان تابستانه دخترانه مدل نیلا', 890000, 6, 'L', 'مشکی', 'MN-KTN-L-MSH'),
    ('مانتو جلو باز کشمیر مدل آرام', 1450000, 4, 'Free', 'شکلاتی', 'MN-KSH-FREE-SHK'),
    ('پالتو بلند دو لایه مدل ژاله', 2890000, 2, '38', 'خاکستری', 'PLT-ZH-38-KHK'),
    ('پالتو بلند دو لایه مدل ژاله', 2890000, 0, '40', 'خاکستری', 'PLT-ZH-40-KHK'),
    ('کت تک دکمه فوتر مدل رها', 1890000, 3, '40', 'سرمه‌ای', 'KT-RH-40-SRM'),
    ('شومیز ابریشمی یقه گرد مدل سایه', 1250000, 15, 'S', 'سفید', 'SHM-SY-S-SFD'),
    ('شومیز ابریشمی یقه گرد مدل سایه', 1250000, 9, 'M', 'سفید', 'SHM-SY-M-SFD'),
    ('شومیز طرح راه‌راه نخی مدل ماهور', 980000, 1, 'M', 'آبی روشن', 'SHM-MHR-M-ABI'),
    ('تیشرت نخی یقه هفت مدل پرنیان', 420000, 24, 'M', 'سفید', 'TSH-PRN-M-SFD'),
    ('تیشرت نخی یقه هفت مدل پرنیان', 420000, 18, 'L', 'مشکی', 'TSH-PRN-L-MSH'),
    ('دامن پلیسه میدی مدل ونوس', 760000, 8, 'S', 'مشکی', 'DMN-VNS-S-MSH'),
    ('دامن پلیسه میدی مدل ونوس', 760000, 5, 'M', 'زغالی', 'DMN-VNS-M-ZGH'),
    ('شلوار پارچه‌ای دم‌پا گشاد مدل دیبا', 890000, 11, '38', 'مشکی', 'SHL-DBA-38-MSH'),
    ('شلوار جین مام‌استایل مدل بیتا', 1290000, 7, '40', 'آبی تیره', 'SHL-BTA-40-ABI'),
    ('ست ورزشی زنانه مکرافیت مدل تیام', 1180000, 3, 'M', 'صورتی', 'ST-TYM-M-SRT'),
    ('ست ورزشی زنانه مکرافیت مدل تیام', 1180000, 0, 'L', 'مشکی', 'ST-TYM-L-MSH'),
    ('پیراهن خواب ساتن مدل مهتاب', 690000, 14, 'S', 'یاسی', 'PRH-MHT-S-YAS'),
    ('کیف چرم دست‌دوز مدل هستی', 2450000, 2, 'Free', 'قهوه‌ای', 'KIF-HST-FREE-GHV'),
    ('کیف دوشی پارچه‌ای مدل کوثر', 780000, 9, 'Free', 'زیتونی', 'KIF-KSR-FREE-ZYT'),
    ('شال نخی طرح‌دار مدل بهار', 450000, 25, 'Free', 'فیروزه‌ای', 'SHL-BHR-FREE-FRZ'),
    ('شال نخی طرح‌دار مدل بهار', 450000, 1, 'Free', 'زرشکی', 'SHL-BHR-FREE-ZRS'),
    ('روسری ابریشم مدل ستاره', 620000, 0, 'Free', 'نقره‌ای', 'RSR-STR-FREE-NGH'),
    ('جوراب شلواری فاق بلند مدل آسو', 185000, 40, 'Free', 'مشکی', 'JRB-ASW-FREE-MSH'),
    ('کفش لوفر چرم مدل پانیذ', 1650000, 2, '38', 'مشکی', 'KFS-PNZ-38-MSH'),
    ('کفش لوفر چرم مدل پانیذ', 1650000, 4, '39', 'مشکی', 'KFS-PNZ-39-MSH'),
    ('صندل تابستانه چرم مدل سروش', 980000, 6, '37', 'عسلی', 'SND-SRS-37-ASL'),
    ('کمربند چرم مدل نیکا', 320000, 16, 'Free', 'مشکی', 'KMR-NKA-FREE-MSH'),
    ('دستبند نقره مدل ماه', 1350000, 1, 'Free', 'نقره‌ای', 'DSP-MAH-FREE-NGH'),
    ('گردنبند سنگی مدل کویر', 720000, 5, 'Free', 'طوسی', 'GRD-KVR-FREE-TVS'),
]

ERR_ROWS = [
    ('شومیز تست ردیف سالم', 850000, 5, 'M', 'سفید', 'TST-OK-001'),
    ('', 500000, 3, 'M', 'مشکی', 'TST-EMPTY-TITLE'),
    ('مانتو با قیمت متنی', 'گران', 3, 'L', 'کرم', 'TST-BAD-PRICE'),
    ('مانتو با قیمت منفی', -500000, 2, 'L', 'کرم', 'TST-NEG-PRICE'),
    ('شلوار با موجودی اعشاری', 700000, '2.5', '40', 'مشکی', 'TST-DEC-STOCK'),
    ('تیشرت با SKU تکراری', 300000, 10, 'M', 'سفید', 'TST-OK-001'),
    ('شال با اعداد فارسی و جداکننده', '۴۵۰٬۰۰۰', '۱۲', 'Free', 'زرشکی', 'TST-FA-NUM'),
    ('', '', '', '', '', ''),
    ('کیف با نام بیش از حد بلند ' + 'x' * 190, 900000, 4, 'Free', 'مشکی', 'TST-LONG-TITLE'),
    ('جوراب تست ردیف سالم دوم', 190000, 30, 'Free', 'مشکی', 'TST-OK-002'),
]


def write_csv(path, data):
    # utf-8-sig keeps Excel from mangling Persian text; the importer accepts a BOM.
    with open(path, 'w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.writer(handle, lineterminator='\r\n')
        writer.writerow(HEAD)
        writer.writerows(data)


def write_xlsx(path):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    book = Workbook()
    sheet = book.active
    sheet.title = 'کاتالوگ'
    sheet.sheet_view.rightToLeft = True
    sheet.append(HEAD)
    for row in ROWS:
        sheet.append(list(row))

    header_fill = PatternFill('solid', fgColor='0F7A6A')
    for cell in sheet[1]:
        cell.font = Font(bold=True, color='FFFFFF', name='Vazirmatn')
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal='center', vertical='center')

    widths = [42, 14, 10, 8, 14, 20]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(index)].width = width
    for row in sheet.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name='Vazirmatn')
            cell.alignment = Alignment(horizontal='right')
    for row in sheet.iter_rows(min_row=2, min_col=2, max_col=3):
        for cell in row:
            cell.number_format = '#,##0'
            cell.alignment = Alignment(horizontal='left')
    sheet.freeze_panes = 'A2'
    book.save(path)


if __name__ == '__main__':
    write_csv('forooshyar-catalog-30.csv', ROWS)
    write_csv('forooshyar-import-errors-demo.csv', ERR_ROWS)
    try:
        write_xlsx('forooshyar-catalog-30.xlsx')
    except ImportError:
        print('openpyxl نصب نیست؛ فقط فایل‌های CSV ساخته شدند (pip install openpyxl)')
    print('done')
