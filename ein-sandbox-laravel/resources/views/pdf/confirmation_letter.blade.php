<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 26px 30px 48px 30px; }
        body {
            font-family: DejaVu Sans, Arial, sans-serif;
            color: #111;
            font-size: 12px;
            line-height: 1.35;
        }
        .usa {
            font-size: 10px;
            color: #475467;
            border-bottom: 1px solid #c8d2dc;
            padding-bottom: 4px;
            margin-bottom: 10px;
        }
        .header {
            border-bottom: 3px solid #0a4a83;
            padding-bottom: 9px;
            margin-bottom: 12px;
        }
        .irs {
            font-size: 24px;
            font-weight: 700;
            color: #0a4a83;
        }
        .title {
            font-size: 15px;
            font-weight: 700;
            margin-top: 3px;
        }
        .meta {
            margin-top: 3px;
            color: #333;
            font-size: 11px;
        }
        .notice {
            border: 1px solid #b7c4d1;
            background: #f7fbff;
            padding: 10px;
            margin: 12px 0 16px;
        }
        h3 {
            font-size: 14px;
            margin: 14px 0 8px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 8px;
        }
        th, td {
            border: 1px solid #ced6de;
            text-align: left;
            vertical-align: top;
            padding: 8px;
        }
        th {
            width: 34%;
            background: #f8fafc;
            font-weight: 700;
        }
        .pdf-footer {
            position: fixed;
            left: 0;
            right: 0;
            bottom: -28px;
            border-top: 1px solid #d9e0e7;
            color: #4b5563;
            font-size: 10px;
            padding: 4px 30px 0;
        }
        .pdf-footer .page-num::after {
            content: counter(page);
        }
        .block-space { height: 6px; }
        .page-break { page-break-before: always; }
    </style>
</head>
<body>
    <div class="usa">An official website of the United States Government</div>

    <div class="header">
        <div class="irs">Internal Revenue Service</div>
        <div class="title">Apply for an Employer Identification Number (EIN) online</div>
        <div class="meta">CP 575 G - EIN Assignment Confirmation</div>
    </div>

    <p><strong>Congratulations! Your EIN has been successfully assigned.</strong></p>
    <p>Save and/or print this page and this confirmation letter for your permanent records.</p>

    <div class="notice">
        Keep this notice for your records. You may be asked to provide this document for banking, payroll, and state registration activities.
    </div>

    <h3>Your EIN Details</h3>
    <table>
        <tr>
            <th>EIN assigned</th>
            <td><strong>{{ $ein }}</strong></td>
        </tr>
        <tr>
            <th>Legal name</th>
            <td>{{ $legalName }}</td>
        </tr>
        <tr>
            <th>Name control</th>
            <td>{{ $nameControl }}</td>
        </tr>
        <tr>
            <th>Business address</th>
            <td>{{ $address }}</td>
        </tr>
        <tr>
            <th>Issued at</th>
            <td>{{ $issuedAt }}</td>
        </tr>
    </table>

    <div class="page-break"></div>
    <div class="block-space"></div>
    <h3>Summary of your information</h3>
    <table>
        <tr>
            <th>Organization Type</th>
            <td>{{ $orgType ?: '-' }}</td>
        </tr>
        <tr>
            <th>Physical Location</th>
            <td>{{ $physicalLocation ?: '-' }}</td>
        </tr>
        <tr>
            <th>Trade name / DBA</th>
            <td>{{ $tradeName ?: '-' }}</td>
        </tr>
        <tr>
            <th>County</th>
            <td>{{ $county ?: '-' }}</td>
        </tr>
        <tr>
            <th>State / Territory</th>
            <td>{{ $stateCode ?: '-' }}</td>
        </tr>
        <tr>
            <th>Start date</th>
            <td>{{ $startDate ?: '-' }}</td>
        </tr>
        <tr>
            <th>Phone Number</th>
            <td>{{ $phone ?: '-' }}</td>
        </tr>
        <tr>
            <th>SSN / ITIN</th>
            <td>{{ $maskedSsn }}</td>
        </tr>
        <tr>
            <th>Responsible party name</th>
            <td>{{ $responsibleName ?: '-' }}</td>
        </tr>
        <tr>
            <th>Business activity</th>
            <td>{{ $businessActivity ?: '-' }}</td>
        </tr>
        <tr>
            <th>Principal product/service</th>
            <td>{{ $principalProduct ?: '-' }}</td>
        </tr>
        <tr>
            <th>Owns 55,000+ lbs highway motor vehicle</th>
            <td>{{ $highway }}</td>
        </tr>
        <tr>
            <th>Involves gambling/wagering</th>
            <td>{{ $gambling }}</td>
        </tr>
        <tr>
            <th>Involves alcohol, tobacco, or firearms</th>
            <td>{{ $atf }}</td>
        </tr>
        <tr>
            <th>Files Form 720</th>
            <td>{{ $form720 }}</td>
        </tr>
        <tr>
            <th>Has employees who receive Forms W-2</th>
            <td>{{ $employees }}</td>
        </tr>
        <tr>
            <th>Reason for Applying</th>
            <td>{{ $reasonForApplying ?: '-' }}</td>
        </tr>
    </table>

    <div class="pdf-footer">
        <span>IRS Apply for an Employer Identification Number (EIN) online</span>
        <span style="float:right;">{{ $generatedAt ?? '' }} · Page <span class="page-num"></span></span>
    </div>
</body>
</html>
