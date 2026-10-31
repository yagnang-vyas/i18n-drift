<?php

use Illuminate\Support\Facades\Route;

Route::get('/', fn () => view('welcome'))->name('home');
Route::get('/invoices/{invoice}/email', fn () => view('emails.invoice'));
