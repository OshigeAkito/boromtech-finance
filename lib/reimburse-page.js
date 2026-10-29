// Printable ใบทดรองจ่าย (ก่อนจัดตั้งบริษัท).
// Wording follows the official blank template. One expense fills one form.
import { formatCents, parseMoneyCents } from './forecast.js';
import { esc } from './html.js';
import { thaiDateParts } from './dates.js';
import { bahtText } from './thai-baht.js';

const FOOTER = 'บรมเทค จำกัด (อยู่ระหว่างจดทะเบียน) – ใบทดรองจ่าย – ใช้ร่วมกับเอกสาร 04';

function tick(on) {
  return `<span class="tick${on ? ' on' : ''}">${on ? '☑' : '☐'}</span>`;
}

function filled(value, blank = '........................') {
  const text = value == null ? '' : String(value).trim();
  return text ? esc(text) : blank;
}

// One signature block: signature line with its role, printed name under the
// line, then the date line, all in the same column.
function signBlock(role, name) {
  const printed = name && String(name).trim() ? esc(String(name).trim()) : '<span class="sign-line" aria-hidden="true"></span>';
  return `<div class="sign">
          <span class="sign-label">ลงชื่อ</span><span class="sign-line" aria-hidden="true"></span><span class="sign-role">${role}</span>
          <span></span><span class="sign-name">(${printed})</span><span></span>
          <span class="sign-label">วันที่</span><span class="sign-line" aria-hidden="true"></span><span></span>
        </div>`;
}

// Back returns to the page that opened the form: the expense list (default)
// or the expense's edit page.
export function backHref(expense, from) {
  return from === 'edit' ? `/actual/${encodeURIComponent(expense.id)}` : '/actual';
}

