import { HugeiconsIcon } from '@hugeicons/react';

// Thin wrapper so every component imports one thing ('./Icon') instead of
// wiring up HugeiconsIcon + defaults everywhere. Renders nothing if no icon
// is passed, instead of letting the underlying component throw.
export default function Icon({ icon, size = 18, strokeWidth = 2, className = '', ...rest }) {
  if (!icon) return null;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} className={className} {...rest} />;
}
