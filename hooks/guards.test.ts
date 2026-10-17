import { test, expect } from 'claude-code/testing'

import { bashTouchesProtected, forcePush, protectedPath, textCopyPath, unattendedDeny } from './guards'

test('force pushes are caught in their usual spellings, and plain pushes are not', () => {
  for (const c of [
    'git push --force', 'git push -f origin main', 'git push origin main --force-with-lease', 'git push -uf origin x',
    'git push origin +main:main', 'git -C repo push --force', 'git add . && git push -f',
  ]) expect(forcePush(c), c).toBe(true)
  for (const c of [
    'git push', 'git push -u origin feature', 'git push --follow-tags', 'git push origin feature-fix',
    'git log --format=%h -f', 'echo "git push" | cat', 'git commit -m "no force push"',
  ]) expect(forcePush(c), c).toBe(false)
})

test('CI definitions and Claude settings are protected paths', () => {
  for (const p of ['.github/workflows/ci.yml', 'a/.github/actions/x/action.yml', '.gitlab-ci.yml', '.circleci/config.yml', 'Jenkinsfile', '.claude/settings.json', '.claude/settings.local.json', 'azure-pipelines.yml', '.github\\workflows\\ci.yml'])
    expect(protectedPath(p), p).toBe(true)
  for (const p of ['src/app.ts', '.claude/work-order.md', '.claude/now.md', 'docs/ci.md', '.github/pull_request_template.md'])
    expect(protectedPath(p), p).toBe(false)
})

test('a shell command that writes a protected file is caught; reading it is not', () => {
  expect(bashTouchesProtected('sed -i s/a/b/ .github/workflows/ci.yml')).toBe(true)
  expect(bashTouchesProtected('echo x >> .claude/settings.json')).toBe(true)
  expect(bashTouchesProtected('rm .gitlab-ci.yml')).toBe(true)
  expect(bashTouchesProtected('sed -i s/a/b/ Jenkinsfile && git add -A')).toBe(true)
  expect(bashTouchesProtected('echo x > .claude/settings.json; ls')).toBe(true)
  expect(bashTouchesProtected('cat .github/workflows/ci.yml')).toBe(false)
  expect(bashTouchesProtected('grep -n run .github/workflows/ci.yml')).toBe(false)
})

test('unattendedDeny names the rule and the way out', () => {
  expect(unattendedDeny({ tool: 'Bash', command: 'git push --force' })).toContain('never force-push')
  expect(unattendedDeny({ tool: 'Edit', file_path: '.github/workflows/ci.yml' })).toContain('blocked ([!])')
  expect(unattendedDeny({ tool: 'Write', file_path: '.claude/settings.json' })).toContain('Claude settings')
  expect(unattendedDeny({ tool: 'NotebookEdit', notebook_path: '.circleci/config.yml' })).toBeDefined()
  expect(unattendedDeny({ tool: 'Edit', file_path: 'src/a.ts' })).toBeUndefined()
  expect(unattendedDeny({ tool: 'Bash', command: 'git push origin feature' })).toBeUndefined()
})

test('the text copy of a document lives under .claude/inputs', () => {
  expect(textCopyPath('docs/spec v2.pdf')).toBe('.claude/inputs/spec v2.pdf.txt')
  expect(textCopyPath('C:\\in\\plan.xlsx')).toBe('.claude/inputs/plan.xlsx.txt')
})
