'use client'

import { useEffect } from 'react'

/**
 * Read-only mode for a SUPERVISOR account (the "Examiner" idea): the CRM stays fully viewable, but every
 * write is locked in the browser as well as refused on the server.
 *
 * Listeners sit on `window` in the CAPTURE phase, so they run before React's own listeners (React listens
 * on the document): a blocked submit never reaches a server action. Blocked:
 * - every form submit, unless the form is marked `data-allow-readonly` (sign out);
 * - clicks on anything marked `data-write` (e.g. task checkboxes that call an action directly);
 * - dragging (calendar moves).
 * `html[data-readonly]` drives the look in globals.css: submit buttons greyed out, add/create buttons and
 * links to create/edit pages hidden.
 */
export function ReadOnlyGuard({ active }: { active: boolean }) {
  useEffect(() => {
    if (!active) return
    const root = document.documentElement
    root.dataset.readonly = '1'

    let toastEl: HTMLDivElement | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const notify = () => {
      if (!toastEl) {
        toastEl = document.createElement('div')
        toastEl.className = 'readonly-toast'
        toastEl.setAttribute('role', 'status')
        toastEl.textContent = 'Your account is read-only, so changes cannot be saved.'
        document.body.appendChild(toastEl)
      }
      toastEl.dataset.show = '1'
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        if (toastEl) delete toastEl.dataset.show
      }, 3000)
    }
    const block = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      notify()
    }

    const onSubmit = (e: Event) => {
      const form = e.target instanceof HTMLFormElement ? e.target : null
      if (form?.hasAttribute('data-allow-readonly')) return
      block(e)
    }
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-write]')) block(e)
    }
    const onDragStart = (e: DragEvent) => block(e)

    window.addEventListener('submit', onSubmit, true)
    window.addEventListener('click', onClick, true)
    window.addEventListener('dragstart', onDragStart, true)
    return () => {
      window.removeEventListener('submit', onSubmit, true)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('dragstart', onDragStart, true)
      delete root.dataset.readonly
      if (timer) clearTimeout(timer)
      toastEl?.remove()
    }
  }, [active])

  return null
}
