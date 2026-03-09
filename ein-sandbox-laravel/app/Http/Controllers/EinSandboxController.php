<?php

namespace App\Http\Controllers;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Validator;
use Illuminate\View\View;

class EinSandboxController extends Controller
{
    private const STEPS = [
        1 => 'legal_structure',
        2 => 'identity',
        3 => 'addresses',
        4 => 'additional',
        5 => 'review',
        6 => 'assignment',
    ];

    private const IRS_PATHS = [
        1 => 'legalStructure',
        2 => 'identityOfEntities',
        3 => 'addAddresses',
        4 => 'additionalDetails',
        5 => 'reviewAndSubmit',
        6 => 'einAssignment',
    ];

    public function start(Request $request): RedirectResponse
    {
        if (!$request->session()->has('ein_sandbox')) {
            $request->session()->put('ein_sandbox', $this->defaultState());
        }

        return $this->redirectToCanonicalStep(1);
    }

    public function reset(Request $request): RedirectResponse
    {
        $request->session()->forget('ein_sandbox');

        return redirect()->route('ein.start');
    }

    public function show(Request $request, int $step): View|RedirectResponse
    {
        return $this->renderStep($request, $step);
    }

    public function showCanonical(Request $request, string $slug): View|RedirectResponse
    {
        $step = $this->stepFromSlug($slug);
        if ($step === null) {
            return $this->redirectToCanonicalStep(1);
        }

        return $this->renderStep($request, $step);
    }

    private function renderStep(Request $request, int $step): View|RedirectResponse
    {
        if (!isset(self::STEPS[$step])) {
            return $this->redirectToCanonicalStep(1);
        }

        $state = $request->session()->get('ein_sandbox', $this->defaultState());
        $request->session()->put('ein_sandbox', $state);

        if ($step === 6) {
            $state = $this->ensureAssignment($state);
            $request->session()->put('ein_sandbox', $state);
        }

        $step4Phase = 'details';
        if ($step === 4) {
            $phase = (string) $request->query('phase', 'details');
            $step4Phase = in_array($phase, ['details', 'activity'], true) ? $phase : 'details';
        }

        return view('ein_sandbox', [
            'step' => $step,
            'stepKey' => self::STEPS[$step],
            'state' => $state,
            'steps' => self::STEPS,
            'step4Phase' => $step4Phase,
            'canonicalPath' => $this->canonicalPathForStep($step, $step4Phase),
            'formAction' => $this->canonicalPathForStep($step, $step4Phase),
            'downloadUrl' => route('ein.irs.download.confirmation'),
            'resetUrl' => route('ein.reset'),
        ]);
    }

    public function submit(Request $request, int $step): RedirectResponse
    {
        return $this->handleSubmit($request, $step);
    }

    public function submitCanonical(Request $request, string $slug): RedirectResponse
    {
        $step = $this->stepFromSlug($slug);
        if ($step === null) {
            return $this->redirectToCanonicalStep(1);
        }

        return $this->handleSubmit($request, $step);
    }

