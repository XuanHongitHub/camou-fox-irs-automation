# -*- mode: python ; coding: utf-8 -*-


from PyInstaller.utils.hooks import collect_data_files

packages_to_collect = [
    'camoufox',
    'browserforge',
    'apify_fingerprint_datapoints',
    'language_tags',
    'ua_parser',
    'screeninfo',
    'geoip2',
    'maxminddb',
    'playwright',
    'certifi',
    'tzdata',
    'urllib3',
    'idna',
    'charset_normalizer',
    'lxml',
    'pymupdf',
    'fitz',
]

datas = [('irs_bot/data/us_city_zip_county.csv', 'irs_bot/data')]
for pkg in packages_to_collect:
    try:
        datas += collect_data_files(pkg)
    except Exception:
        pass

a = Analysis(
    ['entry_server.py'],
    pathex=['.'],
    binaries=[],
    datas=datas,
    hiddenimports=[
        'socks',
        'camoufox',
        'camoufox.sync_api',
        'camoufox.fingerprints',
        'browserforge',
        'browserforge.bayesian_network',
        'browserforge.download',
        'browserforge.fingerprints',
        'browserforge.fingerprints.generator',
        'browserforge.headers',
        'browserforge.headers.generator',
        'browserforge.headers.utils',
        'browserforge.injectors',
        'browserforge.injectors.playwright',
        'browserforge.injectors.playwright.injector',
        'browserforge.injectors.utils',
        'apify_fingerprint_datapoints',
        'geoip2',
        'geoip2.database',
        'maxminddb',
        'aiohttp',
        'charset_normalizer',
        'chardet',
        'pymupdf',
        'fitz',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'torch', 'torchvision', 'torchaudio',
        'scipy', 'matplotlib', 'Cython', 'sympy',
        'IPython', 'notebook', 'pytest', 'tkinter',
        'onnxruntime', 'tensorflow', 'tensorboard',
        'numba', 'llvmlite',
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='irs_bot_server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
