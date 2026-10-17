// Guards for unattended runs (an active work order, which `away` also writes). Pure and best effort:
// they catch the usual spellings, they are not a sandbox.
export type Call = { tool: string; command?: string; file_path?: string; notebook_path?: string }

// git push with --force, --force-with-lease, a short -f (also inside a cluster like -uf) or a +refspec.
const FORCE_PUSH = /\bgit\s+(?:-\S+\s+(?:\S+\s+)?)*push\b[^;&|\n]*?(?:\s--force\b|\s-[a-zA-Z]*f[a-zA-Z]*(?=\s|$)|\s\+[^\s+])/

export function forcePush(command: string): boolean {
  return FORCE_PUSH.test(command)
}

// CI definitions and Claude settings: unattended runs read them, never change them.
const PROTECTED = /(^|[/\s'"=])(\.github\/(workflows|actions)\/|\.circleci\/|\.gitlab-ci\.ya?ml(?=$|[\s'";&|)])|\.travis\.yml(?=$|[\s'";&|)])|\.drone\.yml(?=$|[\s'";&|)])|bitbucket-pipelines\.yml(?=$|[\s'";&|)])|azure-pipelines[^/]*\.ya?ml(?=$|[\s'";&|)])|Jenkinsfile(?=$|[\s'";&|)])|\.claude\/settings(\.local)?\.json(?=$|[\s'";&|)]))/
const WRITES = /(?:>|\btee\b|\bsed\s+-[a-zA-Z]*i|\bperl\s+-[a-zA-Z]*i|\bmv\b|\bcp\b|\brm\b|\btruncate\b|\bgit\s+(?:rm|mv|checkout|restore|apply)\b|\bpython3?\s+-c\b|\bnode\s+-e\b)/

export function protectedPath(path: string): boolean {
  return PROTECTED.test(path.replace(/\\/g, '/'))
}

// A command that names a protected file and also writes, moves or removes.
export function bashTouchesProtected(command: string): boolean {
  return PROTECTED.test(command.replace(/\\/g, '/')) && WRITES.test(command)
}

export const DOC_EXT = /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|epub)$/i

// Where the text copy of a document input lives.
export function textCopyPath(path: string): string {
  const base = path.replace(/\\/g, '/').split('/').pop() ?? path
  return `.claude/inputs/${base}.txt`
}

// Why a call is refused while a work order is active, or undefined. Document reads need state and are handled by the caller.
export function unattendedDeny(c: Call): string | undefined {
  if (c.tool === 'Bash' && c.command) {
    if (forcePush(c.command)) {
      return 'unattended runs never force-push. Push normally; if the branch has diverged, merge the remote in. Mark the item blocked ([!]) in the work order if that is not enough.'
    }
    if (bashTouchesProtected(c.command)) {
      return 'unattended runs do not edit CI definitions or Claude settings. Mark the item blocked ([!]) in the work order with the change you wanted; the user decides.'
    }
  }
  if (['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(c.tool)) {
    const path = c.file_path ?? c.notebook_path ?? ''
    if (path && protectedPath(path)) {
      return `unattended runs do not edit ${path} (CI definitions and Claude settings are the user's). Mark the item blocked ([!]) in the work order with the change you wanted.`
    }
  }
  return undefined
}
