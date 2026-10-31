<h1>{{ __('messages.brand') }}</h1>
<p>{{ __('messages.welcome', ['name' => $user->name]) }}</p>
<p>@choice('messages.notes', $count)</p>
<button>{{ __('Add note') }}</button>
