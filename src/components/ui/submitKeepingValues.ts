import { startTransition, type FormEvent } from 'react'

/**
 * Submit a server-action form WITHOUT React 19's automatic form reset. With `<form action={fn}>` React resets
 * the form after every action - a refused save included. A controlled `<select>` or checkbox then shows blank
 * (or unticked) while its state still holds the choice, so the next Save says "Please choose a job type" for a
 * job type staff did choose. Use `onSubmit={submitKeepingValues(action)}` instead of `action={action}`: every
 * field keeps what staff entered, and `pending` from useActionState works as before.
 *
 * `check` runs the browser-side validation first; returning false stops the submit (errors stay on screen).
 */
export function submitKeepingValues(dispatch: (formData: FormData) => void, check?: (formData: FormData) => boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    if (check && !check(formData)) return
    startTransition(() => dispatch(formData))
  }
}
