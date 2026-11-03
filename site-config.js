// Settings for the rationalbonding.com homepage. Anything left empty is
// simply hidden, so the page never shows a broken link.
export const SITE = {
  // Coffee donations. Only ever put PUBLIC receiving details here.
  // Monero: your primary address (starts with 4) or, better for privacy, a
  // subaddress (starts with 8). Never a private key or seed.
  monero: '44GKFByQ9cmWPEjX5hLhwzGc1NqRHt23CEFAkTyafCFYGrNCwki9sFsTjCMnpAWWGWRUcQDsjtqPPZAMowpZ9R3843AHUtR',
  // Cash: a Cash App $cashtag (e.g. '$RationalBonding'). Optional.
  cashApp: '$youngidealist',
  // Contact address shown on the privacy page. Leave empty to point people to
  // GitHub issues instead. Only set an address that really receives mail.
  contactEmail: '',
};
