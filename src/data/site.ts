export interface SocialLink {
  id: 'github' | 'linkedin'
  label: string
  /** Empty string means "not provided yet"; rendered as a disabled plaque. */
  href: string
}

export const site = {
  ownerName: 'Carter Gladden',
  museumName: 'The Carter Gladden Museum',
  tagline: 'An Engineering Portfolio',
}

export const socialLinks: SocialLink[] = [
  { id: 'github', label: 'GitHub', href: 'https://github.com/CartiG18' },
  // TODO(content): add LinkedIn profile URL
  { id: 'linkedin', label: 'LinkedIn', href: '' },
]
