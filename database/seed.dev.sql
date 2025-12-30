-- Local-only seed data for development environments.
-- Run via: `make db-seed`

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM perlcode.questions
        WHERE slug = 'sample-what-does-dollar-underscore-mean-in-perl'
        LIMIT 1
    ) THEN
        UPDATE perlcode.questions
        SET
            title = 'What does $_ mean in Perl?',
            question = 'What does the $_ variable represent in Perl and when is it used?',
            answer_html = '<p><code>$_</code> is Perl''s default variable (the “topic” variable). Many built-ins and operators implicitly use it when you don''t pass an explicit variable.</p>
<h3>Common uses</h3>
<pre><code class="language-perl">use strict;
use warnings;

for (1..3) {
  print; # prints $_
}

$_ = "Perl";
if (/perl/i) { # matches against $_
  print "Found perl!\\n";
}
</code></pre>
<p>Think of <code>$_</code> as “the thing we''re currently working with”.</p>',
            answer_plain = '$_ is Perl''s default variable (the “topic” variable). Many built-ins and operators implicitly use it when you don''t pass an explicit variable.

Common uses

for (1..3) {
  print; # prints $_
}

$_ = "Perl";
if (/perl/i) {
  print "Found perl!\\n";
}

Think of $_ as “the thing we''re currently working with”.',
            category = 'basics',
            tags = ARRAY['variables', 'special-variables', 'syntax'],
            difficulty = 'beginner',
            source = 'seed-dev',
            published_at = COALESCE(published_at, NOW()),
            code_snippet = E'use strict; use warnings;\nfor (1..3) {\n  print \"$_\\n\";\n}\n$_ = \"Perl\";\nif (/perl/i) {\n  print \"Found perl!\\n\";\n}\n',
            code_stdout = E'1\n2\n3\nFound perl!\n',
            code_stderr = '',
            code_exit_code = 0,
            code_runtime_ms = 5,
            perl_version = 'v5.38.5',
            is_verified = TRUE,
            verified_at = NOW()
        WHERE slug = 'sample-what-does-dollar-underscore-mean-in-perl';

        RAISE NOTICE 'Updated dev seed question';
    ELSIF EXISTS (
        SELECT 1
        FROM perlcode.questions
        WHERE is_verified = TRUE AND published_at IS NOT NULL
        LIMIT 1
    ) THEN
        RAISE NOTICE 'Seed skipped: found verified + published content';
    ELSE
        INSERT INTO perlcode.questions (
            slug,
            title,
            question,
            answer_html,
            answer_plain,
            category,
            tags,
            difficulty,
            source,
            published_at,
            code_snippet,
            code_stdout,
            code_stderr,
            code_exit_code,
            code_runtime_ms,
            perl_version,
            is_verified,
            verified_at
        ) VALUES (
            'sample-what-does-dollar-underscore-mean-in-perl',
            'What does $_ mean in Perl?',
            'What does the $_ variable represent in Perl and when is it used?',
            '<p><code>$_</code> is Perl''s default variable (the “topic” variable). Many built-ins and operators implicitly use it when you don''t pass an explicit variable.</p>
<h3>Common uses</h3>
<pre><code class="language-perl">use strict;
use warnings;

for (1..3) {
  print; # prints $_
}

$_ = "Perl";
if (/perl/i) { # matches against $_
  print "Found perl!\\n";
}
</code></pre>
<p>Think of <code>$_</code> as “the thing we''re currently working with”.</p>',
            '$_ is Perl''s default variable (the “topic” variable). Many built-ins and operators implicitly use it when you don''t pass an explicit variable.

Common uses

for (1..3) {
  print; # prints $_
}

$_ = "Perl";
if (/perl/i) {
  print "Found perl!\\n";
}

Think of $_ as “the thing we''re currently working with”.',
            'basics',
            ARRAY['variables', 'special-variables', 'syntax'],
            'beginner',
            'seed-dev',
            NOW(),
            E'use strict; use warnings;\nfor (1..3) {\n  print \"$_\\n\";\n}\n$_ = \"Perl\";\nif (/perl/i) {\n  print \"Found perl!\\n\";\n}\n',
            E'1\n2\n3\nFound perl!\n',
            '',
            0,
            5,
            'v5.38.5',
            TRUE,
            NOW()
        );

        RAISE NOTICE 'Inserted dev seed question';
    END IF;
END $$;
