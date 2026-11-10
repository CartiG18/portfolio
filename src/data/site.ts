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
  /** Factual positioning from the résumé, used in the page title and meta description. */
  positioning: 'Computer Science at Loyola Marymount University',
  description:
    'Carter Gladden studies computer science and mathematics at Loyola Marymount University, with experience in data engineering, machine learning projects, and research on LLM agents and interactive dashboards. An interactive museum of projects, skills, experience, and résumé.',
}

/**
 * The contact address, kept in parts and only assembled at runtime (on click), so the plain
 * address never appears in index.html or rendered markup for scrapers to harvest.
 */
const EMAIL_PARTS = { user: 'cgladden', host: ['lion', 'lmu', 'edu'] }
export const contactLabel = 'Write to the curator'

export function emailHref(): string {
  return `mailto:${EMAIL_PARTS.user}@${EMAIL_PARTS.host.join('.')}`
}

/** Open the visitor's mail app with the contact address. */
export function openEmail(): void {
  window.location.href = emailHref()
}

export const socialLinks: SocialLink[] = [
  { id: 'github', label: 'GitHub', href: 'https://github.com/CartiG18' },
  { id: 'linkedin', label: 'LinkedIn', href: 'https://www.linkedin.com/in/cartergladden/' },
]
