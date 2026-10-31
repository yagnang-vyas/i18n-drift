<form method="post">
    <?= csrf_field() ?>
    <button>{{ $label }}</button>
    <small><?php echo __('validation.required', ['attribute' => 'email']); ?></small>
    <small>@lang('validation.email', ['attribute' => 'email'])</small>
</form>
