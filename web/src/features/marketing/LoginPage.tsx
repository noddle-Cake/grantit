import { AlertOctagon, ArrowLeft, ArrowRight } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { Button, Field, Input } from '@/components/ui'
import { useAuth } from '@/lib/auth'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const errorId = useId()

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (signIn(username, password)) {
      navigate('/app', { replace: true })
    } else {
      setError('That username or password is incorrect.')
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-canvas">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <Link to="/" className="mb-8 inline-flex items-center gap-1.5 text-sm text-slate-2 hover:text-slate">
          <ArrowLeft size={16} /> Back to home
        </Link>

        <div className="rounded-lg border border-line-2 bg-surface p-7 shadow-sm">
          <div className="mb-6 flex items-center rounded-lg bg-obsidian px-2 py-1 w-fit">
            <Logo />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-2">Sign in to your grant workspace.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4" noValidate>
            <Field label="Username">
              <Input
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => { setUsername(e.target.value); setError('') }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                placeholder="username"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                name="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError('') }}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
              />
            </Field>

            {error && (
              <div id={errorId} role="alert" className="flex items-center gap-2 rounded-[3px] bg-bad-soft px-3 py-2 text-sm text-bad">
                <AlertOctagon size={16} className="shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" icon={<ArrowRight size={18} />}>Sign in</Button>
          </form>

        </div>
      </div>
    </div>
  )
}
