<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>IRS Apply for an Employer Identification Number (EIN) online</title>
    <style>
        :root {
            --irs-blue: #00599c;
            --irs-dark: #1b1b1b;
            --line: #dfe4ea;
            --text: #202124;
            --link: #005ea2;
            --muted: #6b7280;
            --bg: #f3f4f6;
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: "Source Sans Pro", "Segoe UI", Arial, sans-serif;
            color: var(--text);
            background: var(--bg);
            line-height: 1.35;
        }
        a { color: var(--link); text-decoration: none; }
        a:hover { text-decoration: underline; }

        .gov-banner {
            background: #f7f7f7;
            border-bottom: 1px solid #d6d7d9;
            font-size: 13px;
            padding: 8px 0;
        }
        .container { width: min(980px, calc(100% - 32px)); margin: 0 auto; }

        .top-header {
            background: var(--irs-blue);
            color: #fff;
            padding: 14px 0;
        }
        .top-header-inner {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 14px;
        }
        .logo {
            font-size: 34px;
            font-weight: 800;
            letter-spacing: 1px;
        }
        .top-links { font-size: 15px; display: flex; gap: 18px; }
        .top-links a { color: #fff; }

        .main {
            background: #fff;
            min-height: calc(100vh - 94px);
            padding: 24px 0 36px;
        }

        .breadcrumbs {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            font-size: 14px;
            color: #5f6a76;
            margin-bottom: 14px;
        }
        .breadcrumbs span.sep { color: #9aa3ad; }

        h1 {
            margin: 0;
            font-size: 48px;
            line-height: 1.12;
            font-weight: 700;
            letter-spacing: -0.3px;
        }
        .subtitle {
            margin-top: 10px;
            color: #4b5563;
            font-size: 18px;
        }

        .step-wrap { margin-top: 28px; margin-bottom: 18px; }
        .step-head {
            margin: 0 0 10px;
            font-size: 22px;
            font-weight: 700;
        }
        .stepper {
            display: grid;
            grid-template-columns: repeat(6, 1fr);
            gap: 6px;
            align-items: start;
        }
        .step {
            position: relative;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            padding-top: 10px;
        }
        .step:not(:last-child)::after {
            content: "";
            position: absolute;
            top: 24px;
            left: 54%;
            width: 92%;
            height: 2px;
            background: #b8c1cc;
            z-index: 0;
        }
        .dot {
            width: 38px;
            height: 38px;
            border-radius: 50%;
            border: 2px solid #7d8793;
            background: #fff;
            color: #4b5563;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            margin-bottom: 8px;
            position: relative;
            z-index: 1;
        }
        .step.active .dot,
        .step.done .dot {
            background: #0a4a83;
            border-color: #0a4a83;
            color: #fff;
        }
        .step-title { font-size: 15px; color: #4b5563; }
        .step.active .step-title { color: #0a4a83; font-weight: 700; }

        .section-title { font-size: 38px; margin: 28px 0 10px; }
        .required-note { color: #4b5563; margin-bottom: 24px; }

        h3 { margin: 0 0 10px; font-size: 30px; }
        h4 { margin: 0 0 10px; font-size: 22px; }
        .help-text { margin-bottom: 18px; color: #374151; }

        .field { margin-bottom: 18px; }
        .field label { display: block; font-weight: 700; margin-bottom: 6px; }
        .hint { color: var(--muted); font-size: 14px; margin: 4px 0 8px; }
        .required { color: #d83933; }
        .field--error input,
        .field--error select,
        .field--error .radio-group {
            border-color: #d54309 !important;
            box-shadow: 0 0 0 1px #d54309;
        }
        .input-error-message {
            color: #b50909;
            font-size: 14px;
            margin: 6px 0 0;
            font-weight: 700;
        }
        .error-summary {
            border-left: 8px solid #d54309;
            background: #fff5f2;
            padding: 16px 18px;
            margin: 20px 0 24px;
        }
        .error-summary h3 {
            margin: 0 0 8px;
            font-size: 24px;
        }
        .error-summary ul {
            margin: 0;
            padding-left: 18px;
        }
        .form-shell.is-pending {
            opacity: .76;
            pointer-events: none;
        }
        .loading-mask {
            position: fixed;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 45, 98, 0.72);
            z-index: 9999;
            opacity: 0;
            visibility: hidden;
            transition: opacity .18s ease, visibility .18s ease;
        }
        .loading-mask.is-visible {
            opacity: 1;
            visibility: visible;
        }
        .loading-card {
            background: #fff;
            color: #1b1b1b;
            padding: 18px 22px;
            min-width: 280px;
            border-radius: 6px;
            box-shadow: 0 16px 40px rgba(0,0,0,.24);
            text-align: center;
        }
        .loading-spinner {
            width: 42px;
            height: 42px;
            margin: 0 auto 12px;
            border-radius: 50%;
            border: 4px solid #dbe8f4;
            border-top-color: #00599c;
            animation: irs-spin 1s linear infinite;
        }
        @keyframes irs-spin {
            to { transform: rotate(360deg); }
        }
        .is-delayed {
            visibility: hidden;
        }
        .is-delayed.is-ready {
            visibility: visible;
        }
        .irs-button[disabled] {
            opacity: .55;
            cursor: wait;
        }

        input[type="text"],
        select {
            width: 100%;
            border: 1px solid #8f9aa7;
            border-radius: 2px;
            padding: 10px 12px;
            font-size: 16px;
            background: #fff;
        }

        .radio-group { margin-top: 8px; }
        .radio-item { margin: 10px 0; }
        .radio-item label { font-weight: 400; display: inline; }
        .radio-item input[type="radio"] { margin-right: 8px; transform: translateY(1px); }
        .choice-note { margin-left: 26px; color: #4b5563; font-size: 14px; }

        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .alert {
            border-left: 6px solid #2b7bb9;
            background: #edf5ff;
            padding: 14px 16px;
            margin: 18px 0;
        }
        .alert h4 { margin: 0 0 8px; font-size: 21px; }

        .actions {
            margin-top: 28px;
            margin-bottom: 16px;
        }
        .irs-button {
            display: inline-block;
            border: 2px solid #0a4a83;
            background: #0a4a83;
            color: #fff;
            padding: 10px 18px;
            border-radius: 4px;
            font-weight: 700;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
        }
        .irs-button.inverted {
            background: #fff;
            color: #0a4a83;
        }
        .irs-button + .irs-button { margin-left: 8px; }

        .summary-card {
            border: 1px solid var(--line);
            border-radius: 4px;
            overflow: hidden;
            margin: 16px 0;
        }
        .summary-row {
            display: grid;
            grid-template-columns: 220px 1fr;
            border-top: 1px solid var(--line);
        }
        .summary-row:first-child { border-top: 0; }
        .summary-row > div { padding: 12px 14px; }
        .summary-row > div:first-child { font-weight: 700; background: #f9fafb; }

        .footer {
            margin-top: 40px;
            border-top: 1px solid var(--line);
            padding-top: 14px;
            color: #5b6470;
            font-size: 14px;
        }

        [hidden] { display: none !important; }

        @media (max-width: 900px) {
            h1 { font-size: 36px; }
            .section-title { font-size: 30px; }
            h3 { font-size: 24px; }
            .step-title { font-size: 12px; }
            .grid-2 { grid-template-columns: 1fr; }
            .summary-row { grid-template-columns: 1fr; }
        }
    </style>
</head>
<body>
    <div class="loading-mask" id="loading-mask" aria-hidden="true">
        <div class="loading-card" role="status" aria-live="polite">
            <div class="loading-spinner"></div>
            <div id="loading-text">Loading application...</div>
        </div>
    </div>
    <div class="gov-banner">
        <div class="container">An official website of the United States Government</div>
    </div>

    <header class="top-header" role="banner">
        <div class="container top-header-inner">
            <div class="logo">IRS</div>
            <nav class="top-links">
                <a href="#">Help</a>
                <a href="#">English</a>
                <a href="#">Exit</a>
            </nav>
        </div>
    </header>

    <main class="main" role="main" id="main">
        <div class="container">
            <div class="breadcrumbs">
                <a href="#">Home</a><span class="sep">/</span>
                <a href="#">File</a><span class="sep">/</span>
                <a href="#">Get an employer identification number</a><span class="sep">/</span>
                <span>Apply for an Employer Identification Number (EIN) online</span>
            </div>

            <h1 tabindex="-1" data-testid="app-title">Apply for an Employer Identification Number (EIN)</h1>
            <div class="subtitle">Use this assistance to apply for and obtain an Employee Identification Number (EIN)</div>

            @php
                $stepDisplay = [
                    1 => 'Legal Structure',
                    2 => 'Identity',
                    3 => 'Addresses',
                    4 => 'Additional Details',
                    5 => 'Review & Submit',
                    6 => 'EIN Assignment',
                ];
                $currentStep4Phase = $step4Phase ?? 'details';
                $bootDelayMs = match($step) {
                    1 => 750,
                    2 => 1050,
                    3 => 950,
                    4 => $currentStep4Phase === 'activity' ? 1350 : 1100,
                    5 => 1250,
                    6 => 1700,
                    default => 900,
                };
                $submitDelayMs = match($step) {
                    5 => 2400,
                    6 => 600,
                    default => 950,
                };
            @endphp
            <div class="step-wrap">
                <h2 class="step-head">Step {{ $step }}of 6: {{ $stepDisplay[$step] }}</h2>
                <div class="stepper" aria-label="Progress Tracker" role="navigation">
                    @foreach($steps as $i => $name)
                        @php
                            $display = $stepDisplay[$i];
                            $stateClass = $i < $step ? 'done' : ($i === $step ? 'active' : '');
                        @endphp
                        <div class="step {{ $stateClass }}" data-testid="step-indicator-{{ $i }}">
                            <div class="dot">{{ $i }}</div>
                            <div class="step-title">{{ $display }}</div>
                        </div>
                    @endforeach
                </div>
            </div>

            <div class="form-shell is-delayed" id="form-shell" data-boot-delay="{{ $bootDelayMs }}" data-submit-delay="{{ $submitDelayMs }}" data-step="{{ $step }}" data-phase="{{ $currentStep4Phase }}">
            <form method="post" action="{{ $formAction }}" data-testid="step-form-{{ $step }}" id="step-form">
                @csrf
                @if($step === 4)
                    <input type="hidden" name="_step4_phase" value="{{ $currentStep4Phase }}">
                @endif
                @if($errors->any())
                    <div class="error-summary" role="alert" aria-live="assertive">
                        <h3>Your application contains errors</h3>
                        <ul>
                            @foreach($errors->all() as $error)
                                <li>{{ $error }}</li>
                            @endforeach
                        </ul>
                    </div>
                @endif

                @if($step === 1)
                    <h2 class="section-title">Legal Structure</h2>
                    <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>

                    <h3>What type of legal structure is applying for an EIN?</h3>
                    <div class="help-text">
                        If you still don't see your organization type, click on "View Additional Types including Non-Profit/Tax-Exempt Organizations" to view more types.
                    </div>

                    <div class="field {{ $errors->has('legalStructureInput') ? 'field--error' : '' }}">
                        <label>Choose type of legal structure <span class="required">*</span></label>
                        <div class="radio-group">
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="SOLE_PROPRIETORlegalStructureInputid" value="SOLE_PROPRIETOR" @checked(($state['legal_structure']['type'] ?? '') === 'SOLE_PROPRIETOR') data-testid="legal-type-sole_proprietor"><label for="SOLE_PROPRIETORlegalStructureInputid">Sole Proprietor</label><div class="choice-note">Includes individuals who are in business for themselves and household employers.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="PARTNERSHIPlegalStructureInputid" value="PARTNERSHIP" @checked(($state['legal_structure']['type'] ?? '') === 'PARTNERSHIP') data-testid="legal-type-partnership"><label for="PARTNERSHIPlegalStructureInputid">Partnerships</label><div class="choice-note">Includes partnerships and joint ventures.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="CORPORATIONlegalStructureInputid" value="CORPORATION" @checked(($state['legal_structure']['type'] ?? '') === 'CORPORATION') data-testid="legal-type-corporation"><label for="CORPORATIONlegalStructureInputid">Corporations</label><div class="choice-note">Includes S corporations, personal service corporations, REIT, RIC, and settlement funds.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="LLClegalStructureInputid" value="LLC" @checked(($state['legal_structure']['type'] ?? '') === 'LLC') data-testid="legal-type-llc"><label for="LLClegalStructureInputid">Limited Liability Company (LLC)</label><div class="choice-note">A structure allowed by state statute and formed by filing articles of organization with the state.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="ESTATElegalStructureInputid" value="ESTATE" @checked(($state['legal_structure']['type'] ?? '') === 'ESTATE') data-testid="legal-type-estate"><label for="ESTATElegalStructureInputid">Estate</label><div class="choice-note">An estate is a legal entity created as a result of a person's death.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="ALL_OTHERS_TRUSTlegalStructureInputid" value="ALL_OTHERS_TRUST" @checked(($state['legal_structure']['type'] ?? '') === 'ALL_OTHERS_TRUST') data-testid="legal-type-trust"><label for="ALL_OTHERS_TRUSTlegalStructureInputid">Trusts</label><div class="choice-note">Includes conservatorships, custodianships, guardianships, revocable and irrevocable trusts.</div></div>
                            <div class="radio-item"><input type="radio" name="legalStructureInput" id="OTHER_NON_PROFITlegalStructureInputid" value="OTHER_NON_PROFIT" @checked(($state['legal_structure']['type'] ?? '') === 'OTHER_NON_PROFIT') data-testid="legal-type-other"><label for="OTHER_NON_PROFITlegalStructureInputid">View Additional Types, Including Tax-Exempt and Governmental Organizations</label></div>
                        </div>
                        @if($errors->has('legalStructureInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('legalStructureInput') }}</p>@endif
                    </div>

                    <div id="legal-extra" @if(($state['legal_structure']['type'] ?? '') !== 'SOLE_PROPRIETOR') hidden @endif>
                        <div class="alert">
                            <h4>Confirm your selection of Sole Proprietor as the type of structure applying for an EIN</h4>
                            <ul>
                                <li>A sole proprietorship is a business owned by one individual.</li>
                                <li>All business income and expenses are reported on the individual's federal income tax return.</li>
                                <li>A sole proprietor may or may not have employees.</li>
                            </ul>
                        </div>

                        <h3>Why is the Sole Proprietor requesting an EIN?</h3>
                        <div class="help-text">If more than one reason applies to you, choose the best or main reason.</div>

                        <div class="field {{ $errors->has('solePropStructureInput') || $errors->has('reasonForApplyingInputControl') ? 'field--error' : '' }}">
                            <label>Choose one reason that best describes why you are applying for an EIN <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="solePropStructureInput" value="SOLE_PROPRIETOR" @checked(($state['legal_structure']['sub_type'] ?? '') === 'SOLE_PROPRIETOR') id="SOLE_PROPRIETORsolePropStructureInputid"><label for="SOLE_PROPRIETORsolePropStructureInputid">Sole Proprietor</label></div>
                                <div class="radio-item"><input type="radio" name="solePropStructureInput" value="HOUSEHOLD_EMPLOYER" @checked(($state['legal_structure']['sub_type'] ?? '') === 'HOUSEHOLD_EMPLOYER') id="HOUSEHOLD_EMPLOYERsolePropStructureInputid"><label for="HOUSEHOLD_EMPLOYERsolePropStructureInputid">Household Employer</label></div>
                                <div class="radio-item"><input type="radio" name="reasonForApplyingInputControl" value="NEW_BUSINESS" @checked(($state['legal_structure']['reason'] ?? '') === 'NEW_BUSINESS') id="NEW_BUSINESSreasonForApplyingInputControlid" data-testid="legal-reason-new-business"><label for="NEW_BUSINESSreasonForApplyingInputControlid">Started a new business</label><div class="choice-note">If you are beginning a new business.</div></div>
                                <div class="radio-item"><input type="radio" name="reasonForApplyingInputControl" value="HIRED_EMPLOYEES" @checked(($state['legal_structure']['reason'] ?? '') === 'HIRED_EMPLOYEES') id="HIRED_EMPLOYEESreasonForApplyingInputControlid" data-testid="legal-reason-hired-employees"><label for="HIRED_EMPLOYEESreasonForApplyingInputControlid">Hired employee(s)</label><div class="choice-note">If you already have a business and need to hire employees.</div></div>
                                <div class="radio-item"><input type="radio" name="reasonForApplyingInputControl" value="BANKING_NEEDS" @checked(($state['legal_structure']['reason'] ?? '') === 'BANKING_NEEDS') id="BANKING_NEEDSreasonForApplyingInputControlid" data-testid="legal-reason-banking"><label for="BANKING_NEEDSreasonForApplyingInputControlid">Banking purposes</label></div>
                                <div class="radio-item"><input type="radio" name="reasonForApplyingInputControl" value="CHANGING_LEGAL_STRUCTURE" @checked(($state['legal_structure']['reason'] ?? '') === 'CHANGING_LEGAL_STRUCTURE') id="CHANGING_LEGAL_STRUCTUREreasonForApplyingInputControlid" data-testid="legal-reason-changed-org"><label for="CHANGING_LEGAL_STRUCTUREreasonForApplyingInputControlid">Changed type of organization</label></div>
                                <div class="radio-item"><input type="radio" name="reasonForApplyingInputControl" value="PURCHASED_BUSINESS" @checked(($state['legal_structure']['reason'] ?? '') === 'PURCHASED_BUSINESS') id="PURCHASED_BUSINESSreasonForApplyingInputControlid" data-testid="legal-reason-purchased"><label for="PURCHASED_BUSINESSreasonForApplyingInputControlid">Purchased active business</label></div>
                            </div>
                            @if($errors->has('solePropStructureInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('solePropStructureInput') }}</p>@endif
                            @if($errors->has('reasonForApplyingInputControl'))<p class="input-error-message" aria-live="polite">{{ $errors->first('reasonForApplyingInputControl') }}</p>@endif
                        </div>
                    </div>
                @endif

                @if($step === 2)
                    <h2 class="section-title">Identity</h2>
                    <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>

                    <div class="help-text"><b>Please tell us about the Sole Proprietor</b><br>Must match IRS records or this application cannot be processed.</div>

                    <div class="field {{ $errors->has('responsibleSsn') ? 'field--error' : '' }}">
                        <label for="responsibleSsn">SSN/ITIN <span class="required">*</span></label>
                        <div class="hint">Example: 123-45-6789</div>
                        <input id="responsibleSsn" name="responsibleSsn" value="{{ $state['identity']['ssn'] ?? '' }}" data-testid="identity-ssn" type="text">
                        @if($errors->has('responsibleSsn'))<p class="input-error-message" aria-live="polite">{{ $errors->first('responsibleSsn') }}</p>@endif
                    </div>

                    <div class="grid-2">
                        <div class="field {{ $errors->has('responsibleFirstName') ? 'field--error' : '' }}"><label for="responsibleFirstName">First name <span class="required">*</span></label><div class="hint">The only special characters allowed are '-' and '&amp;'</div><input id="responsibleFirstName" name="responsibleFirstName" value="{{ $state['identity']['first_name'] ?? '' }}" data-testid="identity-first-name" type="text">@if($errors->has('responsibleFirstName'))<p class="input-error-message" aria-live="polite">{{ $errors->first('responsibleFirstName') }}</p>@endif</div>
                        <div class="field {{ $errors->has('responsibleMiddleName') ? 'field--error' : '' }}"><label for="responsibleMiddleName">Middle name/initial</label><div class="hint">The only special characters allowed are '-' and '&amp;'</div><input id="responsibleMiddleName" name="responsibleMiddleName" value="{{ $state['identity']['middle_name'] ?? '' }}" data-testid="identity-middle-name" type="text">@if($errors->has('responsibleMiddleName'))<p class="input-error-message" aria-live="polite">{{ $errors->first('responsibleMiddleName') }}</p>@endif</div>
                        <div class="field {{ $errors->has('responsibleLastName') ? 'field--error' : '' }}"><label for="responsibleLastName">Last name <span class="required">*</span></label><div class="hint">The only special characters allowed are '-' and '&amp;'</div><input id="responsibleLastName" name="responsibleLastName" value="{{ $state['identity']['last_name'] ?? '' }}" data-testid="identity-last-name" type="text">@if($errors->has('responsibleLastName'))<p class="input-error-message" aria-live="polite">{{ $errors->first('responsibleLastName') }}</p>@endif</div>
                        <div class="field"><label for="responsibleSuffix">Suffix</label><div class="hint">Jr, Sr, etc.</div><select id="responsibleSuffix" name="responsibleSuffix" data-testid="identity-suffix"><option value=""></option><option value="JR" @selected(($state['identity']['suffix'] ?? '')==='JR')>Jr</option><option value="SR" @selected(($state['identity']['suffix'] ?? '')==='SR')>Sr</option><option value="II" @selected(($state['identity']['suffix'] ?? '')==='II')>II</option><option value="III" @selected(($state['identity']['suffix'] ?? '')==='III')>III</option></select></div>
                    </div>

                    <h3>Your role</h3>
                    <div class="field {{ $errors->has('entityRoleRadioInput') ? 'field--error' : '' }}">
                        <label>Choose one <span class="required">*</span></label>
                        <div class="radio-group">
                            <div class="radio-item"><input type="radio" name="entityRoleRadioInput" value="yes" id="yesentityRoleRadioInputid" @checked(($state['identity']['role'] ?? '') === 'yes') data-testid="identity-role-sole"><label for="yesentityRoleRadioInputid">I am the sole proprietor.</label></div>
                            <div class="radio-item"><input type="radio" name="entityRoleRadioInput" value="no" id="noentityRoleRadioInputid" @checked(($state['identity']['role'] ?? '') === 'no') data-testid="identity-role-other"><label for="noentityRoleRadioInputid">I am a third party applying for an EIN on behalf of this sole proprietor.</label></div>
                        </div>
                        @if($errors->has('entityRoleRadioInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('entityRoleRadioInput') }}</p>@endif
                    </div>

                    <div id="role-other-block" @if(($state['identity']['role'] ?? '') !== 'no') hidden @endif>
                        <div class="grid-2">
                            <div class="field {{ $errors->has('thirdPartyNameInput') ? 'field--error' : '' }}">
                                <label for="thirdPartyNameInput">Third-party designee name</label>
                                <input id="thirdPartyNameInput" name="thirdPartyNameInput" value="{{ $state['identity']['third_party_name'] ?? '' }}" type="text">
                                @if($errors->has('thirdPartyNameInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('thirdPartyNameInput') }}</p>@endif
                            </div>
                            <div class="field {{ $errors->has('thirdPartyPhoneInput') ? 'field--error' : '' }}">
                                <label for="thirdPartyPhoneInput">Third-party designee phone</label>
                                <input id="thirdPartyPhoneInput" name="thirdPartyPhoneInput" value="{{ $state['identity']['third_party_phone'] ?? '' }}" type="text">
                                @if($errors->has('thirdPartyPhoneInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('thirdPartyPhoneInput') }}</p>@endif
                            </div>
                        </div>
                    </div>
                @endif

                @if($step === 3)
                    <h2 class="section-title">Addresses</h2>
                    <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>

                    <div class="help-text"><b>Where is the Sole Proprietor physically located?</b><br>Note: Must be a U.S. address. Do not enter a P.O. box.</div>

                    <div class="grid-2">
                        <div class="field {{ $errors->has('physicalStreet') ? 'field--error' : '' }}"><label for="physicalStreet">Street <span class="required">*</span></label><div class="hint">The only special characters allowed are '-' and '/'</div><input id="physicalStreet" name="physicalStreet" value="{{ $state['addresses']['street'] ?? '' }}" data-testid="address-street" type="text">@if($errors->has('physicalStreet'))<p class="input-error-message" aria-live="polite">{{ $errors->first('physicalStreet') }}</p>@endif</div>
                        <div class="field {{ $errors->has('physicalCity') ? 'field--error' : '' }}"><label for="physicalCity">City <span class="required">*</span></label><div class="hint">The only special characters allowed are '-' and '/'</div><input id="physicalCity" name="physicalCity" value="{{ $state['addresses']['city'] ?? '' }}" data-testid="address-city" type="text">@if($errors->has('physicalCity'))<p class="input-error-message" aria-live="polite">{{ $errors->first('physicalCity') }}</p>@endif</div>
                        <div class="field {{ $errors->has('physicalState') ? 'field--error' : '' }}"><label for="physicalState">State/U.S. territory <span class="required">*</span></label><select id="physicalState" name="physicalState" data-testid="address-state"><option value="">Select an Option</option><option value="OK" @selected(($state['addresses']['state'] ?? '')==='OK')>Oklahoma (OK)</option><option value="CA" @selected(($state['addresses']['state'] ?? '')==='CA')>California (CA)</option><option value="TX" @selected(($state['addresses']['state'] ?? '')==='TX')>Texas (TX)</option><option value="NY" @selected(($state['addresses']['state'] ?? '')==='NY')>New York (NY)</option><option value="FL" @selected(($state['addresses']['state'] ?? '')==='FL')>Florida (FL)</option></select>@if($errors->has('physicalState'))<p class="input-error-message" aria-live="polite">{{ $errors->first('physicalState') }}</p>@endif</div>
                        <div class="field {{ $errors->has('physicalZipCode') ? 'field--error' : '' }}"><label for="physicalZipCode">ZIP/Postal code <span class="required">*</span></label><div class="hint">The postal code must be 5 digits</div><input id="physicalZipCode" name="physicalZipCode" value="{{ $state['addresses']['zip'] ?? '' }}" data-testid="address-zip" type="text">@if($errors->has('physicalZipCode'))<p class="input-error-message" aria-live="polite">{{ $errors->first('physicalZipCode') }}</p>@endif</div>
                    </div>

                    <div class="field {{ $errors->has('thePhone') ? 'field--error' : '' }}"><label for="thePhone">Phone number <span class="required">*</span></label><div class="hint">Must contain only digits; do not enter extensions</div><input id="thePhone" name="thePhone" value="{{ $state['addresses']['phone'] ?? '' }}" data-testid="address-phone" type="text">@if($errors->has('thePhone'))<p class="input-error-message" aria-live="polite">{{ $errors->first('thePhone') }}</p>@endif</div>

                    <div class="field {{ $errors->has('otherAddress') ? 'field--error' : '' }}">
                        <label>Do you have an address different from the above where you want your mail to be sent? <span class="required">*</span></label>
                        <div class="radio-group">
                            <div class="radio-item"><input type="radio" name="otherAddress" id="yesotherAddressid" value="yes" @checked(($state['addresses']['other_address'] ?? '') === 'yes') data-testid="address-other-yes"><label for="yesotherAddressid">Yes</label></div>
                            <div class="radio-item"><input type="radio" name="otherAddress" id="nootherAddressid" value="no" @checked(($state['addresses']['other_address'] ?? '') === 'no') data-testid="address-other-no"><label for="nootherAddressid">No</label></div>
                        </div>
                        @if($errors->has('otherAddress'))<p class="input-error-message" aria-live="polite">{{ $errors->first('otherAddress') }}</p>@endif
                    </div>

                    <div id="mailing-block" @if(($state['addresses']['other_address'] ?? '') !== 'yes') hidden @endif>
                        <h3>Mailing Address</h3>
                        <div class="grid-2">
                            <div class="field {{ $errors->has('mailingStreetInput') ? 'field--error' : '' }}"><label for="mailingStreetInput">Street <span class="required">*</span></label><input id="mailingStreetInput" name="mailingStreetInput" value="{{ $state['addresses']['mailing_street'] ?? '' }}" type="text">@if($errors->has('mailingStreetInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('mailingStreetInput') }}</p>@endif</div>
                            <div class="field {{ $errors->has('mailingCityInput') ? 'field--error' : '' }}"><label for="mailingCityInput">City <span class="required">*</span></label><input id="mailingCityInput" name="mailingCityInput" value="{{ $state['addresses']['mailing_city'] ?? '' }}" type="text">@if($errors->has('mailingCityInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('mailingCityInput') }}</p>@endif</div>
                            <div class="field">
                                <label for="mailingStateInput">State/U.S. territory <span class="required">*</span></label>
                                <select id="mailingStateInput" name="mailingStateInput">
                                    <option value="">Select an Option</option>
                                    <option value="OK" @selected(($state['addresses']['mailing_state'] ?? '')==='OK')>Oklahoma (OK)</option>
                                    <option value="CA" @selected(($state['addresses']['mailing_state'] ?? '')==='CA')>California (CA)</option>
                                    <option value="TX" @selected(($state['addresses']['mailing_state'] ?? '')==='TX')>Texas (TX)</option>
                                    <option value="NY" @selected(($state['addresses']['mailing_state'] ?? '')==='NY')>New York (NY)</option>
                                    <option value="FL" @selected(($state['addresses']['mailing_state'] ?? '')==='FL')>Florida (FL)</option>
                                </select>
                                @if($errors->has('mailingStateInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('mailingStateInput') }}</p>@endif
                            </div>
                            <div class="field {{ $errors->has('mailingZipInput') ? 'field--error' : '' }}"><label for="mailingZipInput">ZIP/Postal code <span class="required">*</span></label><input id="mailingZipInput" name="mailingZipInput" value="{{ $state['addresses']['mailing_zip'] ?? '' }}" type="text">@if($errors->has('mailingZipInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('mailingZipInput') }}</p>@endif</div>
                        </div>
                    </div>
                @endif

                @if($step === 4)
                    @if($currentStep4Phase === 'details')
                        <h2 class="section-title">Additional Details</h2>
                        <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>

                        <div class="grid-2">
                            <div class="field"><label>Trade name/Doing business as (only if different from name)</label><input id="dbaNameInput" name="dbaNameInput" value="{{ $state['additional']['dba_name'] ?? '' }}" data-testid="additional-dba-name" type="text"></div>
                            <div class="field {{ $errors->has('countyInput') ? 'field--error' : '' }}"><label>County where Sole Proprietor is located <span class="required">*</span></label><input id="countyInput" name="countyInput" value="{{ $state['additional']['county'] ?? '' }}" data-testid="additional-county" type="text">@if($errors->has('countyInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('countyInput') }}</p>@endif</div>
                            <div class="field">
                                <label>State/Territory where the Sole Proprietor is located <span class="required">*</span></label>
                                <select id="stateInput" name="stateInput" data-testid="additional-state">
                                    <option value="" disabled hidden>Select an Option</option>
                                    <option value="AK" @selected(($state['additional']['state'] ?? '')==='AK')>Alaska (AK)</option>
                                    <option value="AL" @selected(($state['additional']['state'] ?? '')==='AL')>Alabama (AL)</option>
                                    <option value="AR" @selected(($state['additional']['state'] ?? '')==='AR')>Arkansas (AR)</option>
                                    <option value="AZ" @selected(($state['additional']['state'] ?? '')==='AZ')>Arizona (AZ)</option>
                                    <option value="CA" @selected(($state['additional']['state'] ?? '')==='CA')>California (CA)</option>
                                    <option value="CO" @selected(($state['additional']['state'] ?? '')==='CO')>Colorado (CO)</option>
                                    <option value="CT" @selected(($state['additional']['state'] ?? '')==='CT')>Connecticut (CT)</option>
                                    <option value="DE" @selected(($state['additional']['state'] ?? '')==='DE')>Delaware (DE)</option>
                                    <option value="DC" @selected(($state['additional']['state'] ?? '')==='DC')>District of Columbia (DC)</option>
                                    <option value="FL" @selected(($state['additional']['state'] ?? '')==='FL')>Florida (FL)</option>
                                    <option value="GA" @selected(($state['additional']['state'] ?? '')==='GA')>Georgia (GA)</option>
                                    <option value="HI" @selected(($state['additional']['state'] ?? '')==='HI')>Hawaii (HI)</option>
                                    <option value="ID" @selected(($state['additional']['state'] ?? '')==='ID')>Idaho (ID)</option>
                                    <option value="IL" @selected(($state['additional']['state'] ?? '')==='IL')>Illinois (IL)</option>
                                    <option value="IN" @selected(($state['additional']['state'] ?? '')==='IN')>Indiana (IN)</option>
                                    <option value="IA" @selected(($state['additional']['state'] ?? '')==='IA')>Iowa (IA)</option>
                                    <option value="KS" @selected(($state['additional']['state'] ?? '')==='KS')>Kansas (KS)</option>
                                    <option value="KY" @selected(($state['additional']['state'] ?? '')==='KY')>Kentucky (KY)</option>
                                    <option value="LA" @selected(($state['additional']['state'] ?? '')==='LA')>Louisiana (LA)</option>
                                    <option value="ME" @selected(($state['additional']['state'] ?? '')==='ME')>Maine (ME)</option>
                                    <option value="MD" @selected(($state['additional']['state'] ?? '')==='MD')>Maryland (MD)</option>
                                    <option value="MA" @selected(($state['additional']['state'] ?? '')==='MA')>Massachusetts (MA)</option>
                                    <option value="MI" @selected(($state['additional']['state'] ?? '')==='MI')>Michigan (MI)</option>
                                    <option value="MN" @selected(($state['additional']['state'] ?? '')==='MN')>Minnesota (MN)</option>
                                    <option value="MS" @selected(($state['additional']['state'] ?? '')==='MS')>Mississippi (MS)</option>
                                    <option value="MO" @selected(($state['additional']['state'] ?? '')==='MO')>Missouri (MO)</option>
                                    <option value="MT" @selected(($state['additional']['state'] ?? '')==='MT')>Montana (MT)</option>
                                    <option value="NE" @selected(($state['additional']['state'] ?? '')==='NE')>Nebraska (NE)</option>
                                    <option value="NV" @selected(($state['additional']['state'] ?? '')==='NV')>Nevada (NV)</option>
                                    <option value="NH" @selected(($state['additional']['state'] ?? '')==='NH')>New Hampshire (NH)</option>
                                    <option value="NJ" @selected(($state['additional']['state'] ?? '')==='NJ')>New Jersey (NJ)</option>
                                    <option value="NM" @selected(($state['additional']['state'] ?? '')==='NM')>New Mexico (NM)</option>
                                    <option value="NY" @selected(($state['additional']['state'] ?? '')==='NY')>New York (NY)</option>
                                    <option value="NC" @selected(($state['additional']['state'] ?? '')==='NC')>North Carolina (NC)</option>
                                    <option value="ND" @selected(($state['additional']['state'] ?? '')==='ND')>North Dakota (ND)</option>
                                    <option value="OH" @selected(($state['additional']['state'] ?? '')==='OH')>Ohio (OH)</option>
                                    <option value="OK" @selected(($state['additional']['state'] ?? '')==='OK')>Oklahoma (OK)</option>
                                    <option value="OR" @selected(($state['additional']['state'] ?? '')==='OR')>Oregon (OR)</option>
                                    <option value="PA" @selected(($state['additional']['state'] ?? '')==='PA')>Pennsylvania (PA)</option>
                                    <option value="RI" @selected(($state['additional']['state'] ?? '')==='RI')>Rhode Island (RI)</option>
                                    <option value="SC" @selected(($state['additional']['state'] ?? '')==='SC')>South Carolina (SC)</option>
                                    <option value="SD" @selected(($state['additional']['state'] ?? '')==='SD')>South Dakota (SD)</option>
                                    <option value="TN" @selected(($state['additional']['state'] ?? '')==='TN')>Tennessee (TN)</option>
                                    <option value="TX" @selected(($state['additional']['state'] ?? '')==='TX')>Texas (TX)</option>
                                    <option value="UT" @selected(($state['additional']['state'] ?? '')==='UT')>Utah (UT)</option>
                                    <option value="VT" @selected(($state['additional']['state'] ?? '')==='VT')>Vermont (VT)</option>
                                    <option value="VA" @selected(($state['additional']['state'] ?? '')==='VA')>Virginia (VA)</option>
                                    <option value="WA" @selected(($state['additional']['state'] ?? '')==='WA')>Washington (WA)</option>
                                    <option value="WV" @selected(($state['additional']['state'] ?? '')==='WV')>West Virginia (WV)</option>
                                    <option value="WI" @selected(($state['additional']['state'] ?? '')==='WI')>Wisconsin (WI)</option>
                                    <option value="WY" @selected(($state['additional']['state'] ?? '')==='WY')>Wyoming (WY)</option>
                                    <option value="AS" @selected(($state['additional']['state'] ?? '')==='AS')>American Samoa (AS)</option>
                                    <option value="FM" @selected(($state['additional']['state'] ?? '')==='FM')>Micronesia, Federated States (FM)</option>
                                    <option value="GU" @selected(($state['additional']['state'] ?? '')==='GU')>Guam (GU)</option>
                                    <option value="MH" @selected(($state['additional']['state'] ?? '')==='MH')>Marshall Islands (MH)</option>
                                    <option value="MP" @selected(($state['additional']['state'] ?? '')==='MP')>Northern Mariana Island (MP)</option>
                                    <option value="PR" @selected(($state['additional']['state'] ?? '')==='PR')>Puerto Rico (PR)</option>
                                    <option value="VI" @selected(($state['additional']['state'] ?? '')==='VI')>Virgin Islands (US) (VI)</option>
                                    <option value="AA" @selected(($state['additional']['state'] ?? '')==='AA')>Armed Forces Americas (AA)</option>
                                    <option value="AP" @selected(($state['additional']['state'] ?? '')==='AP')>Armed Forces Pacific (AP)</option>
                                    <option value="AE" @selected(($state['additional']['state'] ?? '')==='AE')>Armed Forces Others (AE)</option>
                                </select>
                            </div>
                        </div>

                        <div class="field" style="margin-top: 6px;">
                            <label>Sole Proprietor Start Date <span class="required">*</span></label>
                            <div class="grid-2">
                                <div class="field">
                                    <label>Month</label>
                                <select id="startDateMonthInput" name="startDateMonthInput" data-testid="additional-start-month">
                                        <option value=""></option>
                                        @foreach(['JANUARY'=>'January','FEBRUARY'=>'February','MARCH'=>'March','APRIL'=>'April','MAY'=>'May','JUNE'=>'June','JULY'=>'July','AUGUST'=>'August','SEPTEMBER'=>'September','OCTOBER'=>'October','NOVEMBER'=>'November','DECEMBER'=>'December'] as $mv => $ml)
                                            <option value="{{ $mv }}" @selected(($state['additional']['start_month'] ?? '')===$mv)>{{ $ml }}</option>
                                        @endforeach
                                    </select>
                                    @if($errors->has('startDateMonthInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('startDateMonthInput') }}</p>@endif
                                </div>
                                <div class="field {{ $errors->has('startDateYearInput') ? 'field--error' : '' }}"><label>Year</label><input id="startDateYearInput" name="startDateYearInput" value="{{ $state['additional']['start_year'] ?? '' }}" data-testid="additional-start-year" type="text" placeholder="YYYY">@if($errors->has('startDateYearInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('startDateYearInput') }}</p>@endif</div>
                            </div>
                        </div>

                        <section style="margin: 8px 0 14px;">
                            <h4>Tell us more about the Sole Proprietor</h4>
                        </section>

                        <div class="field">
                            <label>Does your business own a highway motor vehicle with a taxable gross weight of 55,000 pounds or more? <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="highwayVehiclesInput" value="yes" id="yeshighwayVehiclesInputid" @checked(($state['additional']['highway_vehicles'] ?? '') === 'yes')><label for="yeshighwayVehiclesInputid">Yes</label></div>
                                <div class="radio-item"><input type="radio" name="highwayVehiclesInput" value="no" id="nohighwayVehiclesInputid" @checked(($state['additional']['highway_vehicles'] ?? '') === 'no')><label for="nohighwayVehiclesInputid">No</label></div>
                            </div>
                        </div>
                        <div class="field">
                            <label>Do you have any principal activity involving gambling/wagering? <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="gamblingWagerInput" value="yes" id="yesgamblingWagerInputid" @checked(($state['additional']['gambling'] ?? '') === 'yes')><label for="yesgamblingWagerInputid">Yes</label></div>
                                <div class="radio-item"><input type="radio" name="gamblingWagerInput" value="no" id="nogamblingWagerInputid" @checked(($state['additional']['gambling'] ?? '') === 'no')><label for="nogamblingWagerInputid">No</label></div>
                            </div>
                        </div>
                        <div class="field">
                            <label>Do you need to file Form 720 (Quarterly Federal Excise Tax Return)? <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="fileForm720Input" value="yes" id="yesfileForm720Inputid" @checked(($state['additional']['form_720'] ?? '') === 'yes')><label for="yesfileForm720Inputid">Yes</label></div>
                                <div class="radio-item"><input type="radio" name="fileForm720Input" value="no" id="nofileForm720Inputid" @checked(($state['additional']['form_720'] ?? '') === 'no')><label for="nofileForm720Inputid">No</label></div>
                            </div>
                        </div>
                        <div class="field">
                            <label>Does your business sell or manufacture alcohol, tobacco, or firearms? <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="atfInput" value="yes" id="yesatfInputid" @checked(($state['additional']['atf'] ?? '') === 'yes')><label for="yesatfInputid">Yes</label></div>
                                <div class="radio-item"><input type="radio" name="atfInput" value="no" id="noatfInputid" @checked(($state['additional']['atf'] ?? '') === 'no')><label for="noatfInputid">No</label></div>
                            </div>
                        </div>
                        <div class="field {{ $errors->has('hasEmployeesInput') || $errors->has('employeeCountInput') || $errors->has('firstWageDateInput') ? 'field--error' : '' }}">
                            <label>Do you have, or do you expect to have, any employees who will receive Forms W-2 in the next 12 months? (Forms W-2 require additional filings with the IRS.) <span class="required">*</span></label>
                            <div class="radio-group">
                                <div class="radio-item"><input type="radio" name="hasEmployeesInput" value="yes" id="yeshasEmployeesInputid" @checked(($state['additional']['employees'] ?? '') === 'yes')><label for="yeshasEmployeesInputid">Yes</label></div>
                                <div class="radio-item"><input type="radio" name="hasEmployeesInput" value="no" id="nohasEmployeesInputid" @checked(($state['additional']['employees'] ?? '') === 'no')><label for="nohasEmployeesInputid">No</label></div>
                            </div>
                            @if($errors->has('hasEmployeesInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('hasEmployeesInput') }}</p>@endif
                        </div>

                        <div id="employee-block" @if(($state['additional']['employees'] ?? '') !== 'yes') hidden @endif>
                            <div class="grid-2">
                                <div class="field">
                                    <label for="employeeCountInput">Expected number of employees in next 12 months</label>
                                    <input id="employeeCountInput" name="employeeCountInput" type="text" value="{{ $state['additional']['employee_count'] ?? '' }}">
                                    @if($errors->has('employeeCountInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('employeeCountInput') }}</p>@endif
                                </div>
                                <div class="field">
                                    <label for="firstWageDateInput">Date wages first paid (MM/YYYY)</label>
                                    <input id="firstWageDateInput" name="firstWageDateInput" type="text" placeholder="MM/YYYY" value="{{ $state['additional']['first_wage_date'] ?? '' }}">
                                    @if($errors->has('firstWageDateInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('firstWageDateInput') }}</p>@endif
                                </div>
                            </div>
                        </div>
                    @else
                        <h2 class="section-title">Additional Details: Provided Business Activity and Services</h2>
                        <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>

                        <h3 style="font-size:26px;">What does your business or organization do?</h3>
                        <div class="field {{ $errors->has('entityBusinessCategoryInput') ? 'field--error' : '' }}">
                            <label>Choose one category that best describes your business <span class="required">*</span></label>
                            <div class="radio-group">
                                @foreach([
                                    'ACCOMMODATIONS' => 'Accommodations',
                                    'CONSTRUCTION' => 'Construction',
                                    'FINANCE' => 'Finance',
                                    'FOOD_SERVICE' => 'Food Service',
                                    'HEALTH_CARE' => 'Health Care',
                                    'INSURANCE' => 'Insurance',
                                    'MANUFACTURING' => 'Manufacturing',
                                    'REAL_ESTATE' => 'Real Estate',
                                    'RENTAL_LEASING' => 'Rental & Leasing',
                                    'RETAIL' => 'Retail',
                                    'SOCIAL_ASSISTANCE' => 'Social Assistance',
                                    'TRANSPORTATION' => 'Transportation',
                                    'WAREHOUSING' => 'Warehousing',
                                    'WHOLESALE' => 'Wholesale',
                                    'OTHER' => 'Other',
                                ] as $value => $label)
                                    <div class="radio-item">
                                        <input type="radio" name="entityBusinessCategoryInput" value="{{ $value }}" id="{{ $value }}entityBusinessCategoryInputid" @checked(($state['additional']['business_activity'] ?? '') === $value)>
                                        <label for="{{ $value }}entityBusinessCategoryInputid">{{ $label }}</label>
                                    </div>
                                @endforeach
                            </div>
                            @if($errors->has('entityBusinessCategoryInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('entityBusinessCategoryInput') }}</p>@endif
                        </div>

                        <div id="wholesale-block" @if(($state['additional']['business_activity'] ?? '') !== 'WHOLESALE') hidden @endif>
                            <h4>Tell us more about your Wholesale activities</h4>
                            <div class="field {{ $errors->has('wholeSaleInput') ? 'field--error' : '' }}">
                                <label>Do you own or take title to the goods that you sell? <span class="required">*</span></label>
                                <div class="radio-group">
                                    <div class="radio-item"><input type="radio" name="wholeSaleInput" value="yes" id="yeswholeSaleInputid" @checked(($state['additional']['wholesale_owns_goods'] ?? '') === 'yes')><label for="yeswholeSaleInputid">Yes</label></div>
                                    <div class="radio-item"><input type="radio" name="wholeSaleInput" value="no" id="nowholeSaleInputid" @checked(($state['additional']['wholesale_owns_goods'] ?? '') === 'no')><label for="nowholeSaleInputid">No</label></div>
                                </div>
                                @if($errors->has('wholeSaleInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('wholeSaleInput') }}</p>@endif
                            </div>
                            <div class="field {{ $errors->has('wholesaleSecondTextInput') ? 'field--error' : '' }}">
                                <label for="wholesaleSecondTextInput">Please specify type of goods sold: <span class="required">*</span></label>
                                <input aria-label="Please specify type of goods sold:, Required" id="wholesaleSecondTextInput" name="wholesaleSecondTextInput" type="text" value="{{ $state['additional']['principal_product'] ?? '' }}">
                                @if($errors->has('wholesaleSecondTextInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('wholesaleSecondTextInput') }}</p>@endif
                            </div>
                        </div>

                        <div id="other-business-block" @if(($state['additional']['business_activity'] ?? '') !== 'OTHER') hidden @endif>
                            <div class="field {{ $errors->has('otherInput') ? 'field--error' : '' }}">
                                <label for="otherInput">Please describe your primary activity or service <span class="required">*</span></label>
                                <input id="otherInput" name="otherInput" type="text" value="{{ $state['additional']['other_input'] ?? '' }}">
                                @if($errors->has('otherInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('otherInput') }}</p>@endif
                            </div>
                        </div>
                    @endif
                @endif

                @if($step === 5)
                    <h2 class="section-title">Review and Submit</h2>
                    <div class="required-note">All fields marked with an asterisk (<span class="required">*</span>) are required.</div>
                    <div class="alert">
                        <h4>Review your information before submitting.</h4>
                        <ul>
                            <li>Click the "Submit EIN Request" button at the bottom of the page to receive your EIN.</li>
                            <li>Your EIN will be assigned immediately once processing completes.</li>
                        </ul>
                    </div>

                    <h3>How would you like to receive your EIN Confirmation Letter?</h3>
                    <div class="field {{ $errors->has('confirmationLetterRadioInput') ? 'field--error' : '' }}">
                        <label>You have two options for receiving your confirmation letter. Please choose one below <span class="required">*</span></label>
                        <div class="radio-group">
                            <div class="radio-item">
                                <input type="radio" name="confirmationLetterRadioInput" value="DIGITAL" id="DIGITALconfirmationLetterRadioInputid" @checked(($state['review']['confirmation_letter_delivery'] ?? '') === 'DIGITAL')>
                                <label for="DIGITALconfirmationLetterRadioInputid">Receive letter digitally in the next step</label>
                                <div class="choice-note">You will be able to view, print, and save this letter immediately. It will not be mailed to you.</div>
                            </div>
                            <div class="radio-item">
                                <input type="radio" name="confirmationLetterRadioInput" value="MAIL" id="MAILconfirmationLetterRadioInputid" @checked(($state['review']['confirmation_letter_delivery'] ?? '') === 'MAIL')>
                                <label for="MAILconfirmationLetterRadioInputid">Receive letter by mail (allow up to 4 weeks for delivery)</label>
                                <div class="choice-note">The IRS will send the letter to the mailing address you provided.</div>
                            </div>
                        </div>
                        @if($errors->has('confirmationLetterRadioInput'))<p class="input-error-message" aria-live="polite">{{ $errors->first('confirmationLetterRadioInput') }}</p>@endif
                    </div>

                    <h3>Summary of your information</h3>
                    @php
                        $legalName = trim(($state['identity']['first_name'] ?? '').' '.($state['identity']['last_name'] ?? '')) ?: '-';
                        $physicalAddr = trim(implode(' ', array_filter([
                            strtoupper($state['addresses']['street'] ?? ''),
                            strtoupper($state['addresses']['city'] ?? ''),
                            strtoupper($state['addresses']['state'] ?? ''),
                            ($state['addresses']['zip'] ?? ''),
                        ])));
                        $maskedSsn = $state['identity']['ssn'] ? 'XXX-XX-'.substr(preg_replace('/\D/', '', $state['identity']['ssn']), -4) : '-';
                        $tradeName = $state['additional']['dba_name'] ?: '-';
                        $startDate = trim(($state['additional']['start_month'] ?? '').' '.($state['additional']['start_year'] ?? '')) ?: '-';
                    @endphp
                    <div class="summary-card">
                        <div class="summary-row"><div>Organization Type</div><div>{{ strtoupper(str_replace('_', ' ', $state['legal_structure']['type'] ?: '-')) }}</div></div>
                        <div class="summary-row"><div>Legal name</div><div>{{ strtoupper($legalName) }}</div></div>
                        <div class="summary-row"><div>Trade name/doing business as</div><div>{{ strtoupper($tradeName) }}</div></div>
                        <div class="summary-row"><div>County</div><div>{{ strtoupper($state['additional']['county'] ?? '-') }}</div></div>
                        <div class="summary-row"><div>State/Territory</div><div>{{ strtoupper($state['additional']['state'] ?? '-') }}</div></div>
                        <div class="summary-row"><div>Start date</div><div>{{ $startDate }}</div></div>
                        <div class="summary-row"><div>Physical Location</div><div>{{ $physicalAddr ?: '-' }}</div></div>
                        <div class="summary-row"><div>Phone Number</div><div>{{ $state['addresses']['phone'] ?: '-' }}</div></div>
                        <div class="summary-row"><div>Name</div><div>{{ strtoupper($legalName) }}</div></div>
                        <div class="summary-row"><div>SSN/ITIN</div><div>{{ $maskedSsn }}</div></div>
                        <div class="summary-row"><div>What your business/organization does</div><div>{{ strtoupper($state['additional']['business_activity'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Principal product/service</div><div>{{ strtoupper($state['additional']['principal_product'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Mailing address different from physical address</div><div>{{ strtoupper($state['addresses']['other_address'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Mailing address</div><div>{{ strtoupper(trim(implode(' ', array_filter([($state['addresses']['mailing_street'] ?? ''), ($state['addresses']['mailing_city'] ?? ''), ($state['addresses']['mailing_state'] ?? ''), ($state['addresses']['mailing_zip'] ?? '')])) ?: '-')) }}</div></div>
                        <div class="summary-row"><div>Owns a 55,000 pounds or greater highway motor vehicle</div><div>{{ ($state['additional']['highway_vehicles'] ?? '') === 'yes' ? 'YES' : (($state['additional']['highway_vehicles'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Involves gambling/wagering</div><div>{{ ($state['additional']['gambling'] ?? '') === 'yes' ? 'YES' : (($state['additional']['gambling'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Involves alcohol, tobacco, or firearms</div><div>{{ ($state['additional']['atf'] ?? '') === 'yes' ? 'YES' : (($state['additional']['atf'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Files Form 720 (Quarterly Federal Excise Tax Return)</div><div>{{ ($state['additional']['form_720'] ?? '') === 'yes' ? 'YES' : (($state['additional']['form_720'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Has employees who receive Forms W-2</div><div>{{ ($state['additional']['employees'] ?? '') === 'yes' ? 'YES' : (($state['additional']['employees'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Expected employees (12 months)</div><div>{{ strtoupper($state['additional']['employee_count'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>First wage date</div><div>{{ strtoupper($state['additional']['first_wage_date'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Reason for Applying</div><div>{{ strtoupper(str_replace('_', ' ', $state['legal_structure']['reason'] ?: '-')) }}</div></div>
                    </div>

                    <div class="help-text">Click "Submit EIN Request" to send your request and receive your EIN. Once you submit, please wait while your application is being processed.</div>
                @endif

                @if($step < 6)
                    <div class="actions">
                        @if($step > 1)
                            <button type="submit" class="irs-button inverted" name="_action" value="back" id="anchor-ui-0" aria-label="Back" data-testid="btn-back">Back</button>
                        @endif
                        @if($step === 5)
                            <button type="submit" class="irs-button" name="_action" value="continue" id="anchor-ui-0" aria-label="Submit EIN Request" data-testid="btn-continue">Submit EIN Request</button>
                        @else
                            <button type="submit" class="irs-button" name="_action" value="continue" id="anchor-ui-0" aria-label="Continue" data-testid="btn-continue">Continue</button>
                        @endif
                        <br><br>
                        <a href="#" aria-label="Cancel link, click enter to go to Apply for EIN Page" class="link link--blue link--no-padding">Cancel</a>
                    </div>
                @endif
            </form>
            </div>

            @if($step === 6)
                @php
                    $legalName = trim(($state['identity']['first_name'] ?? '').' '.($state['identity']['last_name'] ?? '')) ?: 'TEST ENTITY';
                    $physicalAddr = trim(implode(' ', array_filter([
                        strtoupper($state['addresses']['street'] ?? ''),
                        strtoupper($state['addresses']['city'] ?? ''),
                        strtoupper($state['addresses']['state'] ?? ''),
                        ($state['addresses']['zip'] ?? ''),
                    ])));
                    $maskedSsn = $state['identity']['ssn'] ? 'XXX-XX-'.substr(preg_replace('/\D/', '', $state['identity']['ssn']), -4) : '-';
                    $tradeName = $state['additional']['dba_name'] ?: '-';
                    $startDate = trim(($state['additional']['start_month'] ?? '').' '.($state['additional']['start_year'] ?? '')) ?: '-';
                @endphp
                <div class="alert">
                    <h4>Congratulations! Your EIN has been successfully assigned.</h4>
                    <ul><li>Save and/or print this page and the confirmation letter below for your permanent records.</li></ul>
                </div>

                <div class="actions" style="margin-top:10px;">
                    <a href="#" onclick="window.print(); return false;" class="irs-button inverted" id="anchor-ui-0" role="button" aria-label="Print Page">Print Page</a>
                    <a href="#" class="link link--blue link--no-padding" style="margin-left:12px;">Help with saving and printing your letter</a>
                </div>

                <h3>Your EIN</h3>
                <h3 style="font-size:24px; margin-top:8px;">Your EIN Details</h3>
                <div class="summary-card">
                    <div class="summary-row"><div>EIN assigned</div><div><b>{{ $state['assignment']['ein'] }}</b></div></div>
                    <div class="summary-row"><div>Legal name</div><div><b>{{ strtoupper($legalName) }}</b></div></div>
                    <div class="summary-row"><div>Name control</div><div>{{ strtoupper(substr(($state['identity']['last_name'] ?? 'TEST'), 0, 4)) }}</div></div>
                    <div class="summary-row"><div>Confirmation letter</div><div><span>This confirmation letter is your official IRS notice and contains important information regarding your EIN:</span><br>
                        <a href="{{ $downloadUrl }}" class="irs-button" role="button" id="anchor-ui-0" aria-label="Download EIN confirmation Letter [PDF]">Download EIN confirmation Letter [PDF]</a>
                    </div></div>
                </div>

                <h3>Summary of your information</h3>
                <div class="summary-card">
                    <div class="summary-row"><div>Organization Type</div><div>{{ strtoupper(str_replace('_', ' ', $state['legal_structure']['type'] ?: '-')) }}</div></div>
                    <div class="summary-row"><div>Legal name</div><div>{{ strtoupper($legalName) }}</div></div>
                    <div class="summary-row"><div>Trade name/doing business as</div><div>{{ strtoupper($tradeName) }}</div></div>
                    <div class="summary-row"><div>County</div><div>{{ strtoupper($state['additional']['county'] ?? '-') }}</div></div>
                    <div class="summary-row"><div>State/Territory</div><div>{{ strtoupper($state['additional']['state'] ?? '-') }}</div></div>
                    <div class="summary-row"><div>Start date</div><div>{{ $startDate }}</div></div>
                    <div class="summary-row"><div>Physical Location</div><div>{{ $physicalAddr ?: '-' }}</div></div>
                    <div class="summary-row"><div>Phone Number</div><div>{{ $state['addresses']['phone'] ?: '-' }}</div></div>
                    <div class="summary-row"><div>Name</div><div>{{ strtoupper($legalName) }}</div></div>
                    <div class="summary-row"><div>SSN/ITIN</div><div>{{ $maskedSsn }}</div></div>
                    <div class="summary-row"><div>What your business/organization does</div><div>{{ strtoupper($state['additional']['business_activity'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Principal product/service</div><div>{{ strtoupper($state['additional']['principal_product'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Mailing address different from physical address</div><div>{{ strtoupper($state['addresses']['other_address'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Mailing address</div><div>{{ strtoupper(trim(implode(' ', array_filter([($state['addresses']['mailing_street'] ?? ''), ($state['addresses']['mailing_city'] ?? ''), ($state['addresses']['mailing_state'] ?? ''), ($state['addresses']['mailing_zip'] ?? '')])) ?: '-')) }}</div></div>
                        <div class="summary-row"><div>Owns a 55,000 pounds or greater highway motor vehicle</div><div>{{ ($state['additional']['highway_vehicles'] ?? '') === 'yes' ? 'YES' : (($state['additional']['highway_vehicles'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                    <div class="summary-row"><div>Involves gambling/wagering</div><div>{{ ($state['additional']['gambling'] ?? '') === 'yes' ? 'YES' : (($state['additional']['gambling'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                    <div class="summary-row"><div>Involves alcohol, tobacco, or firearms</div><div>{{ ($state['additional']['atf'] ?? '') === 'yes' ? 'YES' : (($state['additional']['atf'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                    <div class="summary-row"><div>Files Form 720 (Quarterly Federal Excise Tax Return)</div><div>{{ ($state['additional']['form_720'] ?? '') === 'yes' ? 'YES' : (($state['additional']['form_720'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Has employees who receive Forms W-2</div><div>{{ ($state['additional']['employees'] ?? '') === 'yes' ? 'YES' : (($state['additional']['employees'] ?? '') === 'no' ? 'NO' : '-') }}</div></div>
                        <div class="summary-row"><div>Expected employees (12 months)</div><div>{{ strtoupper($state['additional']['employee_count'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>First wage date</div><div>{{ strtoupper($state['additional']['first_wage_date'] ?: '-') }}</div></div>
                        <div class="summary-row"><div>Reason for Applying</div><div>{{ strtoupper(str_replace('_', ' ', $state['legal_structure']['reason'] ?: '-')) }}</div></div>
                    <div class="summary-row"><div>Issued at</div><div>{{ $state['assignment']['issued_at'] }}</div></div>
                </div>

                <div class="actions">
                    <a href="#" onclick="window.print(); return false;" class="irs-button inverted" role="button" id="anchor-ui-0" aria-label="Print Page">Print Page</a>
                    <form method="post" action="{{ $formAction }}" style="display:inline-block; margin-left: 8px;">
                        @csrf
                        <button type="submit" class="irs-button inverted" name="_action" value="back" aria-label="Back">Back</button>
                    </form>
                </div>
            @endif

            <form method="post" action="{{ $resetUrl }}" style="margin-top: 10px;">
                @csrf
                <button type="submit" class="irs-button inverted">Reset Sandbox</button>
            </form>

            <footer class="footer" role="contentinfo">
                <a href="#">Privacy Policy</a> | <a href="#">Accessibility</a>
            </footer>
        </div>
    </main>

    <script>
        (() => {
            const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
            const loadingMask = document.getElementById('loading-mask');
            const loadingText = document.getElementById('loading-text');
            const formShell = document.getElementById('form-shell');
            const form = document.getElementById('step-form');
            const step = Number(formShell?.dataset.step || '0');
            const bootDelay = Number(formShell?.dataset.bootDelay || '800');
            const submitDelay = Number(formShell?.dataset.submitDelay || '900');

            const showLoading = (text) => {
                if (loadingText && text) loadingText.textContent = text;
                if (loadingMask) {
                    loadingMask.classList.add('is-visible');
                    loadingMask.setAttribute('aria-hidden', 'false');
                }
                if (formShell) formShell.classList.add('is-pending');
            };

            const hideLoading = () => {
                if (loadingMask) {
                    loadingMask.classList.remove('is-visible');
                    loadingMask.setAttribute('aria-hidden', 'true');
                }
                if (formShell) formShell.classList.remove('is-pending');
            };

            const toggleButtons = (disabled) => {
                document.querySelectorAll('button[type="submit"], .irs-button[role="button"]').forEach((node) => {
                    if (node.tagName === 'BUTTON') node.disabled = disabled;
                    if (disabled) node.setAttribute('aria-disabled', 'true');
                    else node.removeAttribute('aria-disabled');
                });
            };

            const delayedToggle = async (target, visible, text) => {
                if (!target) return;
                showLoading(text);
                await wait(visible ? 380 : 220);
                target.hidden = !visible;
                hideLoading();
            };

            toggleButtons(true);
            showLoading(step === 6 ? 'Loading EIN assignment...' : 'Loading form...');
            wait(bootDelay).then(() => {
                formShell?.classList.add('is-ready');
                formShell?.classList.remove('is-delayed');
                hideLoading();
                toggleButtons(false);
            });

            const legalExtra = document.getElementById('legal-extra');
            if (legalExtra) {
                document.querySelectorAll('input[name="legalStructureInput"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(legalExtra, el.value === 'SOLE_PROPRIETOR', 'Loading legal structure details...');
                    });
                });
            }

            const mailing = document.getElementById('mailing-block');
            if (mailing) {
                document.querySelectorAll('input[name="otherAddress"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(mailing, el.value === 'yes', 'Loading mailing address section...');
                    });
                });
            }

            const roleOther = document.getElementById('role-other-block');
            if (roleOther) {
                document.querySelectorAll('input[name="entityRoleRadioInput"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(roleOther, el.value === 'no', 'Loading designee section...');
                    });
                });
            }

            const wholesaleBlock = document.getElementById('wholesale-block');
            if (wholesaleBlock) {
                document.querySelectorAll('input[name="entityBusinessCategoryInput"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(wholesaleBlock, el.value === 'WHOLESALE', 'Loading wholesale details...');
                    });
                });
            }

            const otherBusinessBlock = document.getElementById('other-business-block');
            if (otherBusinessBlock) {
                document.querySelectorAll('input[name="entityBusinessCategoryInput"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(otherBusinessBlock, el.value === 'OTHER', 'Loading business activity details...');
                    });
                });
            }

            const employeeBlock = document.getElementById('employee-block');
            if (employeeBlock) {
                document.querySelectorAll('input[name="hasEmployeesInput"]').forEach((el) => {
                    el.addEventListener('change', async () => {
                        await delayedToggle(employeeBlock, el.value === 'yes', 'Loading employee questions...');
                    });
                });
            }

            form?.addEventListener('submit', async (event) => {
                if (form.dataset.delayedSubmit === '1') {
                    return;
                }
                const submitter = event.submitter;
                const action = submitter?.getAttribute('aria-label') || submitter?.textContent || 'Continue';
                event.preventDefault();
                toggleButtons(true);
                showLoading(action.includes('Submit') ? 'Submitting EIN request...' : 'Processing step...');
                await wait(submitDelay);
                form.dataset.delayedSubmit = '1';
                if (typeof form.requestSubmit === 'function' && submitter instanceof HTMLElement) {
                    form.requestSubmit(submitter);
                } else {
                    form.submit();
                }
            });

        })();
    </script>
</body>
</html>
