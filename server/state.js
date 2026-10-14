export function createState() {
  return {
    checks: [],
    startedAt: Date.now(),
  }
}

const shared = createState()

export function getSharedState() {
  return shared
}
