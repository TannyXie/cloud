import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { CreateProject } from '@/lib/projects-api/generated'
import { NewProjectDialog } from './new-project-dialog'

/** Renders the dialog open, as the project menu leaves it, with `onCreate` answering the submits. */
function renderDialog(onCreate: (input: CreateProject) => Promise<string | undefined>) {
  function Host() {
    const [open, setOpen] = useState(true)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          打开
        </button>
        <NewProjectDialog open={open} onOpenChange={setOpen} onCreate={onCreate} />
      </>
    )
  }
  render(<Host />)
  return {
    url: () => screen.getByLabelText('仓库地址'),
    branch: () => screen.getByLabelText('默认分支'),
    name: () => screen.getByLabelText('项目名'),
    submit: () => screen.getByRole('button', { name: /新建项目|正在克隆仓库/ }),
  }
}

/** A creation that stays in flight until the test settles it. */
function inFlight() {
  let settle!: (failure?: string) => void
  const onCreate = vi.fn(() => new Promise<string | undefined>((r) => (settle = r)))
  return { onCreate, settle: (failure?: string) => settle(failure) }
}

describe('NewProjectDialog', () => {
  it('names the project after the repository until the name is edited, with main as the branch', async () => {
    const f = renderDialog(vi.fn())
    expect(f.branch()).toHaveValue('main')
    await userEvent.type(f.url(), 'https://github.com/ora-space/cloud.git/')
    expect(f.name()).toHaveValue('cloud')
    await userEvent.clear(f.name())
    await userEvent.type(f.name(), 'Ora 云端')
    await userEvent.clear(f.url())
    await userEvent.type(f.url(), 'https://github.com/ora-space/desktop')
    expect(f.name()).toHaveValue('Ora 云端')
  })

  it('shows the clone in progress and takes no second submit or dismissal meanwhile', async () => {
    const { onCreate, settle } = inFlight()
    const f = renderDialog(onCreate)
    await userEvent.type(f.url(), 'https://github.com/octocat/Hello-World')
    await userEvent.click(f.submit())
    expect(f.submit()).toBeDisabled()
    expect(f.submit()).toHaveTextContent('正在克隆仓库…')
    expect(f.url()).toBeDisabled()
    expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
    await userEvent.type(f.branch(), '{Enter}')
    await userEvent.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: '新建项目' })).toBeInTheDocument()
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onCreate).toHaveBeenCalledWith({ name: 'Hello-World', repositoryUrl: 'https://github.com/octocat/Hello-World', defaultBranch: 'main' })

    settle()
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('keeps what was typed when creation fails, and lets it be submitted again', async () => {
    const { onCreate, settle } = inFlight()
    const f = renderDialog(onCreate)
    await userEvent.type(f.url(), 'https://github.com/octocat/missing')
    await userEvent.click(f.submit())
    settle('无法克隆这个仓库')
    expect(await screen.findByRole('alert')).toHaveTextContent('无法克隆这个仓库')
    expect(f.url()).toHaveValue('https://github.com/octocat/missing')
    expect(f.submit()).toBeEnabled()

    await userEvent.click(f.submit())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onCreate).toHaveBeenCalledTimes(2)
  })

  it('passes an optional repository token without echoing it', async () => {
    const onCreate = vi.fn(async () => undefined)
    const f = renderDialog(onCreate)
    await userEvent.type(f.url(), 'https://github.com/octocat/private')
    await userEvent.type(screen.getByLabelText('仓库令牌（私有仓库选填）'), 's3cr3t')
    await userEvent.click(f.submit())
    await vi.waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ repositoryUrl: 'https://github.com/octocat/private', repositoryToken: 's3cr3t' }),
      ),
    )
  })

  it('starts empty again after a project is created', async () => {
    const f = renderDialog(vi.fn(async () => undefined))
    await userEvent.type(f.url(), 'https://github.com/octocat/Hello-World')
    await userEvent.click(f.submit())
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: '打开' }))
    expect(f.url()).toHaveValue('')
    expect(f.name()).toHaveValue('')
  })
})
