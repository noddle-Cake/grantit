#!/usr/bin/env node
// Creates the Grantit backlog as GitHub issues from backlog.json:
//   labels → milestones → one parent issue per epic → sub-issues under it.
// Safe to re-run: labels are updated, and issues whose title already exists are skipped.
//
//   node scripts/backlog/create-issues.mjs            # dry run: print what would be created
//   node scripts/backlog/create-issues.mjs --apply    # create on GitHub (needs `gh auth login`)
//   node scripts/backlog/create-issues.mjs --roadmap  # rewrite docs/roadmap.md from backlog.json
//
// Turn on Linear's GitHub Issues Sync BEFORE --apply: the sync only picks up newly created issues.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..', '..')
const backlog = JSON.parse(readFileSync(join(here, 'backlog.json'), 'utf8'))
const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
const repo = process.env.GRANTIT_REPO ?? 'noddle-Cake/grantit'

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (args.has('--roadmap')) {
  writeFileSync(join(root, 'docs', 'roadmap.md'), roadmap())
  console.log('Wrote docs/roadmap.md')
  process.exit(0)
}

console.log(`${apply ? 'Creating' : 'Dry run for'} backlog in ${repo}\n`)

// Labels -----------------------------------------------------------------------
for (const l of backlog.labels) {
  console.log(`label      ${l.name}`)
  if (apply) gh('label', 'create', l.name, '--repo', repo, '--color', l.color, '--description', l.description, '--force')
}

// Milestones -------------------------------------------------------------------
const milestones = apply
  ? JSON.parse(gh('api', `repos/${repo}/milestones?state=all&per_page=100`))
  : []
for (const m of backlog.milestones) {
  if (milestones.some((x) => x.title === m.title)) {
    console.log(`milestone  ${m.title} (exists)`)
    continue
  }
  console.log(`milestone  ${m.title}`)
  if (apply) gh('api', `repos/${repo}/milestones`, '-f', `title=${m.title}`, '-f', `description=${m.description}`)
}

// Issues -----------------------------------------------------------------------
const existing = new Map(
  apply
    ? JSON.parse(gh('issue', 'list', '--repo', repo, '--state', 'all', '--limit', '1000', '--json', 'number,title')).map((i) => [i.title, i.number])
    : [],
)

async function ensureIssue({ title, body, labels, milestone }, indent = '') {
  if (existing.has(title)) {
    console.log(`${indent}issue      #${existing.get(title)} ${title} (exists)`)
    return { number: existing.get(title), created: false }
  }
  console.log(`${indent}issue      ${title}  [${labels.join(', ')}]`)
  if (!apply) return { number: null, created: true }
  const flags = labels.flatMap((l) => ['--label', l])
  const url = gh('issue', 'create', '--repo', repo, '--title', title, '--body', body, '--milestone', milestone, ...flags)
  const number = Number(url.split('/').pop())
  existing.set(title, number)
  await sleep(1500) // stay under GitHub's secondary rate limit for content creation
  return { number, created: true }
}

function linkSubIssue(parent, child) {
  const childId = gh('api', `repos/${repo}/issues/${child}`, '--jq', '.id')
  try {
    gh('api', '-X', 'POST', `repos/${repo}/issues/${parent}/sub_issues`, '-F', `sub_issue_id=${childId}`)
  } catch (e) {
    // 422 when it is already a sub-issue of this parent
    if (!String(e.stderr).includes('422')) throw e
  }
}

let count = 0
for (const epic of backlog.epics) {
  const parent = await ensureIssue({
    title: epic.title,
    milestone: epic.milestone,
    labels: ['epic', ...epic.labels],
    body: `${epic.summary}\n\nThe work is tracked as sub-issues of this epic. Requirements: [docs/requirements.md](https://github.com/${repo}/blob/main/docs/requirements.md) · Feature map: [docs/roadmap.md](https://github.com/${repo}/blob/main/docs/roadmap.md)`,
  })
  count++
  for (const item of epic.issues) {
    const child = await ensureIssue({ ...item, milestone: epic.milestone, body: `${item.body}\n\nPart of: ${epic.title}` }, '  ')
    count++
    if (apply && (parent.created || child.created)) linkSubIssue(parent.number, child.number)
  }
}

console.log(`\n${count} issues ${apply ? 'processed' : 'planned'}.${apply ? '' : ' Re-run with --apply to create them.'}`)

// Roadmap ----------------------------------------------------------------------
function roadmap() {
  const lines = [
    '# Grantit roadmap',
    '',
    'Feature map of the work after the web UI MVP. GitHub issues are the source of truth; Linear mirrors them',
    'through GitHub Issues Sync. Generated from `scripts/backlog/backlog.json` with',
    '`node scripts/backlog/create-issues.mjs --roadmap`. Priorities match [requirements.md](requirements.md).',
    '',
    '```mermaid',
    'flowchart LR',
    ...backlog.milestones.map((m, i) => `  M${i + 1}["${m.title}"]`),
    ...backlog.milestones.slice(1).map((_, i) => `  M${i + 1} --> M${i + 2}`),
    '```',
    '',
  ]
  for (const m of backlog.milestones) {
    lines.push(`## ${m.title}`, '', m.description, '')
    for (const epic of backlog.epics.filter((e) => e.milestone === m.title)) {
      lines.push(`### ${epic.title.replace(/^Epic: /, '')}`, '', epic.summary, '', '| Priority | Issue | Area |', '|---|---|---|')
      for (const i of epic.issues) {
        const prio = i.labels.find((l) => /^P\d$/.test(l)) ?? ''
        const area = i.labels.filter((l) => l.startsWith('area: ')).map((l) => l.slice(6)).join(', ')
        lines.push(`| ${prio} | ${i.title} | ${area} |`)
      }
      lines.push('')
    }
  }
  return lines.join('\n')
}
