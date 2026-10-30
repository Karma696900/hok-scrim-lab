// The legal texts in English: the reference of the other languages.

// The legal texts, in the two languages they are written in (French and English). Any other language of the site shows the
// English text, which is the reference, under a line that says so: a legal text translated by a machine would promise
// more than anybody checked. A block is { h } (a heading), { p } (a paragraph) or { ul } (a list); `{publisher}`,
// `{email}`, `{host}`, `{hostAddress}`, `{hostContact}`, `{country}` and `{updated}` are filled in by page.js from
// shared/legal-info.js, a missing one showing as a "to complete" mark.
//
// These texts describe what the code does today (the accounts, the cookies, the services it calls): when one of these
// changes, change the text and the date in legal-info.js.

export const en = {
  terms: {
    title: "Terms of use",
    lead: "The rules for using HOK Global Scrim Lab. Using the site means you accept them.",
    blocks: [
      { h: "1. What the site is" },
      {
        p: "HOK Global Scrim Lab is a free, fan-made set of tools for Honor of Kings Global players and teams: a draft simulator with the competitive ban and pick order, scrim series and history, tier lists, hero guides, a build lab, game data, statistics of tournament drafts and training exercises. It is published by {publisher} (“we”)."
      },
      {
        p: "It is not an official site. Honor of Kings, its heroes, artwork, names and videos belong to Tencent / TiMi Studio Group. Nothing here is endorsed by or affiliated with them."
      },
      { h: "2. Using the site" },
      {
        p: "Most pages can be read without an account. An account is needed to keep your series, teams, tier lists and settings, and to use the community. You must be at least 15 years old, or have the agreement of the person who holds parental authority over you."
      },
      { h: "3. Your account" },
      {
        ul: [
          "Give a real address you can use to sign in and keep your password secret. Two-factor authentication is required; keep your recovery codes safe, because we cannot send you a reset by email.",
          "You are responsible for what is done with your account. Tell us at once if you think someone else got into it.",
          "One person, one account. Do not create accounts to get around a decision we took about another one."
        ]
      },
      { h: "4. What you may not do" },
      {
        ul: [
          "Break the law, or write anything that is illegal: threats, harassment, hate speech, content that attacks a person or a group, or that shows other people's private data.",
          "Impersonate someone, or use the name of a team or a player that is not yours to mislead others.",
          "Try to break into the site or into other accounts, overload it, scrape it faster than a person reads it, or use the API beyond its limits.",
          "Use the site to cheat in an official match or to organise cheating."
        ]
      },
      { h: "5. What you write" },
      {
        p: "What you put on the site (series, notes, guides, tier lists, messages, team names and so on) stays yours. By publishing it in a place other people can see (a team space, the community, a shared link), you allow the site to store it and show it to those people, and only for that. You promise you have the right to publish it."
      },
      {
        p: "Messages and posts of the community can be reported. We can remove content and suspend or delete an account that breaks these rules, with or without notice when it is serious."
      },
      { h: "6. The data of the game and of tournaments" },
      {
        p: "Hero, item, arcana and spell data come from the official public pages of the game (HOK Camp Global) and from what our staff entered. Tournament results come in part from Liquipedia and from public videos of the broadcasts; they are credited in the legal notice. We do our best to keep everything right and up to date, but the game changes and mistakes happen: check the game when it matters."
      },
      { h: "7. Availability and responsibility" },
      {
        p: "The site is free and offered as it is. We may change it, interrupt it or stop it. We do not promise it will always be available or free of errors, and, as far as the law allows, we are not liable for damage that comes from using it (for example a lost series). Back up what matters to you: the export of a series is there for that. Nothing in these terms limits the rights you have by law as a consumer."
      },
      { h: "8. Personal data" },
      {
        p: "What we do with your data is explained in the privacy policy, and the cookies and local storage in the page that lists them."
      },
      { h: "9. Changes, law, contact" },
      {
        p: "We can change these terms; the date at the bottom shows the last change, and a change that matters is announced on the site. Continuing to use the site after a change means you accept it."
      },
      {
        p: "These terms follow the law of {country}. If a dispute cannot be settled by talking, the courts of {country} decide, unless a mandatory rule where you live says otherwise. A consumer may also use a mediator or the European online dispute resolution platform. To write to us: {email}, or the contact page."
      }
    ]
  },

  privacy: {
    title: "Privacy policy",
    lead: "What we keep about you, why, for how long, and how to use your rights under the GDPR.",
    blocks: [
      { h: "1. Who is responsible" },
      {
        p: "The data controller is {publisher}, {country}. You can write to {email} for anything about your data."
      },
      { h: "2. What we keep, and why" },
      {
        p: "If you only read the public pages, we keep no profile of you: there is no account, no advertising, no analytics and no tracking. Our server answers your request and our systems count requests for a few minutes to stop abuse (limits per network address, kept in memory)."
      },
      { p: "If you create or use an account, we keep:" },
      {
        ul: [
          "Your account: pseudo, a unique tag, email address (to sign in; we never send mail), the password as a salted hash only, your authenticator secret (encrypted), your recovery codes (as hashes), your avatar. Basis: the contract (the account you asked for).",
          "If you sign in with Google: the email address, name and picture Google sends us. Google also asks for your authenticator code afterwards. Basis: the contract.",
          "If you link Discord (optional): your Discord identifier, user name, avatar and the notification choices you made. Basis: your consent, which you withdraw by unlinking.",
          "Your sessions: a hash of the sign-in token, its dates and its expiry. Basis: the contract and our legitimate interest in security.",
          "What you create: series and drafts, teams and their members, tier lists, notes and scenarios, guides, training results, your personal space and its links, agenda events, messages, posts, requests and reports of the community, and the API keys you make (stored as hashes). Basis: the contract.",
          "Security data: failed sign-in counts and the temporary lock that goes with them, and a journal of the security events of your account (sign-in, sign-out, password or authenticator change) with their date and the network address they came from. Basis: our legitimate interest in protecting accounts.",
          "What you send us through the contact form: name, email address and message. Basis: our legitimate interest in answering you."
        ]
      },
      {
        p: "Without an account, a random identifier can be kept in a cookie as soon as you save something (a series, for example), so that you find it again. It holds nothing about who you are."
      },
      {
        p: "Other people see what you choose to share: your pseudo and tag, the teams you belong to, what you post in the community, and what you share with a link. Anyone with a shared link can read what it points to."
      },
      { h: "3. Who receives it" },
      {
        ul: [
          "Our host, {host}, which stores the site and its database ({hostAddress}).",
          "Google, if you sign in with it, and Discord, if you link it: they receive what the sign-in or the link needs.",
          "Tencent / TiMi servers: the pictures, artwork and videos of the heroes and of the game are loaded by your browser straight from their addresses (camp.honorofkings.com, res.sgameglobal.com), so they see your network address and your browser, as for any site that loads their pictures.",
          "A translation service: the texts written by our staff (names and descriptions of items and so on) are sent to translate them into the languages of the site. No personal data is in them.",
          "Authorities, when the law requires it."
        ]
      },
      { p: "We do not sell your data and we do not use it for advertising or for profiling." },
      { h: "4. Transfers outside the European Union" },
      {
        p: "Google, Discord and Tencent can process data outside the European Union, including in the United States and in China. When you use them, their own policies and transfer safeguards apply. Our own data is stored with {host}."
      },
      { h: "5. How long we keep it" },
      {
        ul: [
          "Account data: until you delete your account.",
          "Sessions: 14 days without use, 30 days at most for an account; 180 days without use, 365 days at most for a visitor without an account.",
          "Security journal: 180 days.",
          "Contact messages: as long as it takes to answer, then at most 12 months.",
          "What you published in a team belongs to that team's history: if you leave or delete your account, your name is removed from it where the data model allows it, and what depends only on you is deleted.",
          "Deleted data can remain for a limited time in backups, until they are overwritten."
        ]
      },
      { h: "6. Your rights" },
      {
        p: "You may ask for access to your data, to have it corrected or erased, to limit or object to its use, to receive it in a portable form, and to withdraw a consent at any time. In your account page you can download your data and delete your account yourself. For the rest, write to {email}; we answer within one month. We may ask you to prove who you are."
      },
      {
        p: "If you think we do not respect your rights, you can complain to the CNIL (cnil.fr) or to the data protection authority of the country you live in."
      },
      { h: "7. How we protect it" },
      {
        p: "Passwords are stored only as salted hashes; two-factor authentication is mandatory; the connection is encrypted; the site refuses to run scripts or styles that it does not control (a strict content security policy); and access to the database is limited to the site's own account. No system is perfect: if a breach put your rights at risk, we would tell you and the authority as the law requires."
      },
      { h: "8. Cookies" },
      {
        p: "The site only uses the cookies and the local storage it needs to work and to remember your choices. They are listed in the cookies page. They do not need a consent banner, and we use none."
      },
      { h: "9. Children" },
      {
        p: "The site is not meant for people under 15. If you think a younger person gave us data, write to us and we will delete it."
      },
      { h: "10. Changes" },
      {
        p: "We may change this policy; the date at the bottom is the last change. A change that matters to you is announced on the site."
      }
    ]
  },

  cookies: {
    title: "Cookies and local storage",
    lead: "What the site stores in your browser, and what each item is for.",
    blocks: [
      {
        p: "There is no advertising or analytics cookie and no third-party tracker. What is stored is either strictly necessary to run the site (signing in, security) or a choice you made (language, theme, display options). Under the rules on cookies, these need neither a consent banner nor a prior consent. You can erase them in your browser at any time; the site then forgets you, and you sign in again."
      },
      { h: "Cookies" },
      {
        ul: [
          "hok_session: keeps you signed in (or a visitor's random identifier once you save something). Secure, HttpOnly. Gone after 14 days without use (account) or 180 days (visitor), and when you sign out.",
          "hok_challenge, hok_oauth_state, hok_oauth_pkce, hok_oauth_return, hok_discord_state, hok_discord_bot: short-lived (ten minutes) security checks during a sign-in step, a Google or Discord connection. HttpOnly.",
          "hok_lang and hok_theme: the language and the colour theme (and text direction) you chose, so that the page is drawn right at once. One year."
        ]
      },
      { h: "Local storage of your browser" },
      {
        ul: [
          "hok.modules, hok.settings: which parts of the site you use and your display options.",
          "The background chosen for the hero pages, the period shown in the statistics, and the drafts of the build lab: kept so that you find them again.",
          "Session storage (gone when you close the tab): a pre-filled form when you move from one page to another."
        ]
      },
      { h: "Third parties" },
      {
        p: "Pictures and videos of the game are loaded from servers of Tencent / TiMi (camp.honorofkings.com, res.sgameglobal.com). Your browser contacts them directly; they can set their own technical data according to their policy. We do not control that."
      },
      {
        p: "More about your data and your rights: see the privacy policy."
      }
    ]
  },

  legal: {
    title: "Legal notice",
    lead: "Who publishes HOK Global Scrim Lab, who hosts it, and what it uses.",
    blocks: [
      { h: "Publisher" },
      {
        ul: [
          "{publisher} ({publisherKind}), {country}.",
          "Publication director: {publisher}.",
          "Contact: {email}, or the contact page."
        ]
      },
      { h: "Host" },
      { ul: ["{host}", "{hostAddress}", "{hostContact}"] },
      { h: "Intellectual property" },
      {
        p: "Honor of Kings, its heroes, names, artwork, music and videos are the property of Tencent / TiMi Studio Group. They appear on this site to describe the game, and this site is not endorsed by or affiliated with them. The code and the design of the site and what its staff wrote belong to its publisher; what you write stays yours."
      },
      { h: "Credits" },
      {
        ul: [
          "Hero, item, arcana and spell data: the official public pages HOK Camp Global.",
          "Tournament results and brackets: in part from Liquipedia (liquipedia.net/honorofkings), whose texts and data are available under the Creative Commons Attribution-ShareAlike 3.0 licence, and from the public videos of the broadcasts.",
          "Fonts: Barlow and Barlow Condensed, under the SIL Open Font Licence."
        ]
      },
      { h: "Report a problem" },
      {
        p: "To report content that breaks the law or a right of yours, or to ask for a correction, write to {email} with the address of the page and what is wrong."
      }
    ]
  }
};
