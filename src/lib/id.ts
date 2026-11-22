// Real UUIDs, so ids created in the browser are accepted by the database (uuid columns).
export const uid = (): string => crypto.randomUUID()
