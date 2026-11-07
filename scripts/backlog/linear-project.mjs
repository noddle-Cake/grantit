#!/usr/bin/env node
// Puts the GitHub-synced backlog into a Linear project:
//   creates project "Grantit" with one project milestone per GitHub milestone (M1–M4),
//   then sets each synced issue's project and milestone from its GitHub milestone.
// Only Linear-side fields are touched; GitHub stays the source of truth for the issues.
//
//   LINEAR_API_KEY=lin_api_… node scripts/backlog/linear-project.mjs            # dry run
//   LINEAR_API_KEY=lin_api_… node scripts/backlog/linear-project.mjs --apply
//   options: --team KEY (if the workspace has several teams), --name "Project name"
//
// Create the key in Linear: Settings → Account → Security & access → Personal API keys.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const backlog = JSON.parse(readFileSync(join(here, 'backlog.json'), 'utf8'))
const argv = process.argv.slice(2)
const opt = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const apply = argv.includes('--apply')
const projectName = opt('--name') ?? 'Grantit'
const teamKey = opt('--team')
const repo = process.env.GRANTIT_REPO ?? 'noddle-Cake/grantit'
const key = process.env.LINEAR_API_KEY
if (!key) {
  console.error('Set LINEAR_API_KEY (Linear → Settings → Account → Security & access → Personal API keys).')
  process.exit(1)
}

async function linear(query, variables = {}) {
  const res = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors, null, 2))
  return json.data
}

// GitHub: issue number → milestone title -------------------------------------------
const ghIssues = JSON.parse(
  execFileSync('gh', ['issue', 'list', '--repo', repo, '--state', 'all', '--limit', '1000', '--json', 'number,title,milestone,url'], { encoding: 'utf8' }),
)
const backlogTitles = new Set(backlog.epics.flatMap((e) => [e.title, ...e.issues.map((i) => i.title)]))
const wanted = ghIssues.filter((i) => backlogTitles.has(i.title) && i.milestone)

// Linear: team ------------------------------------------------------------------------
const { teams } = await linear('{ teams(first: 50) { nodes { id key name } } }')
let team
if (teamKey) team = teams.nodes.find((t) => t.key === teamKey)
else if (teams.nodes.length === 1) team = teams.nodes[0]
if (!team) {
  console.error(`Pick the team the GitHub sync feeds with --team. Teams: ${teams.nodes.map((t) => `${t.key} (${t.name})`).join(', ')}`)
  process.exit(1)
}
console.log(`${apply ? 'Applying' : 'Dry run'}: project "${projectName}" in team ${team.key} (${team.name})\n`)

// Linear: synced issues in the team, matched by GitHub URL attachment, then title ------
const linearIssues = []
for (let after = null; ; ) {
  const d = await linear(
    `query($team: String!, $after: String) {
      team(id: $team) { issues(first: 100, after: $after) {
        nodes { id identifier title url project { id } projectMilestone { id } attachments { nodes { url } } }
        pageInfo { hasNextPage endCursor } } } }`,
    { team: team.id, after },
  )
  linearIssues.push(...d.team.issues.nodes)
  if (!d.team.issues.pageInfo.hasNextPage) break
  after = d.team.issues.pageInfo.endCursor
}
const byUrl = new Map()
for (const li of linearIssues) for (const a of li.attachments.nodes) byUrl.set(a.url.replace(/\/$/, ''), li)
const byTitle = new Map(linearIssues.map((li) => [li.title, li]))

// Project and milestones -----------------------------------------------------------------
const found = await linear(
  `query($name: String!) { projects(filter: { name: { eq: $name } }) {
     nodes { id name url projectMilestones { nodes { id name } } } } }`,
  { name: projectName },
)
// Project overview: the requirements with their build status, plus a pointer to the roadmap.
const content = [
  `Issues live in GitHub ([${repo}](https://github.com/${repo}/issues)) and sync here; edit them on GitHub.`,
  `Feature map: [docs/roadmap.md](https://github.com/${repo}/blob/main/docs/roadmap.md)`,
  '',
  readFileSync(join(here, '..', '..', 'docs', 'requirements.md'), 'utf8').replace(/^# .*\n/, ''),
].join('\n')

let project = found.projects.nodes[0]
if (project) {
  console.log(`project    ${project.name} (exists, refreshing overview) ${project.url}`)
  if (apply)
    await linear(`mutation($id: String!, $input: ProjectUpdateInput!) { projectUpdate(id: $id, input: $input) { success } }`, {
      id: project.id,
      input: { content },
    })
} else {
  console.log(`project    ${projectName}`)
  if (apply) {
    const d = await linear(
      `mutation($input: ProjectCreateInput!) { projectCreate(input: $input) {
         project { id name url projectMilestones { nodes { id name } } } } }`,
      {
        input: {
          name: projectName,
          teamIds: [team.id],
          description: 'Grant management for small nonprofits. Issues are synced from GitHub; roadmap in docs/roadmap.md.',
          content,
        },
      },
    )
    project = d.projectCreate.project
    console.log(`           created ${project.url}`)
  }
}

const milestoneIds = new Map(project?.projectMilestones.nodes.map((m) => [m.name, m.id]) ?? [])
for (const [sortOrder, m] of backlog.milestones.entries()) {
  if (milestoneIds.has(m.title)) {
    console.log(`milestone  ${m.title} (exists)`)
    continue
  }
  console.log(`milestone  ${m.title}`)
  if (apply) {
    const d = await linear(
      `mutation($input: ProjectMilestoneCreateInput!) { projectMilestoneCreate(input: $input) { projectMilestone { id name } } }`,
      { input: { projectId: project.id, name: m.title, description: m.description, sortOrder } },
    )
    milestoneIds.set(m.title, d.projectMilestoneCreate.projectMilestone.id)
  }
}

// Assign issues ---------------------------------------------------------------------------
let updated = 0
const missing = []
for (const gi of wanted.sort((a, b) => a.number - b.number)) {
  const li = byUrl.get(gi.url) ?? byTitle.get(gi.title)
  if (!li) {
    missing.push(`#${gi.number} ${gi.title}`)
    continue
  }
  const milestoneId = milestoneIds.get(gi.milestone.title)
  if (project && li.project?.id === project.id && li.projectMilestone?.id === milestoneId) continue
  console.log(`issue      ${li.identifier} ← #${gi.number} ${gi.title}  → ${gi.milestone.title}`)
  if (apply) {
    await linear(`mutation($id: String!, $input: IssueUpdateInput!) { issueUpdate(id: $id, input: $input) { success } }`, {
      id: li.id,
      input: { projectId: project.id, projectMilestoneId: milestoneId },
    })
  }
  updated++
}

console.log(`\n${updated} issue(s) ${apply ? 'moved into the project' : 'to move'}.`)
if (missing.length) console.log(`Not found in Linear team ${team.key} (not synced?):\n  ${missing.join('\n  ')}`)
if (!apply) console.log('Re-run with --apply to make the changes.')
