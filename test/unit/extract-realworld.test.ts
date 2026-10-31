import { describe, expect, it } from 'vitest';
import { extractBladeUsages } from '../../src/extractors/blade.js';
import { extractJsUsages } from '../../src/extractors/javascript.js';
import { extractPhpUsages } from '../../src/extractors/php.js';

const options = { functions: ['t', '$t', 'i18n.t', 'i18next.t'], namespaceSeparator: ':' };

describe('real-world shaped code', () => {
  it('reads Laravel Breeze style Blade without false positives', async () => {
    const usages = await extractBladeUsages(
      `<x-guest-layout>
    <div class="mb-4 text-sm text-gray-600">
        {{ __('Thanks for signing up! If you didn\\'t receive the email, we will gladly send you another.') }}
    </div>
    @if (session('status') == 'verification-link-sent')
        <div>{{ __('A new verification link has been sent.') }}</div>
    @endif
    <x-primary-button>{{ __('Resend Verification Email') }}</x-primary-button>
    <a href="{{ route('logout') }}" onclick="event.preventDefault()">{{ __('Log Out') }}</a>
    <style>@media (min-width: 640px) { .a { color: red } }</style>
    <p>support@example.com {{ $user->name }} {{ trans('x.y') }}</p>
</x-guest-layout>`,
      'v.blade.php',
    );
    expect(usages.map((u) => u.key)).toEqual([
      "Thanks for signing up! If you didn't receive the email, we will gladly send you another.",
      'A new verification link has been sent.',
      'Resend Verification Email',
      'Log Out',
      'x.y',
    ]);
  });

  it('ignores translation-like code in a React/Vue component library', async () => {
    const usages = await extractJsUsages(
      `import { useState } from 'react';
import clsx from 'clsx';
const t = performance.now();
const fmt = new Intl.DateTimeFormat('en');
export function Table({ rows }) {
  const [sort, setSort] = useState('name');
  const classes = clsx('p-2', { t: true });
  setTimeout(() => console.log('t'), 10);
  rows.sort((a, b) => a.t - b.t);
  return <table className="t">{rows.map((r) => <tr key={r.id}><td>{r.t}</td></tr>)}</table>;
}`,
      'Table.jsx',
      options,
    );
    expect(usages).toEqual([]);
  });

  it('reads PHP controllers, jobs and validation messages', async () => {
    const usages = await extractPhpUsages(
      `<?php
class UserController {
    public function rules() {
        return ['name' => 'required'];
    }
    public function messages() {
        return ['name.required' => __('validation.custom.name'), 'x' => trans("users.created", ['n' => 1])];
    }
    public function show() {
        return response()->json(['message' => __('Done')])->header('X', Lang::get('headers.x'));
    }
}`,
      'UserController.php',
    );
    expect(usages.map((u) => u.key)).toEqual([
      'validation.custom.name',
      'users.created',
      'Done',
      'headers.x',
    ]);
  });
});
