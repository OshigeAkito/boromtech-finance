# แดชบอร์ดประมาณการเงินทุน BoromTech

เว็บส่วนตัวสำหรับนักลงทุนที่ได้รับเชิญ ใช้ดูประมาณการเงินทุนรายเดือนของบริษัท เข้าสู่ระบบด้วย Google ได้เฉพาะอีเมลที่อยู่ในรายชื่ออนุญาต

รีโปนี้เป็นรีโปสาธารณะ จึงเก็บเฉพาะข้อมูลตัวอย่าง ห้ามใส่ตัวเลขจริง อีเมลนักลงทุน หรือความลับใดๆ ลงใน git

## ข้อมูลในรีโปนี้เป็นตัวอย่าง

ไฟล์ที่ commit คือ `data/forecast.example.json` ตัวเลขเป็นจำนวนกลมสมมติ และในไฟล์มีข้อความ `ตัวอย่างข้อมูล / Example data, not real figures`

ตอนรัน แอปอ่านไฟล์จริงจาก **Secret File** ที่พาธ `/etc/secrets/forecast.json` (เปลี่ยนได้ด้วยตัวแปร `FORECAST_PATH`) ถ้าไม่มีไฟล์นั้น แอปจะใช้ไฟล์ตัวอย่าง และแสดงแบนเนอร์

> ตัวอย่างข้อมูล / Example data, not real figures

แบนเนอร์นี้หมายความว่ากำลังแสดงไฟล์ตัวอย่าง ไม่ใช่ไฟล์ลับ ถ้าอัปโหลดไฟล์จริงแล้ว แบนเนอร์จะไม่ขึ้น

สคีมาด้านล่างตรงกับไฟล์จริง ไฟล์นั้นจึงเปิดได้โดยไม่ต้องแก้โครง JSON คีย์ที่แอปไม่รู้จัก เช่น `notice` ในไฟล์ตัวอย่าง จะถูกข้าม

## สคีมาของ forecast.json

จำนวนเงินเป็นสตริงทศนิยม ไม่เกินสองตำแหน่ง เช่น `"0.00"` หรือ `"1500.50"` แอปอ่านเป็นจำนวนทศนิยม ไม่ตัดเศษด้วยจำนวนเต็ม

| คีย์ | ชนิด | ความหมาย |
| --- | --- | --- |
| `company` | string | ชื่อบริษัทที่แสดงบนหน้า |
| `currency` | string | สกุลเงินหลัก เช่น `THB` |
| `registeredCapital` | decimal string | ทุนจดทะเบียน ไม่ถูกบวกเข้ายอดเงินสด |
| `openingCapital` | object | ทุนยกมา ดูตารางถัดไป |
| `fx` | object | อัตราแลกเปลี่ยน ดูตารางถัดไป |
| `balanceFormula` | string | ประโยคอธิบายสูตรยอดคงเหลือ |
| `months` | array | รายเดือน อย่างน้อยหนึ่งเดือน |
| `assumptions` | array of string | สมมติฐานที่เป็นข้อความ |
| `notYetIncluded` | array of string | รายการที่ยังไม่ใส่ในตัวเลข |

`openingCapital`:

| คีย์ | ชนิด |
| --- | --- |
| `amount` | decimal string ยอดตั้งต้นของเดือนแรก |
| `sharePercent` | number |
| `assumed` | boolean ถ้าจริง หน้าเว็บติดป้าย `(สมมติ)` |
| `label` | string |
| `timing` | string |

`fx`: `base`, `quote`, `source`, `updatedAt`, `updatedDisplay` เป็น string และ `rate` เป็น decimal string

แต่ละเดือน:

| คีย์ | ชนิด |
| --- | --- |
| `key` | string |
| `label` | string |
| `labelFull` | string |
| `revenue` | decimal string |
| `items` | array |

แต่ละรายการใน `items`: `group`, `groupName`, `name` เป็น string, `amount` เป็น decimal string, `assumed` เป็น boolean รายการที่ `assumed` เป็นจริงจะติดป้าย `(สมมติ)` ตารางรายจ่ายรวมใช้ `group` เป็นคีย์ ถ้าทุกรายการในกลุ่มนั้นใช้ `name` เดียวกัน ป้ายคือชื่อนั้น มิฉะนั้นใช้ `groupName`

ยอดสิ้นเดือน = ยอดก่อนหน้า + `revenue` − ผลรวม `items.amount` เดือนแรกใช้ `openingCapital.amount` เป็นยอดก่อนหน้า

ดูตัวอย่างทั้งไฟล์ได้ที่ `data/forecast.example.json` แบนเนอร์ขึ้นเมื่อไฟล์ที่เปิดคือไฟล์ตัวอย่างเท่านั้น ไม่ได้ดูจากฟิลด์ `notice`

ตรวจไฟล์ก่อนอัปโหลด:

```bash
node scripts/check-forecast.js /path/to/forecast.json
```

## ตัวแปรที่ต้องตั้ง

| ชื่อ | จำเป็น | ค่า |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | ใช่ | Client ID ของ OAuth |
| `GOOGLE_CLIENT_SECRET` | ใช่ | Client secret ของ OAuth |
| `SESSION_SECRET` | ใช่ | ค่าสุ่มยาวสำหรับเซ็นคุกกี้ เช่นผลของ `openssl rand -base64 32` |
| `ALLOWED_EMAILS` | ใช่ | อีเมลนักลงทุน คั่นด้วยจุลภาค |
| `BASE_URL` | ไม่ | URL ภายนอกของแอป ไม่ต้องมี `/` ท้าย ถ้าไม่ใส่ จะใช้ `RENDER_EXTERNAL_URL` |
| `FORECAST_PATH` | ไม่ | พาธไฟล์จริง ค่าเริ่มต้นคือ `/etc/secrets/forecast.json` |
| `NODE_ENV` | ไม่ | Blueprint ตั้งเป็น `production` เพื่อให้คุกกี้เป็น Secure |
| `PORT` | ไม่ | Render ตั้งให้เอง |

