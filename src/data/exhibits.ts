export type ExhibitId =
  | 'projects'
  | 'about'
  | 'skills'
  | 'experience'
  | 'resume'
  | 'cv'

/** Where the exhibit's doorway sits in the lobby. */
export type LobbyWall = 'back' | 'left' | 'right'

export interface Exhibit {
  id: ExhibitId
  /** Roman numeral shown on placards, e.g. "I". */
  number: string
  title: string
  /** One-line description engraved under the title. */
  subtitle: string
  wall: LobbyWall
  grand?: boolean
}

/** Order here is the order doorways appear on each wall and in the map. */
export const exhibits: Exhibit[] = [
  { id: 'about', number: 'I', title: 'About', subtitle: 'The engineer behind the work', wall: 'back' },
  { id: 'projects', number: 'II', title: 'Projects Gallery', subtitle: 'The permanent collection', wall: 'back', grand: true },
  { id: 'skills', number: 'III', title: 'Skills', subtitle: 'Tools of the trade', wall: 'back' },
  { id: 'experience', number: 'IV', title: 'Experience & Education', subtitle: 'A chronology', wall: 'right' },
  { id: 'resume', number: 'V', title: 'Résumé', subtitle: 'The one-page summary', wall: 'left' },
  { id: 'cv', number: 'VI', title: 'Curriculum Vitae', subtitle: 'The complete record', wall: 'left' },
]

export function findExhibit(id: string): Exhibit | undefined {
  return exhibits.find((e) => e.id === id)
}
