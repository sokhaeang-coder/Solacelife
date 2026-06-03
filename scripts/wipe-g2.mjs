// ─────────────────────────────────────────────────────────────────
//  Solace Life — Full wipe: delete ALL users and their data
//
//  Run from Terminal:
//    cd ~/Documents/Claude/Projects/New-Ai-App-Idea/Solace-Life
//    node scripts/wipe-g2.mjs
// ─────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = 'https://yfthwahxahjabfbuntys.supabase.co'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdGh3YWh4YWhqYWJmYnVudHlzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODYxMTgzMCwiZXhwIjoyMDk0MTg3ODMwfQ.lHMDYmBH3TCeOsX-4sQqNEQzwufjSqbb7NZKVsGOnIY'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
  // ── 1. List all users ──────────────────────────────────────────
  const { data: { users }, error: listErr } = await supabase.auth.admin.listUsers()
  if (listErr) { console.error('❌ Could not list users:', listErr.message); process.exit(1) }

  console.log('\n── Current users ──────────────────────────────────')
  users.forEach(u => console.log(`  ${u.email ?? '(no email)'}  [${u.id}]`))

  if (users.length === 0) {
    console.log('\n✅ Already empty — nothing to delete.')
    return
  }

  const allIds = users.map(u => u.id)

  // ── 2. Clear all public table rows ────────────────────────────
  const steps = [
    { table: 'scheduled_deliveries', col: 'user_id' },
    { table: 'memories',             col: 'user_id' },
    { table: 'family_members',       col: 'user_id' },
    { table: 'user_occasions',       col: 'user_id' },
    { table: 'profiles',             col: 'id'      },
  ]

  for (const { table, col } of steps) {
    const { error } = await supabase.from(table).delete().in(col, allIds)
    if (error) console.warn(`  ⚠️  ${table}: ${error.message}`)
    else       console.log(`  ✓  cleared ${table}`)
  }

  // ── 3. Delete all auth accounts ───────────────────────────────
  for (const user of users) {
    const { error } = await supabase.auth.admin.deleteUser(user.id)
    if (error) console.warn(`  ⚠️  auth delete ${user.email}: ${error.message}`)
    else       console.log(`  ✓  deleted auth user: ${user.email ?? user.id}`)
  }

  console.log('\n✅ Full wipe complete — ready for fresh G1/G2 test.\n')
}

main()
