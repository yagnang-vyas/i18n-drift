<h2><?php echo trans('billing.title'); ?></h2>
<p>{{ __('notifications.sent', ['email' => $client->email]) }}</p>
@if (__('status.paid') === $status)
    <p>{{ __('dashboard.title') }}</p>
@endif