    private function handleSubmit(Request $request, int $step): RedirectResponse
    {
        if (!isset(self::STEPS[$step])) {
            return $this->redirectToCanonicalStep(1);
        }

        $state = $request->session()->get('ein_sandbox', $this->defaultState());

        switch ($step) {
            case 1:
                $legalType = (string) $request->input('legalStructureInput', $request->input('legal_structure.type', ''));
                $legalSubType = (string) $request->input('solePropStructureInput', $request->input('legal_structure.sub_type', ''));
                $legalReason = (string) $request->input('reasonForApplyingInputControl', $request->input('legal_structure.reason', ''));
                $state['legal_structure'] = [
                    'type' => $legalType,
                    'sub_type' => $legalSubType,
                    'reason' => $legalReason,
                ];
                break;
            case 2:
                $state['identity'] = [
                    'ssn' => (string) $request->input('responsibleSsn', $request->input('identity.ssn', '')),
                    'first_name' => (string) $request->input('responsibleFirstName', $request->input('identity.first_name', '')),
                    'middle_name' => (string) $request->input('responsibleMiddleName', $request->input('identity.middle_name', '')),
                    'last_name' => (string) $request->input('responsibleLastName', $request->input('identity.last_name', '')),
                    'suffix' => (string) $request->input('responsibleSuffix', $request->input('identity.suffix', '')),
                    'role' => (string) $request->input('entityRoleRadioInput', $request->input('identity.role', '')),
                    'third_party_name' => (string) $request->input('thirdPartyNameInput', $request->input('identity.third_party_name', '')),
                    'third_party_phone' => (string) $request->input('thirdPartyPhoneInput', $request->input('identity.third_party_phone', '')),
                ];
                break;
            case 3:
                $state['addresses'] = [
                    'street' => (string) $request->input('physicalStreet', $request->input('addresses.street', '')),
                    'city' => (string) $request->input('physicalCity', $request->input('addresses.city', '')),
                    'state' => (string) $request->input('physicalState', $request->input('addresses.state', '')),
                    'zip' => (string) $request->input('physicalZipCode', $request->input('addresses.zip', '')),
                    'phone' => (string) $request->input('thePhone', $request->input('addresses.phone', '')),
                    'other_address' => (string) $request->input('otherAddress', $request->input('addresses.other_address', '')),
                    'mailing_street' => (string) $request->input('mailingStreetInput', $request->input('addresses.mailing_street', '')),
                    'mailing_city' => (string) $request->input('mailingCityInput', $request->input('addresses.mailing_city', '')),
                    'mailing_state' => (string) $request->input('mailingStateInput', $request->input('addresses.mailing_state', '')),
                    'mailing_zip' => (string) $request->input('mailingZipInput', $request->input('addresses.mailing_zip', '')),
                ];
                break;
            case 4:
                $phase = (string) $request->input('_step4_phase', (string) $request->query('phase', 'details'));
                $phase = in_array($phase, ['details', 'activity'], true) ? $phase : 'details';
                $existingAdditional = is_array($state['additional'] ?? null) ? $state['additional'] : [];

                if ($phase === 'details') {
                    $state['additional'] = array_merge($existingAdditional, [
                        'dba_name' => (string) $request->input('dbaNameInput', $request->input('additional.dba_name', '')),
                        'county' => (string) $request->input('countyInput', $request->input('additional.county', '')),
                        'state' => (string) $request->input('stateInput', $request->input('additional.state', '')),
                        'start_month' => (string) $request->input('startDateMonthInput', $request->input('additional.start_month', '')),
                        'start_year' => (string) $request->input('startDateYearInput', $request->input('additional.start_year', '')),
                        'highway_vehicles' => (string) $request->input('highwayVehiclesInput', $request->input('additional.highway_vehicles', '')),
                        'gambling' => (string) $request->input('gamblingWagerInput', $request->input('additional.gambling', '')),
                        'form_720' => (string) $request->input('fileForm720Input', $request->input('additional.form_720', '')),
                        'atf' => (string) $request->input('atfInput', $request->input('additional.atf', '')),
                        'employees' => (string) $request->input('hasEmployeesInput', $request->input('additional.employees', '')),
                        'employee_count' => (string) $request->input('employeeCountInput', $request->input('additional.employee_count', '')),
                        'first_wage_date' => (string) $request->input('firstWageDateInput', $request->input('additional.first_wage_date', '')),
                    ]);
                } else {
                    $activity = strtoupper((string) $request->input('entityBusinessCategoryInput', $request->input('additional.business_activity', '')));
                    $ownsGoods = (string) $request->input('wholeSaleInput', $request->input('additional.wholesale_owns_goods', ''));
                    $otherInput = (string) $request->input('otherInput', $request->input('additional.other_input', ''));
                    $principalProduct = (string) $request->input('wholesaleSecondTextInput', $request->input('additional.principal_product', ''));
                    $state['additional'] = array_merge($existingAdditional, [
                        'business_activity' => $activity,
                        'principal_product' => $activity === 'OTHER' ? $otherInput : $principalProduct,
                        'other_input' => $activity === 'OTHER' ? $otherInput : '',
                        'wholesale_owns_goods' => $activity === 'WHOLESALE' ? $ownsGoods : '',
                    ]);
                }
                break;
            case 5:
                $state['review'] = [
                    'confirmation_letter_delivery' => (string) $request->input('confirmationLetterRadioInput', $request->input('review.confirmation_letter_delivery', '')),
                    'agreed' => $request->boolean('review.agreed', true),
                ];
                $state = $this->ensureAssignment($state);
                break;
            default:
                break;
        }

        $validator = Validator::make(
            $request->all(),
            $this->rulesForStep($step, $request),
            $this->validationMessages()
        );
        if ($validator->fails()) {
            $request->session()->put('ein_sandbox', $state);
            return redirect()->back()
                ->withErrors($validator)
                ->withInput();
        }

        $request->session()->put('ein_sandbox', $state);

        if ($step === 4) {
            $phase = (string) $request->input('_step4_phase', (string) $request->query('phase', 'details'));
            $phase = in_array($phase, ['details', 'activity'], true) ? $phase : 'details';

            if ($request->input('_action') === 'back') {
                if ($phase === 'activity') {
                    return $this->redirectToCanonicalStep(4, 'details');
                }
                return $this->redirectToCanonicalStep(3);
            }

            if ($phase === 'details') {
                return $this->redirectToCanonicalStep(4, 'activity');
            }

            return $this->redirectToCanonicalStep(5);
        }

        if ($request->input('_action') === 'back') {
            if ($step === 5) {
                return $this->redirectToCanonicalStep(4, 'activity');
            }
            return $this->redirectToCanonicalStep(max(1, $step - 1));
        }

        if ($step >= 6) {
            return $this->redirectToCanonicalStep(6);
        }

        return $this->redirectToCanonicalStep($step + 1);
    }

