// ===== Fingerprint Types & Default Profiles =====
// Single source of truth for browser fingerprint spoofing.

export interface FingerprintNavigator {
    userAgent: string
    platform: string
    hardwareConcurrency: number
    deviceMemory: number
    languages: string[]
    vendor: string
    maxTouchPoints: number
}

export interface FingerprintScreen {
    width: number
    height: number
    availWidth: number
    availHeight: number
    colorDepth: number
    pixelRatio: number
}

export interface FingerprintWebGL {
    vendor: string // e.g. "Google Inc. (NVIDIA)"
    renderer: string // e.g. "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060...)"
    unmaskedVendor: string
    unmaskedRenderer: string
}

export interface FingerprintProfile {
    id: string
    name: string
    os: 'windows' | 'macos' | 'linux'
    device: 'desktop' | 'laptop'
    navigator: FingerprintNavigator
    screen: FingerprintScreen
    webgl: FingerprintWebGL
    canvas: {
        noiseSeed: number // 0-255, used to add consistent micro-noise to canvas ops
    }
    audio: {
        noiseSeed: number // 0-255, consistent micro-noise for audio fingerprint
    }
    timezone: string // e.g. "America/New_York"
    locale: string // e.g. "en-US"
    fonts?: string[] // subset of fonts that appear installed
}

// ===== 20 Default Fingerprint Profiles =====
// Based on real device characteristics from top browser market share data.

