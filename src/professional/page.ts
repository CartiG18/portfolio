import { projectCases, timeline } from '../data/content.ts'
import { emailHref, site, socialLinks } from '../data/site.ts'
import { EMAIL_ICON_PATH, SOCIAL_ICON_PATHS } from '../data/icons.ts'
import { esc } from '../components/html.ts'
import { professionalExperienceAdditions } from './content.ts'

const tabs = [
  { id: 'about', label: 'About' },
  { id: 'experience', label: 'Experience' },
  { id: 'education', label: 'Education' },
  { id: 'projects', label: 'Projects' },
  { id: 'research', label: 'Research' },
]
const researchProjectIds = new Set(['dashboard-interactions', 'grnsight'])

function entry(title: string, meta: string, details: string[]): string {
  return `<article class="professional-entry"><div class="professional-entry__heading"><h3>${esc(title)}</h3><p>${esc(meta)}</p></div>${details.length ? `<ul>${details.map((detail) => `<li>${esc(detail)}</li>`).join('')}</ul>` : ''}</article>`
}

function timelineEntries(kind: 'work' | 'education'): string {
  const items = kind === 'work'
    ? [...professionalExperienceAdditions, ...timeline.filter((item) => item.kind === kind)]
    : timeline.filter((item) => item.kind === kind)
  return items.map((item) => entry(
    item.title,
    [item.org, item.location, item.dates].filter(Boolean).join(' · '),
    item.bullets,
  )).join('')
}

function projects(): string {
  return projectCases.filter((project) => !researchProjectIds.has(project.id)).map((project) => entry(
    project.title,
    [project.context, project.stack.join(', ')].filter(Boolean).join(' · '),
    [project.what, ...project.how, project.result].filter(Boolean),
  )).join('')
}

function researchProjects(): string {
  return projectCases.filter((project) => researchProjectIds.has(project.id)).map((project) => entry(
    project.title,
    [project.context, project.stack.join(', ')].filter(Boolean).join(' · '),
    [project.what, ...project.how, project.result].filter(Boolean),
  )).join('')
}

export function renderProfessionalPage(): string {
  const sectionLinks = tabs.map((tab) => `<a class="professional-tab" href="#section-${tab.id}">${tab.label}</a>`).join('')
  const about = `<section class="professional-panel" id="section-about"><h2>About</h2><p class="professional-lede">TODO(content): Add a concise professional description in your own words.</p><p>Currently studying computer science and mathematics at Loyola Marymount University.</p></section>`
  const experience = `<section class="professional-panel" id="section-experience"><h2>Experience</h2>${timelineEntries('work')}</section>`
  const education = `<section class="professional-panel" id="section-education"><h2>Education</h2>${timelineEntries('education')}</section>`
  const projectPanel = `<section class="professional-panel" id="section-projects"><h2>Projects</h2>${projects()}</section>`
  const research = `<section class="professional-panel" id="section-research"><h2>Research</h2>${researchProjects()}</section>`
  const socials = socialLinks.filter((link) => link.href).map((link) => `<a class="professional-contact__icon" href="${esc(link.href)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(link.label)} (opens in a new tab)"><svg class="professional-icon professional-icon--${link.id}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${link.id === 'linkedin' ? '<rect x="2" y="2" width="20" height="20" rx="2" />' : ''}<path d="${SOCIAL_ICON_PATHS[link.id]}" /></svg></a>`).join('')
  const email = `<a class="professional-contact__icon" href="${emailHref()}" aria-label="Email Carter Gladden"><svg class="professional-icon professional-icon--email" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill-rule="evenodd" d="${EMAIL_ICON_PATH}" /></svg></a>`

  return `<div class="professional-page"><div class="professional-content"><div class="professional-main"><header class="professional-intro"><h1>${esc(site.ownerName)}</h1><p class="professional-positioning">${esc(site.positioning)}</p></header><nav class="professional-tabs" aria-label="Portfolio sections">${sectionLinks}</nav><div class="professional-panels">${about}${experience}${education}${projectPanel}${research}</div></div><aside class="professional-sidebar" aria-label="Affiliations and contact"><div class="professional-logos"><img class="professional-logo" src="/lmu-crest.png" width="634" height="744" alt="Loyola Marymount University crest" /><img class="professional-logo professional-logo--creare" src="/creare-logo.png" width="170" height="170" alt="Creare Service Organization logo" /></div><nav class="professional-sidebar__links" aria-label="Contact and profiles">${socials}${email}</nav></aside></div></div>`
}
