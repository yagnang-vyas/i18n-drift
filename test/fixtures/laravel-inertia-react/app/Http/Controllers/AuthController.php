<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Lang;

class AuthController
{
    public function store(string $role)
    {
        // __('auth.commented_out') must never be counted
        $error = __('auth.failed');
        $limit = trans('auth.throttle', ['seconds' => 30]);
        $password = Lang::get('auth.password');
        $invite = __('admin/users.invite');
        $contact = __('messages.support_email');
        $roleLabel = __("roles.$role");

        return back()->withErrors([
            'email' => $error,
            'password' => $password,
            'limit' => $limit,
            'contact' => $contact,
            'invite' => $invite,
            'role' => $roleLabel,
            'ignored' => $this->trans('not.a.translation'),
        ]);
    }
}
