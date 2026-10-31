@extends('layouts.app')

@section('content')
    <h1>{{ __('shop.title') }}</h1>

    @if ($cart->isEmpty())
        <p>{!! __('shop.cart_empty') !!}</p>
    @else
        <p>@choice('shop.cart_count', $cart->count())</p>
    @endif

    @php
        $banner = __('shop.promo.title');
        $body = trans('shop.promo.body', ['percent' => 15]);
    @endphp

    <h2>{{ $banner }}</h2>
    <p>{{ $body }}</p>

    {{-- @lang('shop.not_a_key') --}}

    @include('partials.checkout', ['label' => __('shop.checkout')])
@endsection
