// The pages of the way in (sign in, the code of the authenticator, a forgotten password, the link of Google,
// the authenticator to set up, create an account) and of the security of the account: the end of the route table.
import { message } from "./routes-shared.js";

export const ACCOUNT_ROUTES = [
  {
    pattern: /^\/login$/,
    view: "login",
    index: true,
    title: message("Sign in | {site}"),
    description: message("Sign in to your account.")
  },
  {
    pattern: /^\/login\/mfa$/,
    view: "mfa",
    index: true,
    title: message("Verification code | {site}"),
    description: message("Enter the code from your authenticator app.")
  },
  {
    pattern: /^\/login\/profile$/,
    view: "profile",
    index: true,
    title: message("Choose your pseudo | {site}"),
    description: message("Choose the pseudo and the password of your account.")
  },
  {
    pattern: /^\/login\/forgot$/,
    view: "forgot",
    index: true,
    title: message("Forgotten password | {site}"),
    description: message("Choose a new password with your authenticator app.")
  },
  {
    pattern: /^\/login\/link$/,
    view: "link",
    index: true,
    title: message("Link your Google account | {site}"),
    description: message("Link Google to the account you already have.")
  },
  {
    pattern: /^\/login\/setup$/,
    view: "setup",
    index: true,
    title: message("Set up two-factor authentication | {site}"),
    description: message("Protect your account with an authenticator app.")
  },
  {
    pattern: /^\/register$/,
    view: "register",
    index: true,
    title: message("Create an account | {site}"),
    description: message("Create an account protected by two-factor authentication.")
  },
  {
    pattern: /^\/account$/,
    view: "account",
    index: true,
    title: message("Account security | {site}"),
    description: message("Password, authenticator and recovery codes.")
  }
];
