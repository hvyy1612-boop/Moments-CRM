import { startTransition, type FormEvent } from 'react'

export function submitKeepingValues(dispatch: (formData: FormData) => void, check?: (formData: FormData) => boolean) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    const formData = new FormData(event.currentTarget, submitter)
    if (check && !check(formData)) return
    startTransition(() => dispatch(formData))
  }
}
