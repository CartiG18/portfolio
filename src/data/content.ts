/**
 * Exhibit content, taken only from the owner's résumé (public/good-resume.pdf).
 * Anything marked TODO(content) still needs the owner's input; never fill those in with
 * invented facts. Never copy contact details beyond what site.ts lists (no phone number).
 */

export interface SkillDrawer {
  id: string
  label: string
  items: string[]
}

export const skillDrawers: SkillDrawer[] = [
  {
    id: 'languages',
    label: 'Languages',
    items: ['Python', 'JavaScript', 'TypeScript', 'SQL (PostgreSQL)', 'C/C++', 'Assembly', 'HTML/CSS'],
  },
  {
    id: 'frameworks',
    label: 'Frameworks',
    items: ['React', 'Next.js', 'Node.js/Express', 'FastAPI', 'Streamlit', 'Tailwind CSS'],
  },
  {
    id: 'libraries',
    label: 'Libraries',
    items: ['pandas', 'NumPy', 'scikit-learn', 'PyTorch', 'Pydantic', 'Ibis', 'Altair', 'pytest'],
  },
  {
    id: 'tools',
    label: 'Developer Tools',
    items: ['Git', 'Docker', 'GitHub Actions', 'Firebase/Firestore', 'Vercel', 'Trino', 'LaTeX'],
  },
]

export interface ProjectLink {
  label: string
  href: string
}

/** Each project panel answers what / why / how / result, per AGENTS.md. */
export interface ProjectCase {
  id: string
  title: string
  /** Where and when, for research or team work (empty for personal projects). */
  context: string
  stack: string[]
  what: string
  /** TODO(content) where the résumé doesn't say. */
  why: string
  how: string[]
  result: string
  links: ProjectLink[]
  /** Shown instead of a dead button when there's no live demo. */
  linkNote?: string
}

export const projectCases: ProjectCase[] = [
  {
    id: 'la-aqi',
    title: 'LA AQI Forecasting',
    context: '',
    stack: ['Python', 'scikit-learn', 'FastAPI', 'Pandas', 'Docker'],
    what: 'A machine-learning pipeline that forecasts Los Angeles air quality from real-time PurpleAir sensor data.',
    why: 'TODO(content): why you built it.',
    how: ['Trains a Random Forest regressor on real-time PurpleAir sensor data.'],
    result: 'Evaluated on MAE, RMSE, and R².',
    links: [{ label: 'Source on GitHub', href: 'https://github.com/CartiG18/la-aqi-predict' }],
    linkNote: 'No live demo',
  },
  {
    id: 'habit-tracker',
    title: 'Habit Tracker',
    context: '',
    stack: ['Next.js', 'TypeScript', 'Firebase', 'Tailwind CSS'],
    what: 'A mobile-first progressive web app for tracking habits, with streaks, per-habit journaling, and push notifications.',
    why: 'TODO(content): why you built it.',
    how: [
      'Google and email authentication.',
      'Real-time Firestore sync with security rules.',
      'Server-side token verification via Firebase Admin.',
    ],
    result: 'Built and deployed; live on Vercel.',
    links: [
      { label: 'Live site', href: 'https://synapse-habit-tracker.vercel.app' },
      { label: 'Source on GitHub', href: 'https://github.com/CartiG18/habit-tracker' },
    ],
  },
  {
    id: 'dashboard-interactions',
    title: 'Simulating Dashboard Interactions',
    context: 'Research · University of Washington · May 2026 – Present',
    stack: [],
    what: 'A benchmark and agent framework that simulates interactive exploration of visualization dashboards, for more realistic query workloads and LLM agents that can act on visualizations.',
    why: 'TODO(content): the research question in your words.',
    how: [
      'Developed a database benchmark that simulates interactive data exploration for more realistic query workloads.',
      'Designed a text-based dashboard representation enabling LLM agents to interpret and act on visualizations.',
      'Built an LLM agent environment and harness system to interact with visualization dashboards.',
    ],
    result: 'Co-authoring a research paper documenting the framework and its evaluation.',
    links: [],
  },
  {
    id: 'grnsight',
    title: 'GRNsight',
    context: 'Loyola Marymount University · Aug 2026 – Present',
    stack: ['Node.js/Express', 'PostgreSQL', 'React/Vite'],
    what: 'An open-source web application for visualizing gene regulatory networks.',
    why: 'TODO(content): what drew you to the project.',
    how: ['Maintained across a production client and a React/Vite rewrite.'],
    result: 'TODO(content): your contributions so far.',
    links: [],
    linkNote: 'No public link',
  },
]

