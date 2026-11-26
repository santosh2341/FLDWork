import type { Employee } from '../types'

// Employees marked inactive keep their name on past work but drop out of the pickers for new work.
export const isActive = (e: Employee) => e.active !== false

// Pickers: active people, plus whoever is already selected (so editing an old visit still shows its person).
export const pickable = (list: Employee[], keepId?: string) => list.filter((e) => isActive(e) || e.id === keepId)