export const DEFAULT_FINGERPRINTS: FingerprintProfile[] = [
    // --- Windows + Chrome ---
    {
        id: 'win-chrome-rtx3060',
        name: 'Windows 11 / Chrome / RTX 3060 (NY)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 12,
            deviceMemory: 16,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 2560,
            height: 1440,
            availWidth: 2560,
            availHeight: 1400,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3060/PCIe/SSE2'
        },
        canvas: { noiseSeed: 42 },
        audio: { noiseSeed: 17 },
        timezone: 'America/New_York',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-rx5700',
        name: 'Windows 10 / Chrome / RX 5700 XT (LA)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 16,
            deviceMemory: 32,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1920,
            height: 1080,
            availWidth: 1920,
            availHeight: 1040,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (AMD)',
            renderer:
                'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 5700 XT'
        },
        canvas: { noiseSeed: 91 },
        audio: { noiseSeed: 55 },
        timezone: 'America/Los_Angeles',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-uhd630',
        name: 'Windows 11 / Chrome / Intel UHD 630 (Chicago)',
        os: 'windows',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1920,
            height: 1080,
            availWidth: 1920,
            availHeight: 1040,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (Intel)',
            renderer:
                'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) UHD Graphics 630 (CFL GT2)'
        },
        canvas: { noiseSeed: 13 },
        audio: { noiseSeed: 77 },
        timezone: 'America/Chicago',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-gtx1660',
        name: 'Windows 10 / Chrome / GTX 1660 Super (London)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            languages: ['en-GB', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 2560,
            height: 1440,
            availWidth: 2560,
            availHeight: 1400,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce GTX 1660 SUPER/PCIe/SSE2'
        },
        canvas: { noiseSeed: 64 },
        audio: { noiseSeed: 33 },
        timezone: 'Europe/London',
        locale: 'en-GB'
    },
    {
        id: 'win-chrome-rtx4070',
        name: 'Windows 11 / Chrome / RTX 4070 (Seattle)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 16,
            deviceMemory: 32,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 3840,
            height: 2160,
            availWidth: 3840,
            availHeight: 2120,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 4070/PCIe/SSE2'
        },
        canvas: { noiseSeed: 128 },
        audio: { noiseSeed: 200 },
        timezone: 'America/Los_Angeles',
        locale: 'en-US'
    },
    // --- macOS + Chrome ---
    {
        id: 'mac-chrome-m1',
        name: 'macOS Ventura / Chrome / M1 Pro (San Francisco)',
        os: 'macos',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            hardwareConcurrency: 10,
            deviceMemory: 16,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1512,
            height: 982,
            availWidth: 1512,
            availHeight: 946,
            colorDepth: 30,
            pixelRatio: 2
        },
        webgl: {
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)',
            unmaskedVendor: 'Apple',
            unmaskedRenderer: 'Apple M1 Pro'
        },
        canvas: { noiseSeed: 188 },
        audio: { noiseSeed: 44 },
        timezone: 'America/Los_Angeles',
        locale: 'en-US'
    },
    {
        id: 'mac-chrome-m2',
        name: 'macOS Sonoma / Chrome / M2 (Austin)',
        os: 'macos',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            hardwareConcurrency: 8,
            deviceMemory: 8,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1440,
            height: 900,
            availWidth: 1440,
            availHeight: 864,
            colorDepth: 24,
            pixelRatio: 2
        },
        webgl: {
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)',
            unmaskedVendor: 'Apple',
            unmaskedRenderer: 'Apple M2'
        },
        canvas: { noiseSeed: 7 },
        audio: { noiseSeed: 161 },
        timezone: 'America/Chicago',
        locale: 'en-US'
    },
    {
        id: 'mac-chrome-intel-iris',
        name: 'macOS Monterey / Chrome / Intel Iris (Toronto)',
        os: 'macos',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            hardwareConcurrency: 4,
            deviceMemory: 8,
            languages: ['en-CA', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1280,
            height: 800,
            availWidth: 1280,
            availHeight: 768,
            colorDepth: 24,
            pixelRatio: 2
        },
        webgl: {
            vendor: 'Google Inc. (Intel Inc.)',
            renderer:
                'ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics OpenGL Engine, OpenGL 4.1)',
            unmaskedVendor: 'Intel Inc.',
            unmaskedRenderer: 'Intel(R) Iris(TM) Plus Graphics'
        },
        canvas: { noiseSeed: 99 },
        audio: { noiseSeed: 211 },
        timezone: 'America/Toronto',
        locale: 'en-CA'
    },
    // --- Windows + Firefox UA (rare but real) ---
    {
        id: 'win-firefox-rtx2080',
        name: 'Windows 10 / Chrome122 / RTX 2080 (Berlin)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 16,
            deviceMemory: 32,
            languages: ['de-DE', 'de', 'en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 3440,
            height: 1440,
            availWidth: 3440,
            availHeight: 1400,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce RTX 2080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 2080/PCIe/SSE2'
        },
        canvas: { noiseSeed: 172 },
        audio: { noiseSeed: 88 },
        timezone: 'Europe/Berlin',
        locale: 'de-DE'
    },
    {
        id: 'win-chrome-amd-vega',
        name: 'Windows 10 / Chrome / AMD Vega 56 (Sydney)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            languages: ['en-AU', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 2560,
            height: 1080,
            availWidth: 2560,
            availHeight: 1040,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (AMD)',
            renderer: 'ANGLE (AMD, AMD Radeon RX Vega 56 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX Vega 56'
        },
        canvas: { noiseSeed: 230 },
        audio: { noiseSeed: 5 },
        timezone: 'Australia/Sydney',
        locale: 'en-AU'
    },
    // --- Windows Low-End (very common, very safe) ---
    {
        id: 'win-chrome-uhd620-low',
        name: 'Windows 10 / Chrome / Intel UHD 620 Laptop (Texas)',
        os: 'windows',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 4,
            deviceMemory: 4,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1366,
            height: 768,
            availWidth: 1366,
            availHeight: 728,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (Intel)',
            renderer:
                'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) UHD Graphics 620 (KBL GT2)'
        },
        canvas: { noiseSeed: 56 },
        audio: { noiseSeed: 140 },
        timezone: 'America/Chicago',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-uhd-fhd-paris',
        name: 'Windows 11 / Chrome / Intel UHD FHD Laptop (Paris)',
        os: 'windows',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            languages: ['fr-FR', 'fr', 'en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1920,
            height: 1080,
            availWidth: 1920,
            availHeight: 1040,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (Intel)',
            renderer:
                'ANGLE (Intel, Intel(R) UHD Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) UHD Graphics (TGL GT2)'
        },
        canvas: { noiseSeed: 22 },
        audio: { noiseSeed: 195 },
        timezone: 'Europe/Paris',
        locale: 'fr-FR'
    },
    {
        id: 'win-chrome-rtx3080-tokyo',
        name: 'Windows 11 / Chrome / RTX 3080 (Tokyo)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 24,
            deviceMemory: 64,
            languages: ['ja-JP', 'ja', 'en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 3840,
            height: 2160,
            availWidth: 3840,
            availHeight: 2120,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3080/PCIe/SSE2'
        },
        canvas: { noiseSeed: 111 },
        audio: { noiseSeed: 67 },
        timezone: 'Asia/Tokyo',
        locale: 'ja-JP'
    },
    {
        id: 'mac-safari-m2-pro',
        name: 'macOS Sonoma / Chrome122 / M2 Pro (New York)',
        os: 'macos',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            hardwareConcurrency: 12,
            deviceMemory: 32,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1800,
            height: 1169,
            availWidth: 1800,
            availHeight: 1133,
            colorDepth: 24,
            pixelRatio: 2
        },
        webgl: {
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro, Unspecified Version)',
            unmaskedVendor: 'Apple',
            unmaskedRenderer: 'Apple M2 Pro'
        },
        canvas: { noiseSeed: 144 },
        audio: { noiseSeed: 252 },
        timezone: 'America/New_York',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-rx6600xt',
        name: 'Windows 10 / Chrome / RX 6600 XT (Amsterdam)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 16,
            deviceMemory: 32,
            languages: ['nl-NL', 'nl', 'en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 2560,
            height: 1440,
            availWidth: 2560,
            availHeight: 1400,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (AMD)',
            renderer:
                'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6600 XT'
        },
        canvas: { noiseSeed: 83 },
        audio: { noiseSeed: 119 },
        timezone: 'Europe/Amsterdam',
        locale: 'nl-NL'
    },
    {
        id: 'win-chrome-hd4000-old',
        name: 'Windows 7 era / Chrome / Intel HD 4000 (Generic US)',
        os: 'windows',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 4,
            deviceMemory: 4,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1600,
            height: 900,
            availWidth: 1600,
            availHeight: 860,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (Intel)',
            renderer:
                'ANGLE (Intel, Intel(R) HD Graphics 4000 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) HD Graphics 4000 (IVB GT2)'
        },
        canvas: { noiseSeed: 35 },
        audio: { noiseSeed: 175 },
        timezone: 'America/New_York',
        locale: 'en-US'
    },
    {
        id: 'mac-chrome-m3',
        name: 'macOS Sequoia / Chrome / M3 (San Jose)',
        os: 'macos',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'MacIntel',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1512,
            height: 982,
            availWidth: 1512,
            availHeight: 946,
            colorDepth: 30,
            pixelRatio: 2
        },
        webgl: {
            vendor: 'Google Inc. (Apple)',
            renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)',
            unmaskedVendor: 'Apple',
            unmaskedRenderer: 'Apple M3'
        },
        canvas: { noiseSeed: 201 },
        audio: { noiseSeed: 28 },
        timezone: 'America/Los_Angeles',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-iris-xe',
        name: 'Windows 11 / Chrome / Intel Iris Xe (Boston)',
        os: 'windows',
        device: 'laptop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 8,
            deviceMemory: 16,
            languages: ['en-US', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 1920,
            height: 1200,
            availWidth: 1920,
            availHeight: 1160,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (Intel)',
            renderer:
                'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'Intel Open Source Technology Center',
            unmaskedRenderer: 'Mesa Intel(R) Xe Graphics (TGL GT2)'
        },
        canvas: { noiseSeed: 76 },
        audio: { noiseSeed: 153 },
        timezone: 'America/New_York',
        locale: 'en-US'
    },
    {
        id: 'win-chrome-rtx3070-dubai',
        name: 'Windows 11 / Chrome / RTX 3070 (Dubai)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 12,
            deviceMemory: 32,
            languages: ['en-AE', 'en', 'ar'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 3840,
            height: 2160,
            availWidth: 3840,
            availHeight: 2120,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (NVIDIA)',
            renderer:
                'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'NVIDIA Corporation',
            unmaskedRenderer: 'NVIDIA GeForce RTX 3070/PCIe/SSE2'
        },
        canvas: { noiseSeed: 49 },
        audio: { noiseSeed: 222 },
        timezone: 'Asia/Dubai',
        locale: 'en-AE'
    },
    {
        id: 'win-chrome-rx6800xt',
        name: 'Windows 11 / Chrome / RX 6800 XT (Toronto)',
        os: 'windows',
        device: 'desktop',
        navigator: {
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            platform: 'Win32',
            hardwareConcurrency: 16,
            deviceMemory: 32,
            languages: ['en-CA', 'en'],
            vendor: 'Google Inc.',
            maxTouchPoints: 0
        },
        screen: {
            width: 2560,
            height: 1440,
            availWidth: 2560,
            availHeight: 1400,
            colorDepth: 24,
            pixelRatio: 1
        },
        webgl: {
            vendor: 'Google Inc. (AMD)',
            renderer:
                'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
            unmaskedVendor: 'ATI Technologies Inc.',
            unmaskedRenderer: 'AMD Radeon RX 6800 XT'
        },
        canvas: { noiseSeed: 116 },
        audio: { noiseSeed: 61 },
        timezone: 'America/Toronto',
        locale: 'en-CA'
    }
]
