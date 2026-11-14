import { LoaderCircleIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { CreateProject } from '@/lib/projects-api/generated'

/** The name a repository suggests for its project: the last part of its address, without `.git`. */
function nameOf(repositoryUrl: string): string {
  return repositoryUrl.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').replace(/\.git$/, '').split('/').at(-1) ?? ''
}

const empty = { repositoryUrl: '', defaultBranch: 'main', name: '', repositoryToken: '' }

/**
 * Asks for the repository a new project comes from. The backend clones it before answering, which
 * can take a while, so the dialog stays open until it has; a failure keeps what was typed. A private
 * repository can supply an HTTPS token; it is stored encrypted and never returned.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Resolves to why the project could not be created, if it could not. */
  onCreate: (input: CreateProject) => Promise<string | undefined>
}) {
  const [form, setForm] = useState(empty)
  // The name follows the address until it is edited.
  const [named, setNamed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const name = named ? form.name : nameOf(form.repositoryUrl)
  const reset = () => (setForm(empty), setNamed(false), setError(undefined))

  const submit = async () => {
    const input = {
      name: name.trim(),
      repositoryUrl: form.repositoryUrl.trim(),
      defaultBranch: form.defaultBranch.trim(),
      repositoryToken: form.repositoryToken.trim() || undefined,
    }
    if (busy || !input.name || !input.repositoryUrl || !input.defaultBranch) return
    setBusy(true)
    setError(undefined)
    const failure = await onCreate(input)
    setBusy(false)
    if (failure) return setError(failure)
    reset()
    onOpenChange(false)
  }

  return (
    // While the clone runs the dialog cannot be dismissed: its result still has to be shown.
    <Dialog open={open} onOpenChange={(o) => busy || (onOpenChange(o), o || reset())}>
      <DialogContent>
        <form
          className="contents"
          onSubmit={(e) => {
            e.preventDefault()
            void submit()
          }}
        >
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>云端会克隆这个仓库，项目里的每个对话都从这个分支开始。</DialogDescription>
          </DialogHeader>
          <fieldset disabled={busy} className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-project-url">仓库地址</Label>
              <Input
                id="new-project-url"
                placeholder="https://github.com/owner/repo.git"
                autoFocus
                required
                value={form.repositoryUrl}
                onChange={(e) => setForm({ ...form, repositoryUrl: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-project-branch">默认分支</Label>
              <Input
                id="new-project-branch"
                required
                value={form.defaultBranch}
                onChange={(e) => setForm({ ...form, defaultBranch: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-project-token">仓库令牌（私有仓库选填）</Label>
              <Input
                id="new-project-token"
                type="password"
                placeholder="HTTPS 令牌，不会显示"
                autoComplete="off"
                value={form.repositoryToken}
                onChange={(e) => setForm({ ...form, repositoryToken: e.target.value })}
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-project-name">项目名</Label>
              <Input id="new-project-name" required value={name} onChange={(e) => (setNamed(true), setForm({ ...form, name: e.target.value }))} />
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" disabled={busy} />}>取消</DialogClose>
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircleIcon className="animate-spin" />}
              {busy ? '正在克隆仓库…' : '新建项目'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
