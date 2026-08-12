import type { EnquiryStatus, EnquiryType } from '@prisma/client'
import type { Tone } from '@/components/ui/StatusPill'

export const STATUS_TONE: Record<EnquiryStatus, Tone> = {
  NEW: 'info',
  CONTACTED: 'neutral',
  QUOTED: 'neutral',
  WON: 'good',
  LOST: 'bad',
}

export const ENQUIRY_TYPE_LABEL: Record<EnquiryType, string> = {
  WEDDING: 'Wedding',
  MICRO: 'Micro wedding or elopement',
  PORTRAIT: 'Portrait session',
}
