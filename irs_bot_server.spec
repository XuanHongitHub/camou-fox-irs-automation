# -*- mode: python ; coding: utf-8 -*-


from PyInstaller.utils.hooks import collect_data_files

datas = []
datas += collect_data_files('camoufox')
datas += collect_data_files('browserforge')
datas += collect_data_files('apify_fingerprint_datapoints')

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
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
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
