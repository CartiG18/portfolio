import type { TimelineEntry } from '../data/content.ts'

/** Professional-page additions not yet included in the shared museum timeline. */
export const professionalExperienceAdditions: TimelineEntry[] = [
  {
    id: 'uw-reu-intern',
    kind: 'work',
    title: 'REU Intern',
    org: 'University of Washington',
    location: 'Seattle, WA',
    dates: 'Jun 2026 – Aug 2026',
    bullets: [
      'Participated in an NSF-funded Research Experiences for Undergraduates (REU) program, working on the Simulating Dashboard Interactions project during summer 2026.',
      'Continued contributing to the project independently after the summer program ended.',
      'TODO(content): Add specific REU responsibilities and outcomes.',
    ],
  },
]
