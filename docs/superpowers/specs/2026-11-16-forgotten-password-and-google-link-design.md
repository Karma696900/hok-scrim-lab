# Forgotten password and Google link — design (2026-11-16)

Approved by the owner on 2026-11-16 ("Oui, les deux"), after "MFA seul d'abord" and "liaison avec preuve + je supprime
les 2 comptes Google vides après vérification qu'ils sont vides".

## Why

- Accounts that already exist had no way back in after a forgotten password. The site sends no mail, so the reset
  must happen on the site.
- A Google sign-in with the address of an existing account of the site made a second account. That account stayed
  empty, stuck on its pseudo step because the address was already taken. Two people hit it on 2026-11-16.

## Forgotten password

- "Forgot your password?" sits under the sign-in form and opens `/login/forgot`.
- The form asks for the sign-in email, the authenticator code (or a recovery code via "I lost my device"), and the new
  password twice.
- `POST /api/auth/password/forgot` with `{ email, code | recoveryCode, newPassword }`:
  1. The strength of the new password is checked first, before any code is spent.
  2. The account must have a password and an authenticator.
  3. A locked account is refused.
  4. A wrong code counts as a failed sign-in, so the progressive lock applies.
  5. On success, the password changes, the failures are cleared and every session is closed. The event
     `password_reset` is logged.
- Every refusal gives the same answer, `401 reset_refused`: unknown address, no authenticator, locked, or wrong code.
  The answer never says whether an account exists.
- An account without an authenticator cannot prove who is asking. The owner resets it by hand, after checking that it
  is the person: `scripts/accounts/account.js reset-password` (the password comes from stdin or `HOK_PASSWORD`).

## Google link

- In the Google callback, an account counts as linkable when:
  - no account has this Google subject;
  - an account of the site has `login_email` equal to the Google address;
  - that account has no Google subject.
- For such an account, the sign-in opens a challenge of kind `link`. The Google subject and photo are sealed in it with
  the secret box (`link:<user id>`). The person goes to `/login/link`.
- What `/login/link` asks for:
  - the account has an authenticator: its code or a recovery code (the password alone is refused);
  - it has none: its password.
- After a good proof (`POST /api/auth/link`):
  1. Google is linked: `google_subject` is set and the email becomes verified.
  2. With a code: the person is signed in, because Google plus the code are the two factors.
  3. With a password: the authenticator is set up next.
- Limits are the same as for the code step: 5 tries per sign-in, the progressive lock, and the events `link_start`,
  `link_failed` and `google_linked`.
- "This is not my account" leads to the contact page. Nothing is created.

## Approaches considered

1. Mail plus authenticator. Not now: the site sends no mail. The owner chose the authenticator alone first.
2. Linking Google on address alone. Refused: the address of a local account is not verified, so anyone could have
   registered it.
3. Proof, then link. Chosen.

## Data cleanup

The 2 Google accounts created on 2026-11-16 were checked to be empty:
- a pending challenge;
- 2 journal lines;
- nothing in any other table.

They are deleted when this change goes live, after a backup of the database.
