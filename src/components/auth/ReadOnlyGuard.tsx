'use client'

import { useEffect } from 'react'

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
