'use client'

import { useEffect } from 'react'
import { markEnquiryViewedAction } from '../actions'

export function MarkEnquiryViewed({ id }: { id: string }) {
  useEffect(() => {
    void markEnquiryViewedAction(id)
  }, [id])
  return null
}
