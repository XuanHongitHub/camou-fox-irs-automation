# EIN Sandbox Laravel (Local Automation Test)

Local app mo phong flow EIN 6 step de test automation (radio/select mo form phu, review, va download PDF xac nhan).

## Features

- 6 step: `Legal Structure -> Identity -> Addresses -> Additional -> Review -> Assignment`
- Dynamic UI:
  - Step 1: chon legal type se hien them `sub type` + `reason`
  - Step 2: chon `Your Role = third-party` se hien them thong tin designee
  - Step 3: chon `different mailing address = yes` se hien block dia chi mailing
  - Step 4: chon `employees = yes` se hien them field nhan su
- Download PDF tai step 6 qua nut:
  - `aria-label="Download EIN confirmation Letter [PDF]"`
  - route: `/download/confirmation-letter`
  - ten file: `CP_575_G.pdf` (giong naming ban goc)
  - mac dinh uu tien render PDF dong theo data session/CSV:
    - `storage/app/templates/CP_575_G_original.pdf`
    - bat/tat bang `.env`: `EIN_USE_ORIGINAL_PDF_TEMPLATE=true|false` (default `false`)
  - Neu co `Dompdf` se render PDF that tu template HTML (layout thu xac nhan)
  - Neu chua co `Dompdf` se fallback sang built-in PDF generator
- Co `data-testid` tren cac input/button chinh de viet script automation on dinh.

## Chay tren Windows + Herd

1. Mo PowerShell trong thu muc project:

```powershell
cd F:\Herd\fox-auto\ein-sandbox-laravel
```

2. Setup 1 lan:

```powershell
.\scripts\setup-herd.ps1
```

3. (Khuyen nghi) cai PDF engine de xuat PDF that:

```powershell
composer require dompdf/dompdf
```

4. Chay app (neu khong dung direct Herd site):

```powershell
php artisan serve --host=127.0.0.1 --port=8010
```

5. Mo bang Herd URL:

- `http://ein-sandbox.test`
- Canonical sandbox flow:
  - `http://ein-sandbox.test/applyein/legalStructure`

## Routes

- `GET /` start flow
- `POST /reset` reset session
- `GET /step/{step}` render step
- `POST /step/{step}` submit step
- `GET /applyein/legalStructure` canonical step 1
- `GET /applyein/identityOfEntities` canonical step 2
- `GET /applyein/addAddresses` canonical step 3
- `GET /applyein/additionalDetails` canonical step 4
- `GET /applyein/reviewAndSubmit` canonical step 5
- `GET /applyein/einAssignment` canonical step 6
- `POST /applyein/{slug}` submit canonical step
- `GET /applyein/downloadConfirmationLetter` tai PDF theo path giong flow that
- `GET /download/confirmation-letter` tai PDF

## Ghi chu cho automation

- Button continue: `data-testid="btn-continue"`
- Button back: `data-testid="btn-back"`
- Download button step 6:
  - `#anchor-ui-0`
  - `aria-label="Download EIN confirmation Letter [PDF]"`

## Khac phuc loi nhanh

- Loi extension XML/DOM khi chay `artisan`:
  - Kiem tra PHP Herd dang dung (`php -v`) va bat extension `dom`, `xml`, `xmlwriter`.
- Loi APP_KEY:
  - Chay lai: `php artisan key:generate --force`