    private function rulesForStep(int $step, Request $request): array
    {
        $nameRegex = "/^[A-Za-z][A-Za-z\\- '&]*$/";
        $addressRegex = "/^[A-Za-z0-9#\\.\\-\\/ ]+$/";
        $cityRegex = "/^[A-Za-z][A-Za-z\\-\\.' ]*$/";

        return match ($step) {
            1 => [
                'legalStructureInput' => ['required', 'in:SOLE_PROPRIETOR,PARTNERSHIP,CORPORATION,LLC,ESTATE,ALL_OTHERS_TRUST,OTHER_NON_PROFIT'],
                'solePropStructureInput' => ['required_if:legalStructureInput,SOLE_PROPRIETOR', 'in:SOLE_PROPRIETOR,HOUSEHOLD_EMPLOYER'],
                'reasonForApplyingInputControl' => ['required_if:legalStructureInput,SOLE_PROPRIETOR', 'in:NEW_BUSINESS,HIRED_EMPLOYEES,BANKING_NEEDS,CHANGING_LEGAL_STRUCTURE,PURCHASED_BUSINESS'],
            ],
            2 => [
                'responsibleSsn' => ['required', 'regex:/^\\d{9}$/'],
                'responsibleFirstName' => ['required', 'max:35', "regex:{$nameRegex}"],
                'responsibleMiddleName' => ['nullable', 'max:35', "regex:{$nameRegex}"],
                'responsibleLastName' => ['required', 'max:35', "regex:{$nameRegex}"],
                'responsibleSuffix' => ['nullable', 'in:,JR,SR,II,III'],
                'entityRoleRadioInput' => ['required', 'in:yes,no'],
                'thirdPartyNameInput' => ['required_if:entityRoleRadioInput,no', 'max:60'],
                'thirdPartyPhoneInput' => ['required_if:entityRoleRadioInput,no', 'regex:/^\\d{10}$/'],
            ],
            3 => [
                'physicalStreet' => ['required', 'max:60', "regex:{$addressRegex}", 'not_regex:/P\\.?\\s*O\\.?\\s*BOX/i'],
                'physicalCity' => ['required', 'max:40', "regex:{$cityRegex}"],
                'physicalState' => ['required', 'size:2'],
                'physicalZipCode' => ['required', 'regex:/^\\d{5}$/'],
                'thePhone' => ['required', 'regex:/^\\d{10}$/'],
                'otherAddress' => ['required', 'in:yes,no'],
                'mailingStreetInput' => ['required_if:otherAddress,yes', 'max:60', "regex:{$addressRegex}"],
                'mailingCityInput' => ['required_if:otherAddress,yes', 'max:40', "regex:{$cityRegex}"],
                'mailingStateInput' => ['required_if:otherAddress,yes', 'size:2'],
                'mailingZipInput' => ['required_if:otherAddress,yes', 'regex:/^\\d{5}$/'],
            ],
            4 => ((string) $request->input('_step4_phase', (string) $request->query('phase', 'details'))) === 'activity'
                ? [
                    'entityBusinessCategoryInput' => ['required'],
                    'wholeSaleInput' => ['required_if:entityBusinessCategoryInput,WHOLESALE', 'in:yes,no'],
                    'wholesaleSecondTextInput' => ['required_if:entityBusinessCategoryInput,WHOLESALE', 'max:80'],
                    'otherInput' => ['required_if:entityBusinessCategoryInput,OTHER', 'max:120'],
                ]
                : [
                    'countyInput' => ['required', 'max:40', "regex:{$cityRegex}"],
                    'stateInput' => ['required', 'size:2'],
                    'startDateMonthInput' => ['required', 'in:JANUARY,FEBRUARY,MARCH,APRIL,MAY,JUNE,JULY,AUGUST,SEPTEMBER,OCTOBER,NOVEMBER,DECEMBER'],
                    'startDateYearInput' => ['required', 'regex:/^(19|20)\\d{2}$/'],
                    'highwayVehiclesInput' => ['required', 'in:yes,no'],
                    'gamblingWagerInput' => ['required', 'in:yes,no'],
                    'fileForm720Input' => ['required', 'in:yes,no'],
                    'atfInput' => ['required', 'in:yes,no'],
                    'hasEmployeesInput' => ['required', 'in:yes,no'],
                    'employeeCountInput' => ['required_if:hasEmployeesInput,yes', 'regex:/^\\d{1,4}$/'],
                    'firstWageDateInput' => ['required_if:hasEmployeesInput,yes', 'regex:/^(0[1-9]|1[0-2])\\/(19|20)\\d{2}$/'],
                ],
            5 => [
                'confirmationLetterRadioInput' => ['required', 'in:DIGITAL,MAIL'],
            ],
            default => [],
        };
    }

