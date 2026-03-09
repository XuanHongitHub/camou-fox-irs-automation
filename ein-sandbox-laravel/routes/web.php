<?php

use App\Http\Controllers\EinSandboxController;
use Illuminate\Support\Facades\Route;

Route::get('/', [EinSandboxController::class, 'start'])->name('ein.start');
Route::post('/reset', [EinSandboxController::class, 'reset'])->name('ein.reset');
Route::get('/step/{step}', [EinSandboxController::class, 'show'])->name('ein.step');
Route::post('/step/{step}', [EinSandboxController::class, 'submit'])->name('ein.submit');
Route::get('/applyein/downloadConfirmationLetter', [EinSandboxController::class, 'downloadConfirmation'])
    ->name('ein.irs.download.confirmation');
Route::get('/applyein/{slug}', [EinSandboxController::class, 'showCanonical'])
    ->whereIn('slug', ['legalStructure', 'identityOfEntities', 'addAddresses', 'additionalDetails', 'reviewAndSubmit', 'einAssignment'])
    ->name('ein.irs.step');
Route::post('/applyein/{slug}', [EinSandboxController::class, 'submitCanonical'])
    ->whereIn('slug', ['legalStructure', 'identityOfEntities', 'addAddresses', 'additionalDetails', 'reviewAndSubmit', 'einAssignment'])
    ->name('ein.irs.submit');
Route::get('/download/confirmation-letter', [EinSandboxController::class, 'downloadConfirmation'])
    ->name('ein.download.confirmation');