export function advanceFormPage({ expense, company, from: origin = 'list' }) {
  const paid = thaiDateParts(expense.spentOn);
  const words = bahtText(parseMoneyCents(expense.amount));
  const from = thaiDateParts(expense.periodFrom);
  const to = thaiDateParts(expense.periodTo);
  const kinds = new Set(expense.files.map((file) => file.kind));
  const names = (kind) => expense.files.filter((file) => file.kind === kind).map((file) => file.filename);
  const attachment = (on, label, files) => `<li>${tick(on)} ${label}${files.length ? ` <span class="files">(${files.map((name) => esc(name)).join(', ')})</span>` : ''}</li>`;
  const companyLine = company
    ? `${esc(company)} – อยู่ระหว่างจดทะเบียน`
    : 'บริษัท บรมเทค จำกัด (BoromTech Co., Ltd.) – อยู่ระหว่างจดทะเบียน';
  return `<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <title>${esc(expense.documentNo)} · ใบทดรองจ่าย</title>
  <link rel="stylesheet" href="/app-assets/print.css">
</head>
<body>
  <div class="toolbar no-print">
    <a href="${esc(backHref(expense, origin))}">กลับ</a>
    <button id="print-form" type="button">พิมพ์หรือบันทึกเป็น PDF</button>
  </div>
  <article class="sheet">
    <h1>ใบทดรองจ่าย (ก่อนจัดตั้งบริษัท)</h1>
    <p class="sub">ใช้บันทึกค่าใช้จ่ายแต่ละรายการทันทีที่จ่าย – 1 รายการ ต่อ 1 ใบ</p>
    <p class="company">${companyLine}</p>

    <h2>ส่วนที่ 1 รายละเอียดค่าใช้จ่าย</h2>
    <table class="fields">
      <tr>
        <th>เลขที่เอกสาร</th>
        <td>${esc(expense.documentNo)}</td>
      </tr>
      <tr>
        <th>วันที่จ่าย</th>
        <td>วันที่ ${filled(paid?.day, '..........')} เดือน ${filled(paid?.month, '....................')} พ.ศ. ${filled(paid?.year, '..........')}</td>
      </tr>
      <tr>
        <th>ประเภท</th>
        <td>
          ${tick(expense.category === 'domain')} ค่าจดโดเมน
          ${tick(expense.category === 'fee')} ค่าธรรมเนียม DBD
          ${tick(expense.category === 'software')} ซอฟต์แวร์-บริการออนไลน์
          ${tick(expense.category === 'other')} อื่น ๆ ${expense.category === 'other' ? esc(expense.categoryOther) : ''}
        </td>
      </tr>
      <tr>
        <th>รายการ</th>
        <td>${esc(expense.itemName)}</td>
      </tr>
      <tr>
        <th>ผู้ให้บริการ / ผู้รับเงิน</th>
        <td>${esc(expense.vendor)}</td>
      </tr>
      <tr>
        <th>ระยะเวลา (ถ้ามี)</th>
        <td>
          ${expense.periodNone
            ? `........ เดือน/ปี (ตั้งแต่ ........................ ถึง ........................) ${tick(true)} ไม่มี`
            : `${esc(expense.periodText)} (ตั้งแต่ ${filled(from ? `${from.day} ${from.month} ${from.year}` : '')} ถึง ${filled(to ? `${to.day} ${to.month} ${to.year}` : '')}) ${tick(false)} ไม่มี`}
        </td>
      </tr>
      <tr>
        <th>จำนวนเงิน</th>
        <td>
          <p>${esc(formatCents(parseMoneyCents(expense.amount)))} บาท (ตัวอักษร: ${esc(words)})</p>
          <p>
            ${tick(expense.vatMode === 'included')} รวม VAT
            ${tick(expense.vatMode === 'excluded')} ไม่รวม VAT
            ${tick(expense.vatMode === 'foreign')} ต่างประเทศ: สกุล ${expense.vatMode === 'foreign' ? esc(expense.foreignCurrency) : '......'} จำนวน ${expense.vatMode === 'foreign' ? esc(expense.foreignAmount) : '......'} อัตรา ${expense.vatMode === 'foreign' ? esc(expense.foreignRate) : '......'}
          </p>
        </td>
      </tr>
      <tr>
        <th>ผู้ทดรองจ่าย (ผู้เริ่มก่อการ)</th>
        <td>${esc(expense.payer)}</td>
      </tr>
      <tr>
        <th>วิธีจ่าย</th>
        <td>
          ${tick(expense.paymentMethods.includes('card'))} บัตรเครดิต/เดบิต
          ${tick(expense.paymentMethods.includes('transfer'))} โอนเงิน
          ${tick(expense.paymentMethods.includes('paypal'))} PayPal/e-wallet
          ${tick(expense.paymentMethods.includes('cash'))} เงินสด
          ${tick(expense.paymentMethods.includes('other'))} อื่น ๆ ${expense.paymentMethods.includes('other') ? esc(expense.paymentOther) : '......'}
        </td>
      </tr>
      <tr>
        <th>เลขที่ใบเสร็จ / Invoice</th>
        <td>${esc(expense.receiptNo)}</td>
      </tr>
      <tr>
        <th>ชื่อบนใบเสร็จ/ใบกำกับ</th>
        <td>
          ${tick(expense.receiptName === 'company')} บริษัท บรมเทค จำกัด (อยู่ระหว่างจดทะเบียน)
          ${tick(expense.receiptName === 'promoter')} ผู้เริ่มก่อการ
          ${tick(expense.receiptName === 'other')} อื่น ๆ ${expense.receiptName === 'other' ? esc(expense.receiptNameOther) : '....'}
        </td>
      </tr>
      <tr>
        <th>ต้องโอนสิทธิ์ให้บริษัท?</th>
        <td>
          ${tick(expense.transferRights)} ใช่ – ทรัพย์สิน/บัญชี: ${expense.transferRights ? esc(expense.transferAsset) : '..................................'}
          ${tick(!expense.transferRights)} ไม่
        </td>
      </tr>
    </table>

    <h2>ส่วนที่ 2 เอกสารแนบ</h2>
    <ul class="checks">
      ${attachment(kinds.has('receipt'), 'ใบเสร็จรับเงิน / ใบกำกับภาษี (ชื่อผู้ซื้อควรเป็นบริษัท หากทำได้)', names('receipt'))}
      ${attachment(kinds.has('payment_proof'), 'หลักฐานการชำระเงิน (สลิปโอนเงิน / รายการบัตร) – ปกปิดเลขบัญชี/เลขบัตร', names('payment_proof'))}
      ${attachment(kinds.has('screenshot'), 'ภาพหน้าจอรายละเอียดบริการ (ถ้ามี) เช่น ชื่อบริการ/โดเมน วันเริ่ม – วันหมดอายุ', names('screenshot'))}
      ${attachment(kinds.has('assignment'), 'หนังสือโอนสิทธิ์ให้บริษัท (ถ้ามีทรัพย์สินหรือบัญชีที่ต้องโอน – จัดทำหลังจดทะเบียน)', names('assignment'))}
    </ul>

    <section class="sign-zone">
      <h2>ส่วนที่ 3 คำรับรองและลงนาม</h2>
      <p class="cert">ข้าพเจ้าขอรับรองว่าค่าใช้จ่ายข้างต้นได้จ่ายไปจริงเพื่อประโยชน์ในการจัดตั้ง บริษัท บรมเทค จำกัด และขอให้ที่ประชุมจัดตั้งบริษัทพิจารณารับรองตาม ป.พ.พ. มาตรา 1108(2) เพื่อให้บริษัทชำระคืนภายหลังจดทะเบียนและเปิดบัญชีธนาคารของบริษัทแล้ว</p>
      <div class="signs">
        ${signBlock('ผู้ทดรองจ่าย', expense.payer)}
        ${signBlock('ผู้บันทึกลงสมุดบันทึก', '')}
      </div>
    </section>
    <p class="footer">${FOOTER}</p>
  </article>
  <script src="/app-assets/print.js" defer></script>
</body>
</html>`;
}
