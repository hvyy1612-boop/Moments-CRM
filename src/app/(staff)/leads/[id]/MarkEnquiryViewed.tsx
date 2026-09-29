'use client'

import { useEffect } from 'react'
import { markEnquiryViewedAction } from '../actions'

/**
 * Marks an enquiry as read the first time its detail page is actually opened (Gmail-style). Runs in a
 * client effect - so it fires on a real view, not on Next's route prefetch - then the server action
 * clears the "new" bold row and the nav dot. Renders nothing.
 */
export function MarkEnquiryViewed({ id }: { id: string }) {
  useEffect(() => {
    void markEnquiryViewedAction(id)
  }, [id])
  return null
}