/** TODO(content): draft — needs owner approval. Written from résumé facts only. */
export const aboutParagraphs: string[] = [
  'I study computer science, with a minor in mathematics, at Loyola Marymount University, where I am also a lab teaching assistant.',
  'I spent summer 2025 as a data engineering intern at Kollective Technology, and I do research at the University of Washington on how LLM agents interpret and act on interactive dashboards.',
  'Outside of class I’m involved in ACM and the Creare Service Organization, and I spend my free time rock climbing, surfing, and golfing.',
]

export interface TimelineEntry {
  id: string
  kind: 'work' | 'research' | 'education'
  title: string
  org: string
  location: string
  dates: string
  bullets: string[]
}

/** Newest first. */
export const timeline: TimelineEntry[] = [
  {
    id: 'grnsight',
    kind: 'research',
    title: 'GRNsight',
    org: 'Loyola Marymount University',
    location: 'Los Angeles, CA',
    dates: 'Aug 2026 – Present',
    bullets: [
      'Contributing to GRNsight, an open-source Node.js/Express and PostgreSQL web application for visualizing gene regulatory networks, maintained across a production client and a React/Vite rewrite.',
    ],
  },
  {
    id: 'uw-research',
    kind: 'research',
    title: 'Simulating Dashboard Interactions',
    org: 'University of Washington',
    location: 'Seattle, WA and Remote',
    dates: 'May 2026 – Present',
    bullets: [
      'Developed a database benchmark that simulates interactive data exploration for more realistic query workloads.',
      'Designed a text-based dashboard representation enabling LLM agents to interpret and act on visualizations.',
      'Built an LLM agent environment and harness system to interact with visualization dashboards.',
      'Co-authoring a research paper documenting the framework and its evaluation.',
    ],
  },
  {
    id: 'lmu-ta',
    kind: 'work',
    title: 'Lab Teaching Assistant',
    org: 'Loyola Marymount University',
    location: 'Los Angeles, CA',
    dates: 'Aug 2025 – Present',
    bullets: [
      'Guide students through debugging and CS coursework, adapting explanations to individual skill levels while preserving independent problem solving.',
    ],
  },
  {
    id: 'kollective',
    kind: 'work',
    title: 'Data Engineering Intern',
    org: 'Kollective Technology',
    location: 'Bend, OR',
    dates: 'Jun – Aug 2025',
    bullets: [
      'Integrated Marimo Python notebooks into the data engineering workflow, designing and testing templates that connect to Trino Iceberg and Citus PostgreSQL data lakes.',
      'Built querying, transformation, and visualization functionality using Pandas, Ibis, Altair, and advanced JSON parsing to deliver analytics insights.',
      'Drove adoption across a team of 10 engineers through demos and presentations, making analytics code more reactive, reproducible, and git-friendly.',
    ],
  },
  {
    id: 'lmu',
    kind: 'education',
    title: 'BS Computer Science, Minor in Mathematics',
    org: 'Loyola Marymount University',
    location: 'Los Angeles, CA',
    dates: 'Aug 2025 – May 2028',
    bullets: ['GPA: 4.00'],
  },
  {
    id: 'uo',
    kind: 'education',
    title: 'BS Computer Science (transferred)',
    org: 'University of Oregon',
    location: 'Eugene, OR',
    dates: 'Sept 2024 – Jun 2025',
    bullets: ['GPA: 3.95'],
  },
]

/**
 * The résumé PDF in /public. The only place this path is defined.
 * NOTE: the current file includes a phone number; swap in the owner's web copy (without it)
 * before deploying.
 */
export const resumeHref = '/good-resume.pdf'
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