    private function validationMessages(): array
    {
        return [
            'required' => 'This field is required.',
            'required_if' => 'This field is required.',
            'regex' => 'Enter a valid value.',
            'in' => 'Choose one of the available options.',
            'not_regex' => 'Enter a physical U.S. street address, not a P.O. box.',
            'startDateYearInput.regex' => 'Enter a valid 4-digit year.',
            'firstWageDateInput.regex' => 'Enter the first wage date as MM/YYYY.',
            'responsibleSsn.regex' => 'Enter exactly 9 digits for SSN/ITIN.',
            'thirdPartyPhoneInput.regex' => 'Enter exactly 10 digits for the phone number.',
            'physicalZipCode.regex' => 'Enter a valid 5-digit ZIP code.',
            'mailingZipInput.regex' => 'Enter a valid 5-digit ZIP code.',
            'thePhone.regex' => 'Enter exactly 10 digits for the phone number.',
        ];
    }

    public function downloadConfirmation(Request $request): Response
    {
        $state = $request->session()->get('ein_sandbox', $this->defaultState());
        $state = $this->ensureAssignment($state);
        $request->session()->put('ein_sandbox', $state);

        $ein = $state['assignment']['ein'];
        $name = trim(($state['identity']['first_name'] ?? '').' '.($state['identity']['last_name'] ?? ''));
        if ($name === '') {
            $name = 'TEST ENTITY';
        }
        $orgType = $this->normalizeLabel((string) ($state['legal_structure']['type'] ?: 'SOLE_PROPRIETOR'));
        $reason = $this->normalizeLabel((string) ($state['legal_structure']['reason'] ?: 'STARTED_A_NEW_BUSINESS'));
        $last4 = substr(preg_replace('/\D/', '', (string) ($state['identity']['ssn'] ?? '')), -4);
        $maskedSsn = $last4 !== '' ? 'XXX-XX-'.$last4 : 'XXX-XX-0000';

        $summaryAddress = trim(implode(', ', array_filter([
            $state['addresses']['street'] ?? '',
            $state['addresses']['city'] ?? '',
            $state['addresses']['state'] ?? '',
            $state['addresses']['zip'] ?? '',
        ])));
        $summaryAddressUpper = strtoupper($summaryAddress !== '' ? $summaryAddress : 'N/A');
        $phone = $this->formatPhone((string) ($state['addresses']['phone'] ?? ''));
        $startDate = trim(($state['additional']['start_month'] ?? '').' '.($state['additional']['start_year'] ?? ''));
        $physicalLocation = strtoupper(trim(implode(' ', array_filter([
            (string) ($state['addresses']['street'] ?? ''),
            (string) ($state['addresses']['city'] ?? ''),
            (string) ($state['addresses']['state'] ?? ''),
            (string) ($state['addresses']['zip'] ?? ''),
        ]))));
        $responsibleName = strtoupper(trim(implode(' ', array_filter([
            (string) ($state['identity']['first_name'] ?? ''),
            (string) ($state['identity']['middle_name'] ?? ''),
            (string) ($state['identity']['last_name'] ?? ''),
        ]))));
        $issuedAt = $state['assignment']['issued_at'] ?: now()->format('Y-m-d H:i:s');

        $pdf = null;
        $templatePdfPath = storage_path('app/templates/CP_575_G_original.pdf');
        $preferOriginalTemplate = (bool) env('EIN_USE_ORIGINAL_PDF_TEMPLATE', false);

        if ($preferOriginalTemplate && File::exists($templatePdfPath)) {
            // Closest match to IRS look: serve original captured CP 575 G template directly.
            $pdf = File::get($templatePdfPath);
        } elseif (class_exists('\\Dompdf\\Dompdf')) {
            $html = view('pdf.confirmation_letter', [
                'ein' => $ein,
                'legalName' => strtoupper($name),
                'nameControl' => strtoupper(substr(($state['identity']['last_name'] ?? 'TEST'), 0, 4)),
                'issuedAt' => $issuedAt,
                'address' => $summaryAddressUpper,
                'orgType' => $orgType,
                'reasonForApplying' => $reason,
                'tradeName' => strtoupper((string) ($state['additional']['dba_name'] ?? '')),
                'county' => strtoupper((string) ($state['additional']['county'] ?? '')),
                'stateCode' => strtoupper((string) ($state['additional']['state'] ?? '')),
                'startDate' => $startDate,
                'phone' => $phone,
                'maskedSsn' => $maskedSsn,
                'businessActivity' => $this->normalizeLabel((string) ($state['additional']['business_activity'] ?? '')),
                'principalProduct' => strtoupper((string) ($state['additional']['principal_product'] ?? '')),
                'highway' => (($state['additional']['highway_vehicles'] ?? '') === 'yes') ? 'YES' : 'NO',
                'gambling' => (($state['additional']['gambling'] ?? '') === 'yes') ? 'YES' : 'NO',
                'atf' => (($state['additional']['atf'] ?? '') === 'yes') ? 'YES' : 'NO',
                'form720' => (($state['additional']['form_720'] ?? '') === 'yes') ? 'YES' : 'NO',
                'employees' => (($state['additional']['employees'] ?? '') === 'yes') ? 'YES' : 'NO',
                'physicalLocation' => $physicalLocation,
                'responsibleName' => $responsibleName,
                'generatedAt' => now()->format('m/d/Y, H:i \\P\\M'),
            ])->render();

            $options = new \Dompdf\Options();
            $options->set('isHtml5ParserEnabled', true);
            $options->set('isRemoteEnabled', false);

            $dompdf = new \Dompdf\Dompdf($options);
            $dompdf->loadHtml($html);
            $dompdf->setPaper('letter');
            $dompdf->render();
            $pdf = $dompdf->output();
        } else {
            $pdf = $this->buildSimplePdf([
                'Internal Revenue Service',
                'EIN Confirmation Letter (Local Sandbox)',
                '',
                'EIN assigned: '.$ein,
                'Legal name: '.strtoupper($name),
                'Organization Type: '.$orgType,
                'Reason for Applying: '.$reason,
                'Name control: '.strtoupper(substr(($state['identity']['last_name'] ?? 'TEST'), 0, 4)),
                'Business address: '.$summaryAddressUpper,
                'Issue timestamp: '.$issuedAt,
                '',
                'This letter was generated by the local EIN automation sandbox.',
            ]);
        }

        $einSlug = preg_replace('/[^0-9]/', '', $ein) ?: 'NOEIN';
        $nameSlug = strtoupper(substr(preg_replace('/[^A-Z0-9]+/i', '_', $name), 0, 32));
        $downloadName = 'CP_575_G_'.$einSlug.'_'.($nameSlug ?: 'ENTITY').'.pdf';
        return response($pdf, 200, [
            'Content-Type' => 'application/pdf',
            'Content-Disposition' => "attachment; filename=\"{$downloadName}\"",
        ]);
    }

