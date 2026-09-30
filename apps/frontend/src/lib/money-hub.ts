// money-hub patch: switches for this personal build.
//
// CONNECT_HIDDEN hides Wealthfolio Connect (their paid cloud: broker sync, device sync,
// subscriptions) everywhere in the UI: the sidebar and floating bar item, the phone menu
// item, Settings, Connections, Wealthfolio Connect, the "connect account" link on
// Settings, Accounts, and the onboarding step and subscribe button. /connect and
// /settings/connect go home. The money app is free-only, so it never uses Connect.
// Set to false to bring all of it back.
export const CONNECT_HIDDEN = true;
