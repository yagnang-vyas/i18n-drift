<!DOCTYPE html>
<html lang="{{ app()->getLocale() }}">
<head>
    <title>{{ __('messages.app_name') }}</title>
</head>
<body>
    <h1>{{ __('Welcome back, :name.', ['name' => $user->name]) }}</h1>
    {{-- __('messages.commented_out') is a Blade comment and must be ignored --}}
    <p>नमस्ते {{ __('messages.footer_note') }}</p>
    <p>{!! __('messages.terms') !!}</p>
    <p>@lang('messages.welcome_title', ['name' => $user->name])</p>
    <p>@choice('messages.items', $count)</p>
    <p>@lang('messages.ok_label') @lang('messages.brand_tagline')</p>
    <p>{{ __('messages.greeting', ['name' => $user->name, 'count' => $count]) }}</p>
    @php
        $note = __('messages.in_php');
    @endphp
    <p>{{ $note }}</p>
    @verbatim
        {{ __('messages.inside_verbatim') }}
    @endverbatim
    <x-button :label="__('Save')" />
    <a href="/login">{{ __('Sign in') }}</a>
    <button>{{ __('Create invoice') }}</button>
    <label>{{ __('Email') }}</label>
</body>
</html>
