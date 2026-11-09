/**
 * Exhibit content. Everything marked TODO(content) is a placeholder waiting for the owner's
 * real details; never fill these in with invented facts.
 */

export interface SkillDrawer {
  id: string
  label: string
  /** TODO(content): the actual skills in this category. */
  items: string[]
}

export const skillDrawers: SkillDrawer[] = [
  { id: 'languages', label: 'Languages', items: [] },
  { id: 'frameworks', label: 'Frameworks & Libraries', items: [] },
  { id: 'tools', label: 'Tools & Platforms', items: [] },
  { id: 'practices', label: 'Practices', items: [] },
]

export interface ProjectCase {
  id: string
  /** TODO(content): project name, summary, stack, links. */
  title: string
  summary: string
  stack: string[]
  links: Array<{ label: string; href: string }>
}

export const projectCases: ProjectCase[] = [
  { id: 'case-1', title: 'Case I', summary: '', stack: [], links: [] },
  { id: 'case-2', title: 'Case II', summary: '', stack: [], links: [] },
  { id: 'case-3', title: 'Case III', summary: '', stack: [], links: [] },
]

/** TODO(content): a short About paragraph or two, in the owner's words. */
export const aboutParagraphs: string[] = []

export interface TimelineEntry {
  id: string
  /** TODO(content): role or degree, organisation, dates, a line or two. */
  title: string
  org: string
  dates: string
  detail: string
}

export const timeline: TimelineEntry[] = []

/** TODO(content): path to the résumé PDF in /public, e.g. '/resume.pdf'. */
export const resumeHref = ''
/** TODO(content): path to the CV PDF in /public. */
export const cvHref = ''

/**
 * Notes tucked into a few books on the hall's shelves: short, well-attributed quotations
 * about the craft. Swap in project names or personal facts when you have them.
 */
export const bookNotes: Array<{ text: string; source: string }> = [
  { text: 'Simplicity is prerequisite for reliability.', source: 'Edsger W. Dijkstra' },
  { text: 'Programs must be written for people to read, and only incidentally for machines to execute.', source: 'Abelson & Sussman, SICP' },
  { text: 'Premature optimization is the root of all evil.', source: 'Donald Knuth' },
  { text: 'The best way to predict the future is to invent it.', source: 'Alan Kay' },
  { text: 'Adding manpower to a late software project makes it later.', source: 'Fred Brooks' },
  { text: 'Any sufficiently advanced technology is indistinguishable from magic.', source: 'Arthur C. Clarke' },
]