ถ้าตัวแปรที่จำเป็นตัวใดตัวหนึ่งว่าง แอปตอบ `503` ทุกเส้นทาง และไม่เปิดข้อมูล

## ตั้งค่า (เจ้าของระบบ)

### 1. Google Cloud Console

1. สร้างโปรเจกต์ใหม่ หรือเลือกโปรเจกต์ที่ใช้กับแอปนี้
2. ไปที่ APIs & Services แล้วเปิด OAuth consent screen
3. เลือก User type เป็น **External**
4. ใส่ชื่อแอปและอีเมลผู้ติดต่อ ขอบเขต (scopes) ให้มีแค่ `openid`, `email` และ `profile` ห้ามขอขอบเขตอื่น
5. **Publish** consent screen ถ้ายังเป็น Testing จะมีแค่ test users ที่เข้าได้
6. สร้าง Credentials → OAuth client ID ชนิด **Web application**
7. ใส่ Authorized redirect URI ให้ตรงทุกตัวอักษร:

   `https://<ชื่อแอป>.onrender.com/auth/google/callback`

   ถ้าจะลองบนเครื่องตัวเอง ให้เพิ่ม `http://localhost:3000/auth/google/callback` อีกหนึ่งรายการ
8. คัดลอก Client ID และ Client secret ไปใส่ใน Render ห้าม commit ค่าสองอย่างนี้

### 2. Render

1. ใน GitHub ให้สิทธิ์แอปของ Render เฉพาะรีโปนี้ ไม่ต้องเปิดทั้งองค์กร
2. ใน Render เลือก **New → Blueprint**
3. เลือกรีโปนี้ และสาขา **main** ไฟล์ `render.yaml` จะสร้าง Web Service แพลนฟรี และ auto-deploy เฉพาะเมื่อมี commit บน `main`
4. เติมตัวแปร `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `ALLOWED_EMAILS` ช่องเหล่านี้ใน blueprint เป็น `sync: false` จึงไม่มีค่าอยู่ใน git
5. `BASE_URL` ใส่ `https://<ชื่อแอป>.onrender.com` ได้ ถ้ายังไม่รู้ชื่อ ให้เว้นว่าง แอปจะใช้ `RENDER_EXTERNAL_URL` ที่ Render ใส่ให้เอง
6. `FORECAST_PATH` เว้นว่างได้ หรือใส่ `/etc/secrets/forecast.json`
7. เปิดบริการที่สร้าง ไปที่ **Environment → Secret Files** แล้วเพิ่มไฟล์ชื่อ `forecast.json` เนื้อหาคือ JSON จริงตามสคีมาด้านบน
8. Render จะเมานต์ไฟล์นั้นที่ `/etc/secrets/forecast.json` จากนั้นให้บริการ redeploy หนึ่งครั้ง
9. เปิดเว็บ ถ้ายังเห็นแบนเนอร์ตัวอย่าง แปลว่าไฟล์ลับยังไม่ถูกอ่าน

แพลนฟรีของ Render จะหลับหลังไม่มีคนเปิดประมาณ 15 นาที ครั้งถัดไปอาจใช้เวลาครู่หนึ่งกว่าจะตื่น

### 3. เพิ่มหรือลบอีเมลนักลงทุน

1. เปิดบริการบน Render แล้วไปที่ Environment
2. แก้ `ALLOWED_EMAILS` เป็นรายการอีเมลคั่นด้วยจุลภาค เช่น `person.one@example.com, person.two@example.com`
3. ช่องว่างหัวท้ายและตัวพิมพ์ใหญ่เล็กไม่มีผล
4. กดบันทึก Render จะรีสตาร์ทบริการ
5. อีเมลที่เพิ่มต้องเข้าสู่ระบบใหม่ อีเมลที่เอาออกจะใช้ของเดิมไม่ได้ทันที เพราะทุกคำขอตรวจรายชื่ออีกครั้ง คุกกี้เซสชันมีอายุ 7 วัน และปุ่มออกจากระบบอยู่บนแดชบอร์ด

ใช้เฉพาะอีเมลที่ Google ยืนยันแล้ว (`email_verified` เป็นจริง) บัญชีที่ไม่อยู่ในรายชื่อจะเห็นหน้าภาษาไทยว่ายังไม่ได้รับสิทธิ์ และจะไม่ได้เซสชัน

## รันบนเครื่อง

```bash
npm install
npm test
npm run check
```

สร้างไฟล์ `.env` จาก `.env.example` แล้วเติมค่าจาก Google จากนั้น:

```bash
npm run dev
```

เปิด `http://localhost:3000` ถ้าไม่ใส่ไฟล์จริง จะเห็นแบนเนอร์ตัวอย่าง

เส้นทางที่เปิดได้โดยไม่ต้องล็อกอินมีแค่หน้าเข้าสู่ระบบ, ไฟล์หน้าตาของหน้านั้น (`/login-assets/`), จุดเริ่ม Google (`/auth/google`), callback (`/auth/google/callback`), ออกจากระบบ, และ `/health` ข้อมูลอยู่ที่ `/` และ `/api/forecast` ซึ่งต้องมีเซสชัน ไม่มีเซสชันแล้ว `/` และ `/dashboard` เด้งไปหน้าเข้าสู่ระบบ และ `/api/forecast` ตอบ 401 สคริปต์ขยายแถวของแดชบอร์ดอยู่ที่ `/dashboard-assets/dashboard.js` และต้องมีเซสชันเช่นกัน