    private function normalizeLabel(string $value): string
    {
        $v = trim(str_replace('_', ' ', strtoupper($value)));
        return preg_replace('/\s+/', ' ', $v) ?: '';
    }

    private function formatPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) === 10) {
            return substr($digits, 0, 3).'-'.substr($digits, 3, 3).'-'.substr($digits, 6, 4);
        }
        return $phone;
    }

    private function ensureAssignment(array $state): array
    {
        if (!empty($state['assignment']['ein'])) {
            return $state;
        }

        $seed = substr((string) crc32(json_encode($state)), 0, 7);
        $seed = str_pad($seed, 7, '0', STR_PAD_LEFT);
        $state['assignment'] = [
            'ein' => substr($seed, 0, 2).'-'.substr($seed, 2, 7),
            'issued_at' => now()->format('Y-m-d H:i:s'),
        ];

        return $state;
    }

    private function defaultState(): array
    {
        return [
            'legal_structure' => ['type' => '', 'sub_type' => '', 'reason' => ''],
            'identity' => [
                'ssn' => '',
                'first_name' => '',
                'middle_name' => '',
                'last_name' => '',
                'suffix' => '',
                'role' => '',
                'third_party_name' => '',
                'third_party_phone' => '',
            ],
            'addresses' => [
                'street' => '', 'city' => '', 'state' => '', 'zip' => '', 'phone' => '',
                'other_address' => '', 'mailing_street' => '', 'mailing_city' => '', 'mailing_state' => '', 'mailing_zip' => '',
            ],
            'additional' => [
                'dba_name' => '', 'county' => '', 'state' => '', 'start_month' => '', 'start_year' => '',
                'business_activity' => '',
                'principal_product' => '',
                'other_input' => '',
                'wholesale_owns_goods' => '',
                'highway_vehicles' => '',
                'gambling' => '',
                'form_720' => '',
                'atf' => '',
                'employees' => '',
                'employee_count' => '',
                'first_wage_date' => '',
            ],
            'review' => ['confirmation_letter_delivery' => '', 'agreed' => false],
            'assignment' => ['ein' => '', 'issued_at' => ''],
        ];
    }

    private function stepFromSlug(string $slug): ?int
    {
        $lookup = array_flip(self::IRS_PATHS);
        return $lookup[$slug] ?? null;
    }

    private function canonicalPathForStep(int $step, ?string $phase = null): string
    {
        $slug = self::IRS_PATHS[$step] ?? self::IRS_PATHS[1];
        $params = ['slug' => $slug];
        if ($step === 4 && $phase === 'activity') {
            $params['phase'] = 'activity';
        }
        return route('ein.irs.step', $params);
    }

    private function redirectToCanonicalStep(int $step, ?string $phase = null): RedirectResponse
    {
        return redirect()->to($this->canonicalPathForStep($step, $phase));
    }

    private function buildSimplePdf(array $lines): string
    {
        $safeLines = array_map(
            static fn (string $line): string => str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $line),
            $lines
        );

        $content = "BT /F1 18 Tf 50 780 Td (".$safeLines[0].") Tj ET\n";
        $y = 750;
        foreach (array_slice($safeLines, 1) as $line) {
            $content .= "BT /F1 12 Tf 50 {$y} Td ({$line}) Tj ET\n";
            $y -= 22;
        }

        $len = strlen($content);
        $o1 = "%PDF-1.4\n";
        $o2 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
        $o3 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
        $o4 = "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n";
        $o5 = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
        $o6 = "5 0 obj\n<< /Length {$len} >>\nstream\n{$content}endstream\nendobj\n";

        $objects = [$o2, $o3, $o4, $o5, $o6];
        $pdf = $o1;
        $offsets = [0];
        foreach ($objects as $obj) {
            $offsets[] = strlen($pdf);
            $pdf .= $obj;
        }

        $xrefPos = strlen($pdf);
        $pdf .= "xref\n0 6\n";
        $pdf .= "0000000000 65535 f \n";
        for ($i = 1; $i <= 5; $i++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$i]);
        }
        $pdf .= "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n{$xrefPos}\n%%EOF";

        return $pdf;
    }
}
