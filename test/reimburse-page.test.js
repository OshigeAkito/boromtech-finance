import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceFormPage, backHref } from '../lib/reimburse-page.js';

const expense = {
  id: '11111111-2222-3333-4444-555555555555',
  documentNo: 'EXP-0007',
  spentOn: '2026-10-15',
  itemName: 'โดเมน',
  category: 'domain',
  categoryOther: '',
  vendor: 'Namecheap',
  periodNone: true,
  periodText: '',
  periodFrom: null,
  periodTo: null,
  amount: '1250.00',
  vatMode: 'included',
  payer: 'ผู้จ่ายตัวอย่าง',
  paymentMethods: ['card'],
  paymentOther: '',
  receiptNo: 'INV-1',
  receiptName: 'company',
  receiptNameOther: '',
  transferRights: false,
  transferAsset: '',
  files: [],
};

test('the slip leaves out the draft banner and the unrelated notes', () => {
  const html = advanceFormPage({ expense, company: '' });
  for (const removed of [
    'ร่างแม่แบบ (TEMPLATE DRAFT) – รอฝ่ายกฎหมาย/ทนายความและนักบัญชีตรวจสอบ ห้ามใช้ลงนามจริงก่อนได้รับการตรวจ',
    '(ห้ามกรอกเลขบัตร/เลขบัญชี)',
    '(ลำดับเดียวกับสมุดบันทึกค่าใช้จ่ายก่อนจัดตั้ง)',
    'หมายเหตุ: ปกปิด (mask) เลขบัญชีธนาคาร / เลขบัตร ให้เหลือเฉพาะ 4 หลักท้าย และไม่แนบสำเนาบัตรประชาชนหรือข้อมูลส่วนบุคคลอื่นที่ไม่จำเป็น',
    'ร่างแม่แบบ รอฝ่ายกฎหมายตรวจสอบ',
    'ร่างแม่แบบ',
  ]) assert.equal(html.includes(removed), false, removed);
  assert.match(html, /<p class="footer">บรมเทค จำกัด \(อยู่ระหว่างจดทะเบียน\) – ใบทดรองจ่าย – ใช้ร่วมกับเอกสาร 04<\/p>/);
  assert.match(html, /<td>EXP-0007<\/td>/);
  assert.match(html, /ป\.พ\.พ\. มาตรา 1108\(2\)/);
});

test('each signature block keeps its sign, name and date lines together', () => {
  const html = advanceFormPage({ expense, company: '' });
  const zone = html.slice(html.indexOf('<section class="sign-zone">'), html.indexOf('</section>'));
  const blocks = zone.split('<div class="sign">').slice(1);
  assert.equal(blocks.length, 2);
  assert.match(blocks[0], /ลงชื่อ[\s\S]*sign-line[\s\S]*ผู้ทดรองจ่าย[\s\S]*\(ผู้จ่ายตัวอย่าง\)[\s\S]*วันที่[\s\S]*sign-line/);
  assert.match(blocks[1], /ลงชื่อ[\s\S]*sign-line[\s\S]*ผู้บันทึกลงสมุดบันทึก[\s\S]*sign-name[\s\S]*วันที่[\s\S]*sign-line/);
});

test('Back returns to the list by default and to the edit page from edit', () => {
  const back = (from) => advanceFormPage({ expense, company: '', from }).match(/<a href="([^"]+)">กลับ<\/a>/)[1];
  assert.equal(back(undefined), '/actual');
  assert.equal(back('list'), '/actual');
  assert.equal(back('edit'), `/actual/${expense.id}`);
  assert.equal(back('javascript:alert(1)'), '/actual');
  assert.equal(backHref({ id: 'a/b' }, 'edit'), '/actual/a%2Fb');
});
