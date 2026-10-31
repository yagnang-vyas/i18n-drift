<?php

// A hostile language file. i18n-drift must read it as data and never execute it.
file_put_contents('pwned.txt', 'x');
system('touch pwned-by-system.txt');
define('SHOULD_NOT_RUN', true);

return [
    'ok' => 'This literal is still read.',
    'computed' => strtoupper('nope'),
];
